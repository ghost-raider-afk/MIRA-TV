import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createBotTransport } from './http-client.js';
import { extractBotCommand, webhookAllowed, preserveMaxUserIds } from './webhook.js';

export function botRuntimeConfig(env = process.env) {
  const config = {
    port:Number(env.BOT_PORT || 8090),
    apiBaseUrl:env.MIRA_TV_API_BASE_URL || 'http://app:8080',
    internalToken:env.BOT_INTERNAL_API_TOKEN || '',
    telegramEnabled:env.TELEGRAM_BOT_ENABLED === 'true',
    telegramToken:env.TELEGRAM_BOT_TOKEN || '',
    telegramWebhookSecret:env.TELEGRAM_WEBHOOK_SECRET || '',
    maxEnabled:env.MAX_BOT_ENABLED === 'true',
    maxToken:env.MAX_BOT_TOKEN || '',
    maxWebhookSecret:env.MAX_WEBHOOK_SECRET || ''
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 ||
      !/^[a-f0-9]{64}$/.test(config.internalToken) ||
      !/^http:\/\/[a-z0-9.-]+:[0-9]+\/?$/i.test(config.apiBaseUrl) ||
      (!config.telegramEnabled && !config.maxEnabled) ||
      (config.telegramEnabled && (!/^[0-9]{5,16}:[A-Za-z0-9_-]{25,}$/.test(config.telegramToken) ||
        !/^[A-Za-z0-9_-]{32,256}$/.test(config.telegramWebhookSecret))) ||
      (config.maxEnabled && (!config.maxToken || !/^[A-Za-z0-9_-]{32,256}$/.test(config.maxWebhookSecret)))) {
    throw new Error('Bot configuration is invalid. Configure Telegram/MAX secrets and internal API token.');
  }
  return Object.freeze(config);
}

async function readJson(request, provider, limit = 65536) {
  const length = Number(request.headers['content-length']);
  if (length > limit) throw Object.assign(new Error('Payload too large'), { status:413 });
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw Object.assign(new Error('Payload too large'), { status:413 });
    chunks.push(chunk);
  }
  try {
    const raw=Buffer.concat(chunks).toString('utf8');
    return JSON.parse(provider==='max' ? preserveMaxUserIds(raw) : raw);
  }
  catch { throw Object.assign(new Error('Invalid JSON'), { status:400 }); }
}

export function createBotHttpHandler(config, transport = createBotTransport(config)) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control','no-store');
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type':'application/json' });
      return response.end('{"status":"ok"}');
    }
    if (request.method !== 'POST' ||
        !['/webhooks/telegram','/webhooks/max'].includes(request.url)) {
      response.writeHead(404); return response.end();
    }
    const provider = request.url.endsWith('telegram') ? 'telegram' : 'max';
    if (!webhookAllowed(provider, request.headers, config)) {
      response.writeHead(403); return response.end();
    }
    try {
      const update = await readJson(request, provider);
      const command = extractBotCommand(provider, update);
      if (!command) { response.writeHead(200); return response.end(); }
      const answer = await transport.internalCommand(command);
      const text = answer?.unauthorized
        ? 'Доступ к MIRA-TV не назначен. Обратитесь к администратору для привязки ID мессенджера.'
        : String(answer?.text || 'Сведения временно недоступны.');
      if (provider === 'telegram') await transport.telegramSend(command.provider_user_id, text);
      else await transport.maxSend(command.provider_user_id, text);
      response.writeHead(200); return response.end();
    } catch (error) {
      // Non-2xx response asks Telegram/MAX to retry a transient failure.
      const status = error.status === 400 || error.status === 413 ? error.status : 503;
      response.writeHead(status); response.end();
    }
  };
}

export function createBotServer(config, transport) {
  return createServer(createBotHttpHandler(config, transport));
}

// Worker pulls server-issued jobs; DB/outbox leases stay in MIRA-TV app.
// Only one bounded timer; no direct PostgreSQL connectivity from the bot.
export function startBotDeliveryWorker(transport, { intervalMs=10000, onError=()=>{} } = {}) {
  let stopped=false;
  let timer=null;
  let pending=null;
  async function tick() {
    if (stopped) return;
    try {
      const { lease_token:lease, jobs=[] } = await transport.claimJobs();
      for (const job of jobs.slice(0,20)) {
        let success=false;
        try {
          const notice = {
            kind:job.kind,location:job.location,subject:job.subject,
            time:new Date().toISOString(),detail:job.detail
          };
          if (job.provider==='telegram') await transport.telegramNotice(job.recipient,notice);
          else if (job.provider==='max') await transport.maxNotice(job.recipient,notice);
          else throw new Error('Unsupported bot delivery provider.');
          success=true;
        } catch (error) { onError(error); }
        try { await transport.completeJob(job.id,lease,success); }
        catch (error) { onError(error); }
        if (stopped) break;
      }
    } catch (error) { onError(error); }
    if (!stopped) timer=setTimeout(() => { pending=tick(); },Math.max(1000,intervalMs));
  }
  pending=tick();
  return async () => {
    stopped=true;
    if (timer) clearTimeout(timer);
    await pending?.catch(() => undefined);
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = botRuntimeConfig();
  const transport=createBotTransport(config);
  const server = createBotServer(config,transport);
  const stopWorker=startBotDeliveryWorker(transport, {
    onError:(error)=>process.stderr.write('MIRA-TV bot operation failed: ' +
      String(error?.message || 'request error').replaceAll(config.telegramToken,'[token]')
        .replaceAll(config.maxToken || '\0','[token]') + '\n')
  });
  server.listen(config.port, '0.0.0.0', () => {
    process.stdout.write('MIRA-TV bot listening on port ' + config.port + '\n');
  });
  for (const signal of ['SIGINT','SIGTERM']) {
    process.once(signal, async () => { await stopWorker();server.close(); });
  }
}
