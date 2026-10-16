const OUTPUT_WIDTH = 720;
const OUTPUT_QUALITY = 0.76;
const PREVIEW_ATTEMPTS = Object.freeze([
  Object.freeze({ width:OUTPUT_WIDTH, quality:OUTPUT_QUALITY }),
  Object.freeze({ width:OUTPUT_WIDTH, quality:0.68 }),
  Object.freeze({ width:640, quality:0.68 }),
  Object.freeze({ width:560, quality:0.64 }),
  Object.freeze({ width:480, quality:0.60 })
]);
const assetCache = new Map();
const BACKGROUND_URL_PATTERN = /url\((['"]?)(?!data:|blob:|#)([^'")]+)\1\)/gi;

function canonicalSize(stage) {
  const width = Math.max(1, Number(stage?.dataset?.sceneViewportWidth) || Number.parseFloat(stage?.style?.width) || 1920);
  const height = Math.max(1, Number(stage?.dataset?.sceneViewportHeight) || Number.parseFloat(stage?.style?.height) || 1080);
  return { width, height };
}

function absoluteCssUrls(value, base) {
  return String(value || '').replace(/url\((['"]?)(?!data:|blob:|#)([^'")]+)\1\)/gi, (_match, _quote, source) => {
    try { return `url("${new URL(source, base).href}")`; }
    catch { return _match; }
  });
}

function styleSheetText() {
  const chunks = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = [...sheet.cssRules]; }
    catch { continue; }
    const base = sheet.href || document.baseURI;
    for (const rule of rules) {
      if (rule.type === CSSRule.FONT_FACE_RULE) continue;
      chunks.push(absoluteCssUrls(rule.cssText, base));
    }
  }
  return chunks.join('\n').replace(/<\/style/gi, '<\\/style');
}

async function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('asset data URL failed')));
    reader.readAsDataURL(blob);
  });
}

async function assetDataUrl(source) {
  const url = String(source || '').trim();
  if (!url) return '';
  if (/^data:/i.test(url)) return url;
  let resolved;
  try { resolved = new URL(url, location.href); }
  catch { return ''; }
  if (resolved.origin !== location.origin) return '';
  const key = resolved.href;
  if (!assetCache.has(key)) {
    const request = fetch(key, { credentials:'same-origin', cache:'force-cache' })
      .then((response) => response.ok ? response.blob() : null)
      .then((blob) => blob ? blobAsDataUrl(blob) : '')
      .then((data) => {
        if (!data) assetCache.delete(key);
        return data;
      })
      .catch(() => {
        assetCache.delete(key);
        return '';
      });
    assetCache.set(key, request);
  }
  return assetCache.get(key);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function inlineBackgroundImages(value) {
  const source = String(value || '');
  const matches = [...source.matchAll(BACKGROUND_URL_PATTERN)];
  if (!matches.length) return { value:source, complete:true };
  let result = source;
  let complete = true;
  for (const match of matches) {
    const data = await assetDataUrl(match[2]);
    if (!data) {
      complete = false;
      continue;
    }
    result = result.replace(match[0], `url("${data}")`);
  }
  return { value:result, complete };
}

async function waitForStageImages(stage, timeoutMs = 1200) {
  const pending = [...stage.querySelectorAll('img')].filter((image) => image.currentSrc || image.src);
  if (!pending.length) return;
  const settle = Promise.all(pending.map((image) => {
    if (image.complete) return Promise.resolve();
    if (typeof image.decode === 'function') return image.decode().catch(() => undefined);
    return new Promise((resolve) => {
      const done = () => {
        image.removeEventListener('load', done);
        image.removeEventListener('error', done);
        resolve();
      };
      image.addEventListener('load', done, { once:true });
      image.addEventListener('error', done, { once:true });
    });
  }));
  await Promise.race([settle, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

async function inlineStaticAssets(stage, clone) {
  const originals = [stage, ...stage.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  const tasks = [];

  for (let index = 0; index < originals.length && index < copies.length; index += 1) {
    const original = originals[index];
    const copy = copies[index];
    if (original instanceof HTMLImageElement && copy instanceof HTMLImageElement) {
      const source = original.currentSrc || original.src;
      if (source) {
        tasks.push(assetDataUrl(source).then((data) => {
          if (!data) return false;
          copy.src = data;
          return true;
        }));
      }
    }
    if (original instanceof HTMLElement && copy instanceof HTMLElement) {
      const background = getComputedStyle(original).backgroundImage;
      if (background && background !== 'none' && background.includes('url(')) {
        tasks.push(inlineBackgroundImages(background).then((result) => {
          copy.style.backgroundImage = result.value;
          return result.complete;
        }));
      }
    }
  }

  const results = await Promise.all(tasks);
  return results.every((complete) => complete !== false);
}

async function encodedPreview(image, sceneWidth, sceneHeight, maxBytes) {
  const byteLimit = Number(maxBytes);
  const bounded = Number.isFinite(byteLimit) && byteLimit > 0;

  for (const attempt of PREVIEW_ATTEMPTS) {
    const outputHeight = Math.max(1, Math.round(attempt.width * sceneHeight / sceneWidth));
    const canvas = document.createElement('canvas');
    canvas.width = attempt.width;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d', { alpha:false });
    if (!context) return null;
    context.fillStyle = '#090d14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const frame = await canvasBlob(canvas, 'image/webp', attempt.quality);
    if (!(frame instanceof Blob) || frame.size < 1) continue;
    if (!bounded || frame.size <= byteLimit) return frame;
  }
  return null;
}

async function capturePlayerPreview(stage, maxBytes) {
  if (!(stage instanceof HTMLElement) || !stage.isConnected) return null;
  try { await document.fonts?.ready; } catch {}
  await waitForStageImages(stage);

  const { width, height } = canonicalSize(stage);
  const clone = stage.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  clone.style.position = 'relative';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.right = 'auto';
  clone.style.bottom = 'auto';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';

  await inlineStaticAssets(stage, clone);

  const serialized = new XMLSerializer().serializeToString(clone);
  const css = styleSheetText();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#090d14"><style>${css}</style>${serialized}</div></foreignObject></svg>`;
  const imageSource = await blobAsDataUrl(new Blob([svg], { type:'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  image.decoding = 'async';
  image.src = imageSource;
  await image.decode();
  return encodedPreview(image, width, height, maxBytes);
}

export async function publishPlayerPreview(stage, { maxBytes } = {}) {
  const frame = await capturePlayerPreview(stage, maxBytes);
  if (!(frame instanceof Blob) || frame.size < 1) return false;
  const response = await fetch('/api/device/preview', {
    method:'POST',
    credentials:'include',
    cache:'no-store',
    headers:{ 'content-type':frame.type || 'image/webp' },
    body:frame
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error(`TV preview publish failed: HTTP ${response.status}`);
  return true;
}
