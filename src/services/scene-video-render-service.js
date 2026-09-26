import crypto from 'node:crypto';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { CONTENT_ASSET_DIR, commitContentAssetTemporary } from './content-addressed-assets.js';

const TOKEN_TTL_MS = 5 * 60 * 1000;

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return {
    width: Math.max(1, Number(match?.[1]) || 1920),
    height: Math.max(1, Number(match?.[2]) || 1080)
  };
}

function withoutWeather(scene) {
  const elements = Array.isArray(scene?.elements)
    ? scene.elements.filter((element) => element?.enabled !== false && element?.type !== 'weather')
    : [];
  return { ...(scene || { version: 1 }), elements };
}

function renderInput(context) {
  return {
    screen: context?.screen || null,
    draft: context?.draft || null,
    products: context?.products || [],
    packaging: context?.packaging || [],
    scene: withoutWeather(context?.scene),
    animation: context?.animation || null,
    renderer_version: 1
  };
}

export function sceneVideoInputHash(context) {
  return digest(renderInput(context));
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

async function fileHash(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function writableWrite(stream, bytes) {
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

async function connectCdp(url) {
  const socket = new WebSocket(url, { perMessageDeflate: false });
  await withTimeout(new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  }), 10_000, 'Chromium DevTools connection timed out.');

  let sequence = 0;
  const pending = new Map();

  socket.on('message', (payload) => {
    let message;
    try { message = JSON.parse(String(payload)); } catch { return; }
    if (!message?.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || 'Chromium DevTools command failed.'));
    else waiter.resolve(message.result || {});
  });
  socket.on('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('Chromium DevTools connection closed.'));
    pending.clear();
  });

  function send(method, params = {}, sessionId = undefined) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  return {
    socket,
    send,
    async close() {
      try { socket.close(); } catch {}
    }
  };
}

async function startChromium(config, profileDirectory, onChild) {
  const executable = String(config.sceneVideoChromiumPath || '/usr/bin/chromium');
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-features=Translate,BackForwardCache',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--disk-cache-size=1',
    '--media-cache-size=1',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profileDirectory,
    'about:blank'
  ];

  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  onChild?.(child);
  let stderr = '';
  const devtools = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      stderr = (stderr + String(chunk)).slice(-32_000);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        child.stderr.off('data', onData);
        resolve(match[1]);
      }
    };
    child.stderr.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error('Chromium exited before DevTools became ready (code ' + code + ').')));
  });
  const wsUrl = await withTimeout(devtools, 20_000, 'Chromium did not expose DevTools in time.');
  return { child, wsUrl, stderr: () => stderr };
}

async function waitForRenderReady(cdp, sessionId) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: 'window.__miraServerRender ? ({ready:window.__miraServerRender.ready,error:window.__miraServerRender.error||""}) : ({ready:false,error:""})',
      returnByValue: true
    }, sessionId);
    const value = result?.result?.value || {};
    if (value.ready === true) return;
    if (value.error) throw new Error('Server render page failed: ' + value.error);
    await wait(100);
  }
  throw new Error('Server render page did not become ready.');
}

async function finishProcess(child, stderrBuffer, timeoutMs, label) {
  return withTimeout(new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(label + ' exited with code ' + code + (stderrBuffer.value ? ': ' + stderrBuffer.value.slice(-4000) : '')));
    });
  }), timeoutMs, label + ' timed out.');
}

async function renderMp4({ config, context, token, temporary, onChild }) {
  const viewport = resolutionOf(context.screen);
  const profileDirectory = path.join('/tmp', 'mira-scene-render-' + crypto.randomUUID());
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
  let chromium = null;
  let cdp = null;
  let ffmpeg = null;

  try {
    chromium = await startChromium(config, profileDirectory, onChild);
    cdp = await connectCdp(chromium.wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height
    }, sessionId);

    const renderUrl = 'http://127.0.0.1:' + String(config.port) + '/__mira/scene-render?token=' + encodeURIComponent(token);
    await cdp.send('Page.navigate', { url: renderUrl }, sessionId);
    await waitForRenderReady(cdp, sessionId);

    const fps = Math.max(10, Math.min(30, Number(config.sceneVideoFps) || 25));
    const durationSeconds = Math.max(4, Math.min(30, Number(config.sceneVideoDurationSeconds) || 12));
    const frameCount = Math.max(1, Math.round(fps * durationSeconds));
    const ffmpegStderr = { value: '' };
    ffmpeg = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0',
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', temporary
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    onChild?.(ffmpeg);
    ffmpeg.stderr.on('data', (chunk) => { ffmpegStderr.value = (ffmpegStderr.value + String(chunk)).slice(-16_000); });

    for (let frame = 0; frame < frameCount; frame += 1) {
      const milliseconds = Math.round(frame * 1000 / fps);
      await cdp.send('Runtime.evaluate', {
        expression: 'window.__miraServerRender.seek(' + String(milliseconds) + ')',
        awaitPromise: true,
        returnByValue: true
      }, sessionId);
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 90,
        fromSurface: true,
        captureBeyondViewport: false
      }, sessionId);
      if (!shot?.data) throw new Error('Chromium returned an empty scene frame.');
      await writableWrite(ffmpeg.stdin, Buffer.from(shot.data, 'base64'));
    }

    ffmpeg.stdin.end();
    await finishProcess(ffmpeg, ffmpegStderr, 120_000, 'FFmpeg scene encoder');
    ffmpeg = null;

    return Object.freeze({
      width: viewport.width,
      height: viewport.height,
      fps,
      duration_ms: Math.round(frameCount * 1000 / fps)
    });
  } finally {
    try { ffmpeg?.stdin?.destroy(); } catch {}
    try { ffmpeg?.kill('SIGKILL'); } catch {}
    try { await cdp?.send?.('Browser.close'); } catch {}
    try { await cdp?.close?.(); } catch {}
    try { chromium?.child?.kill('SIGKILL'); } catch {}
    await rm(profileDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function createSceneVideoRenderService({ config, realtime, logger = console } = {}) {
  const enabled = config?.sceneVideoEnabled === true;
  const renderTokens = new Map();
  const latestByScreen = new Map();
  const readyByScreen = new Map();
  const readyByInputHash = new Map();
  const failedByScreen = new Map();
  const pending = new Set();
  const children = new Set();
  let stopped = false;
  let queue = Promise.resolve();

  function trackChild(child) {
    if (!child) return;
    children.add(child);
    child.once('exit', () => children.delete(child));
  }

  function pruneTokens() {
    const now = Date.now();
    for (const [token, entry] of renderTokens) {
      if (entry.expiresAt <= now) renderTokens.delete(token);
    }
  }

  function createToken(context) {
    pruneTokens();
    const token = crypto.randomBytes(24).toString('base64url');
    renderTokens.set(token, {
      expiresAt: Date.now() + TOKEN_TTL_MS,
      context: structuredClone(context)
    });
    return token;
  }

  function hasRenderToken(token) {
    pruneTokens();
    return renderTokens.has(String(token || ''));
  }

  function contextForToken(token) {
    pruneTokens();
    const entry = renderTokens.get(String(token || ''));
    return entry ? structuredClone(entry.context) : null;
  }

  function runtimeToken(screenId) {
    if (!enabled) return 'disabled';
    const id = Number(screenId);
    const ready = readyByScreen.get(id);
    if (ready?.content_hash) return 'ready:' + ready.content_hash;
    const failed = failedByScreen.get(id);
    if (failed?.input_hash) return 'failed:' + failed.input_hash;
    const latest = latestByScreen.get(id);
    return latest ? 'rendering:' + latest : 'idle';
  }

  function publicComponent(screenId, inputHash) {
    if (!enabled) return Object.freeze({ enabled: false, status: 'disabled', live_layers: Object.freeze(['weather']) });
    const ready = readyByScreen.get(Number(screenId));
    if (ready?.input_hash === inputHash) return ready;
    const failed = failedByScreen.get(Number(screenId));
    return Object.freeze({
      enabled: true,
      status: failed?.input_hash === inputHash ? 'failed' : 'rendering',
      source_url: '',
      content_hash: null,
      input_hash: inputHash,
      live_layers: Object.freeze(['weather'])
    });
  }

  async function execute(job) {
    if (stopped) return;
    const screenId = Number(job.screenId);
    const contentDirectory = path.join(config.siteAssetsRoot, CONTENT_ASSET_DIR);
    await mkdir(contentDirectory, { recursive: true, mode: 0o770 });
    const temporary = path.join(contentDirectory, '.scene-video-' + crypto.randomUUID() + '.mp4.tmp');
    const token = createToken(job.context);

    try {
      const metadata = await renderMp4({
        config,
        context: job.context,
        token,
        temporary,
        onChild: trackChild
      });
      const hash = await fileHash(temporary);
      const descriptor = await commitContentAssetTemporary(temporary, { hash, extension: 'mp4', config });
      if (latestByScreen.get(screenId) !== job.inputHash || stopped) return;
      const component = Object.freeze({
        enabled: true,
        status: 'ready',
        source_url: descriptor.publicUrl,
        content_hash: descriptor.hash,
        input_hash: job.inputHash,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        duration_ms: metadata.duration_ms,
        loop: true,
        live_layers: Object.freeze(['weather'])
      });
      readyByScreen.set(screenId, component);
      readyByInputHash.set(job.inputHash, component);
      failedByScreen.delete(screenId);
      realtime?.notifyScreen?.(screenId, 'scene-video:' + descriptor.hash.slice(0, 16));
      logger.info?.('Server scene video ready', {
        screen_id: screenId,
        source_url: descriptor.publicUrl,
        duration_ms: metadata.duration_ms,
        fps: metadata.fps
      });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (latestByScreen.get(screenId) === job.inputHash) {
        failedByScreen.set(screenId, { input_hash: job.inputHash, message: String(error?.message || error) });
        realtime?.notifyScreen?.(screenId, 'scene-video-failed:' + job.inputHash.slice(0, 16));
      }
      logger.warn?.('Server scene video render failed; Player will keep live renderer', {
        screen_id: screenId,
        error
      });
    } finally {
      renderTokens.delete(token);
      pending.delete(job.inputHash);
    }
  }

  function schedule(job) {
    if (!enabled || stopped || pending.has(job.inputHash)) return;
    pending.add(job.inputHash);
    queue = queue.then(() => execute(job)).catch((error) => {
      pending.delete(job.inputHash);
      logger.warn?.('Server scene video queue failed', { error });
    });
  }

  function componentFor({ screenId, renderRevision, context } = {}) {
    const id = Number(screenId);
    if (!Number.isSafeInteger(id) || id < 1 || !context) {
      return Object.freeze({ enabled, status: enabled ? 'failed' : 'disabled', source_url: '', live_layers: Object.freeze(['weather']) });
    }
    const normalizedContext = {
      ...structuredClone(context),
      render_revision: Number(renderRevision) || 1,
      scene: withoutWeather(context.scene),
      scene_playlist: null,
      scene_video: null
    };
    const inputHash = sceneVideoInputHash(normalizedContext);
    latestByScreen.set(id, inputHash);
    let ready = readyByScreen.get(id);
    if (enabled && ready?.input_hash !== inputHash) {
      const shared = readyByInputHash.get(inputHash);
      if (shared) {
        readyByScreen.set(id, shared);
        failedByScreen.delete(id);
        ready = shared;
      } else {
        schedule({ screenId: id, inputHash, context: normalizedContext });
      }
    }
    return publicComponent(id, inputHash);
  }

  async function stop() {
    stopped = true;
    renderTokens.clear();
    pending.clear();
    for (const child of children) {
      try { child.kill('SIGKILL'); } catch {}
    }
    children.clear();
    await queue.catch(() => undefined);
  }

  return Object.freeze({
    get enabled() { return enabled; },
    componentFor,
    runtimeToken,
    hasRenderToken,
    contextForToken,
    stop
  });
}
