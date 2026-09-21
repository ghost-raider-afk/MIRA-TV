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
  let resolved;
  try { resolved = new URL(url, location.href); }
  catch { return ''; }
  if (resolved.origin !== location.origin) return '';
  const key = resolved.href;
  if (!assetCache.has(key)) {
    assetCache.set(key, fetch(key, { credentials:'same-origin', cache:'force-cache' })
      .then((response) => response.ok ? response.blob() : null)
      .then((blob) => blob ? blobAsDataUrl(blob) : '')
      .catch(() => ''));
  }
  return assetCache.get(key);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function videoFrame(video) {
  if (!(video instanceof HTMLVideoElement) || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return '';
  try {
    const scale = Math.min(1, OUTPUT_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d', { alpha:false })?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    return '';
  }
}

async function inlineDynamicState(stage, clone) {
  const originals = [stage, ...stage.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  const tasks = [];

  for (let index = 0; index < originals.length && index < copies.length; index += 1) {
    const original = originals[index];
    const copy = copies[index];
    if (!(original instanceof Element) || !(copy instanceof Element)) continue;

    const animations = typeof original.getAnimations === 'function' ? original.getAnimations({ subtree:false }) : [];
    if (animations.length && copy instanceof HTMLElement) {
      const computed = getComputedStyle(original);
      copy.style.animation = 'none';
      copy.style.transition = 'none';
      copy.style.transform = computed.transform;
      copy.style.opacity = computed.opacity;
      copy.style.filter = computed.filter;
    }

    if (original instanceof HTMLImageElement && copy instanceof HTMLImageElement) {
      tasks.push(assetDataUrl(original.currentSrc || original.src).then((data) => {
        if (data) copy.src = data;
      }));
    }

    if (original instanceof HTMLVideoElement) {
      tasks.push(videoFrame(original).then((data) => {
        if (!data || !copy.parentNode) return;
        const image = document.createElement('img');
        image.src = data;
        image.className = copy.className;
        image.setAttribute('style', copy.getAttribute('style') || '');
        image.style.width = '100%';
        image.style.height = '100%';
        image.style.objectFit = getComputedStyle(original).objectFit || 'contain';
        image.style.objectPosition = getComputedStyle(original).objectPosition || '50% 50%';
        copy.replaceWith(image);
      }));
    }
  }

  const background = getComputedStyle(stage).backgroundImage;
  const match = /url\(["']?([^"')]+)["']?\)/i.exec(background);
  if (match) {
    tasks.push(assetDataUrl(match[1]).then((data) => {
      if (data && clone instanceof HTMLElement) clone.style.backgroundImage = `url("${data}")`;
    }));
  }
  await Promise.all(tasks);
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

  await inlineDynamicState(stage, clone);

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
    credentials:'same-origin',
    cache:'no-store',
    headers:{ 'content-type':frame.type || 'image/webp' },
    body:frame
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error(`TV preview publish failed: HTTP ${response.status}`);
  return true;
}
