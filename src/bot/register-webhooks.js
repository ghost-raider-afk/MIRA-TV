import { fileURLToPath } from 'node:url';
import { botRuntimeConfig } from './runtime.js';

function validDomain(domain) {
  return typeof domain === 'string' && domain.length < 254 &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(domain) && !domain.includes('..');
}

export async function registerBotWebhooks(config, domain, { fetchImpl=fetch } = {}) {
  if (!validDomain(domain)) throw new Error('Invalid bot domain for HTTPS webhook registration.');
  const routes=[];
  if (config.telegramEnabled) {
    routes.push({
      provider:'telegram',
      url:'https://api.telegram.org/bot'+config.telegramToken+'/setWebhook',
      headers:{ 'content-type':'application/json' },
      body:{
        url:'https://'+domain+'/webhooks/telegram',
        secret_token:config.telegramWebhookSecret,
        allowed_updates:['message']
      }
    });
  }
  if (config.maxEnabled) {
    routes.push({
      provider:'max',
      url:'https://platform-api2.max.ru/subscriptions',
      headers:{ 'content-type':'application/json', Authorization:config.maxToken },
      body:{
        url:'https://'+domain+'/webhooks/max',
        update_types:['message_created','bot_started'],
        secret:config.maxWebhookSecret
      }
    });
  }
  const confirmed=[];
  for (const route of routes) {
    const response=await fetchImpl(route.url,{
      method:'POST',headers:route.headers,body:JSON.stringify(route.body),
      signal:AbortSignal.timeout(15000)
    });
    const result=await response.json().catch(()=>({}));
    if (!response.ok || result.ok===false || result.success===false) {
      throw new Error(route.provider + ' webhook registration failed, HTTP '+response.status);
    }
    confirmed.push(route.provider);
  }
  return confirmed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config=botRuntimeConfig();
  const result=await registerBotWebhooks(config,process.env.BOT_DOMAIN);
  process.stdout.write('MIRA-TV HTTPS webhook registered: '+result.join(', ')+'\n');
}
