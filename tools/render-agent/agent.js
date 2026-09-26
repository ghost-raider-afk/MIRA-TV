import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const AGENT_VERSION = '0.1.0-pilot';
const DEFAULT_PORT = 41417;
const tasks = new Map();

function arg(name, fallback = '') {
  const prefix = '--' + name + '=';
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

const allowedOrigin = normalizedOrigin(arg('server', process.env.MIRA_SERVER_ORIGIN));
if (!allowedOrigin) {
  console.error('Usage: node tools/render-agent/agent.js --server=https://mira.example');
  process.exit(2);
}
const listenPort = Math.max(1024, Math.min(65535, Number(arg('port', process.env.MIRA_RENDER_AGENT_PORT || DEFAULT_PORT)) || DEFAULT_PORT));

function corsHeaders(request) {
  const origin = normalizedOrigin(request.headers.origin);
  const allowed = origin === allowedOrigin;
  return {
    ...(allowed ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    'access-control-allow-private-network': 'true',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
}

function sendJson(response, status, body, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type':'application/json; charset=utf-8',
    'content-length':String(bytes.length),
    ...headers
  });
  response.end(bytes);
}

function readJson(request, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large.'), { status:413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON body.'), { status:400 })); }
    });
    request.on('error', reject);
  });
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function findBrowser() {
  const explicit = process.env.MIRA_RENDER_BROWSER_PATH || process.env.CHROME_PATH;
  if (explicit && await exists(explicit)) return explicit;

  const candidates = [];
  if (process.platform === 'win32') {
    for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge');
  }
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error('Chrome/Edge/Chromium не найден. Укажите MIRA_RENDER_BROWSER_PATH.');
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function startBrowser(executable, profileDirectory) {
  const args = [
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profileDirectory,
    'about:blank'
  ];
  const child = spawn(executable, args, { stdio:['ignore','ignore','pipe'], windowsHide:true });
  let stderr = '';
  const devtools = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      stderr = (stderr + String(chunk)).slice(-32000);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        child.stderr.off('data', onData);
        resolve(match[1]);
      }
    };
    child.stderr.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error('Browser exited before DevTools became ready (code ' + code + ').')));
  });
  const wsUrl = await withTimeout(devtools, 20000, 'Browser DevTools startup timed out.');
  return { child, wsUrl, stderr:() => stderr };
}

async function connectCdp(url) {
  const socket = new WebSocket(url, { perMessageDeflate:false });
  await withTimeout(new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  }), 10000, 'DevTools connection timed out.');

  let sequence = 0;
  const pending = new Map();
  socket.on('message', (payload) => {
    let message;
    try { message = JSON.parse(String(payload)); } catch { return; }
    if (!message?.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || 'DevTools command failed.'));
    else waiter.resolve(message.result || {});
  });
  socket.on('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('DevTools connection closed.'));
    pending.clear();
  });

  return {
    async send(method, params = {}, sessionId = undefined) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
        catch (error) { pending.delete(id); reject(error); }
      });
    },
    close() {
      try { socket.close(); } catch {}
    }
  };
}

async function waitForSurface(cdp, sessionId) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await cdp.send('Runtime.evaluate', {
      expression:'window.__miraRenderSurface ? ({ready:window.__miraRenderSurface.ready,error:window.__miraRenderSurface.error||""}) : ({ready:false,error:""})',
      returnByValue:true
    }, sessionId);
    const value = result?.result?.value || {};
    if (value.ready === true) return;
    if (value.error) throw new Error(value.error);
    await wait(100);
  }
  throw new Error('Render Surface did not become ready.');
}

function processDone(child, stderr, label, timeoutMs = 120000) {
  return withTimeout(new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(label + ' exited with code ' + code + (stderr.value ? ': ' + stderr.value.slice(-3000) : '')));
    });
  }), timeoutMs, label + ' timed out.');
}

async function writeFrame(stream, bytes) {
  if (stream.write(bytes)) return;
  await new Promise((resolve, reject) => {
    const onDrain = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      stream.off('drain', onDrain);
      stream.off('error', onError);
    };
    stream.once('drain', onDrain);
    stream.once('error', onError);
  });
}

async function fetchPackage(job) {
  const url = new URL('/api/render-agent/context', allowedOrigin);
  url.searchParams.set('token', job.token);
  const response = await fetch(url, { cache:'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || ('Render context HTTP ' + response.status));
  }
  const value = await response.json();
  if (value.input_hash !== job.input_hash || Number(value.render_revision) !== Number(job.render_revision)) {
    throw new Error('Render package changed before local render started.');
  }
  if (value.bake_supported !== true) throw new Error('Scene requires live renderer: ' + String(value.unsupported_reason || 'unsupported'));
  return value;
}

async function encodeTask(task, job) {
  task.status = 'preparing';
  const renderPackage = await fetchPackage(job);
  const browserExecutable = await findBrowser();
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), 'mira-render-agent-'));
  const profileDirectory = path.join(workingDirectory, 'browser');
  const output = path.join(workingDirectory, 'scene.mp4');
  let browser = null;
  let cdp = null;
  let ffmpeg = null;

  try {
    task.status = 'rendering';
    browser = await startBrowser(browserExecutable, profileDirectory);
    cdp = await connectCdp(browser.wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url:'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten:true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width:renderPackage.screen.width,
      height:renderPackage.screen.height,
      deviceScaleFactor:1,
      mobile:false,
      screenWidth:renderPackage.screen.width,
      screenHeight:renderPackage.screen.height
    }, sessionId);

    const surfaceUrl = new URL('/render-agent.html', allowedOrigin);
    surfaceUrl.searchParams.set('token', job.token);
    await cdp.send('Page.navigate', { url:surfaceUrl.href }, sessionId);
    await waitForSurface(cdp, sessionId);

    const fps = Number(renderPackage.target.fps) || 25;
    const durationMs = Number(renderPackage.target.loop_duration_ms) || 12000;
    const frameCount = Math.round(durationMs * fps / 1000);
    const stderr = { value:'' };
    ffmpeg = spawn(ffmpegPath(), [
      '-hide_banner','-loglevel','error','-y',
      '-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0',
      '-an','-c:v','libx264','-preset','veryfast','-crf','20',
      '-pix_fmt','yuv420p','-movflags','+faststart','-f','mp4',output
    ], { stdio:['pipe','ignore','pipe'], windowsHide:true });
    ffmpeg.stderr.on('data', (chunk) => { stderr.value = (stderr.value + String(chunk)).slice(-16000); });

    for (let frame = 0; frame < frameCount; frame += 1) {
      const milliseconds = Math.round(frame * 1000 / fps);
      await cdp.send('Runtime.evaluate', {
        expression:'window.__miraRenderSurface.seek(' + milliseconds + ')',
        awaitPromise:true,
        returnByValue:true
      }, sessionId);
      const shot = await cdp.send('Page.captureScreenshot', {
        format:'jpeg',
        quality:92,
        fromSurface:true,
        captureBeyondViewport:false
      }, sessionId);
      if (!shot?.data) throw new Error('Browser returned an empty frame.');
      await writeFrame(ffmpeg.stdin, Buffer.from(shot.data, 'base64'));
      task.progress = Math.min(90, Math.round((frame + 1) / frameCount * 90));
    }

    ffmpeg.stdin.end();
    await processDone(ffmpeg, stderr, 'FFmpeg');
    ffmpeg = null;

    task.status = 'uploading';
    task.progress = 94;
    const info = await stat(output);
    const uploadUrl = new URL(job.upload_url, allowedOrigin);
    if (uploadUrl.origin !== allowedOrigin || !uploadUrl.pathname.startsWith('/api/render-agent/screens/')) {
      throw new Error('Render upload URL is outside configured MIRA-TV server.');
    }
    const bytes = await readFile(output);
    const response = await fetch(uploadUrl, {
      method:'PUT',
      headers:{
        authorization:'Bearer ' + job.token,
        'content-type':'video/mp4',
        'content-length':String(info.size),
        'x-mira-render-agent-version':AGENT_VERSION
      },
      body:bytes
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || ('Upload HTTP ' + response.status));

    task.status = 'complete';
    task.progress = 100;
    task.result = body;
  } finally {
    try { ffmpeg?.stdin?.destroy(); } catch {}
    try { ffmpeg?.kill('SIGKILL'); } catch {}
    try { await cdp?.send?.('Browser.close'); } catch {}
    try { cdp?.close?.(); } catch {}
    try { browser?.child?.kill('SIGKILL'); } catch {}
    await rm(workingDirectory, { recursive:true, force:true }).catch(() => undefined);
  }
}

function validateJob(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (normalizedOrigin(source.server_origin) !== allowedOrigin) throw Object.assign(new Error('Server origin does not match configured MIRA-TV server.'), { status:400 });
  const screenId = Number(source.screen_id);
  const renderRevision = Number(source.render_revision);
  const inputHash = String(source.input_hash || '').toLowerCase();
  const token = String(source.token || '');
  const uploadUrl = String(source.upload_url || '');
  if (!Number.isSafeInteger(screenId) || screenId < 1) throw Object.assign(new Error('Invalid screen id.'), { status:400 });
  if (!Number.isSafeInteger(renderRevision) || renderRevision < 1) throw Object.assign(new Error('Invalid render revision.'), { status:400 });
  if (!/^[0-9a-f]{64}$/.test(inputHash)) throw Object.assign(new Error('Invalid input hash.'), { status:400 });
  if (token.length < 32 || token.length > 4096) throw Object.assign(new Error('Invalid render token.'), { status:400 });
  if (!uploadUrl.startsWith('/api/render-agent/screens/')) throw Object.assign(new Error('Invalid upload URL.'), { status:400 });
  return { server_origin:allowedOrigin, screen_id:screenId, render_revision:renderRevision, input_hash:inputHash, token, upload_url:uploadUrl };
}

function pruneTasks() {
  const entries = [...tasks.entries()];
  if (entries.length <= 20) return;
  entries.sort((a,b) => a[1].created_at.localeCompare(b[1].created_at));
  for (const [id, task] of entries.slice(0, entries.length - 20)) {
    if (task.status === 'complete' || task.status === 'failed') tasks.delete(id);
  }
}

const server = http.createServer(async (request, response) => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    response.writeHead(normalizedOrigin(request.headers.origin) === allowedOrigin ? 204 : 403, headers);
    response.end();
    return;
  }
  if (normalizedOrigin(request.headers.origin) && normalizedOrigin(request.headers.origin) !== allowedOrigin) {
    sendJson(response, 403, { error:'Origin is not allowed.' }, headers);
    return;
  }

  const url = new URL(request.url || '/', 'http://127.0.0.1');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok:true, version:AGENT_VERSION, server_origin:allowedOrigin }, headers);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/render') {
      const job = validateJob(await readJson(request));
      const taskId = crypto.randomUUID();
      const task = {
        id:taskId,
        status:'queued',
        progress:0,
        created_at:new Date().toISOString(),
        error:'',
        result:null
      };
      tasks.set(taskId, task);
      pruneTasks();
      void encodeTask(task, job).catch((error) => {
        task.status = 'failed';
        task.error = String(error?.message || error);
      });
      sendJson(response, 202, { task_id:taskId, status:task.status }, headers);
      return;
    }
    const match = /^\/tasks\/([0-9a-f-]{36})$/i.exec(url.pathname);
    if (request.method === 'GET' && match) {
      const task = tasks.get(match[1]);
      if (!task) {
        sendJson(response, 404, { error:'Render task not found.' }, headers);
        return;
      }
      sendJson(response, 200, task, headers);
      return;
    }
    sendJson(response, 404, { error:'Not found.' }, headers);
  } catch (error) {
    sendJson(response, Number(error?.status) || 500, { error:String(error?.message || error) }, headers);
  }
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log('MIRA Render Agent ' + AGENT_VERSION);
  console.log('Server: ' + allowedOrigin);
  console.log('Local API: http://127.0.0.1:' + listenPort);
});
