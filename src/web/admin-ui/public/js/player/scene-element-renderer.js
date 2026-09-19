const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;

const FONT_FAMILIES = Object.freeze({
  'arial-narrow': "'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif",
  'tahoma-bold': "Tahoma, Arial, sans-serif",
  arial: "Arial, 'Liberation Sans', sans-serif",
  'dejavu-condensed': "'DejaVu Sans Condensed', 'DejaVu Sans', sans-serif",
  'liberation-narrow': "'Liberation Sans Narrow', 'Arial Narrow', Arial, sans-serif",
  'system-sans': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
});

function percentage(value, total) {
  return String((Number(value || 0) / total) * 100) + '%';
}

function sceneUnit(value) {
  return String((Number(value || 0) / SCENE_WIDTH) * 100) + 'cqw';
}

function clampOpacity(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function sameOriginAsset(value) {
  const source = String(value || '').trim();
  if (!source || !source.startsWith('/site-assets/') || source.includes('..')) return '';
  return source;
}

function rgba(hex, opacity) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return 'rgba(0,0,0,' + clampOpacity(opacity, 1) + ')';
  const value = Number.parseInt(match[1], 16);
  return 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + clampOpacity(opacity, 1) + ')';
}

function transformedText(value, transform) {
  const text = String(value || '');
  if (transform === 'uppercase') return text.toLocaleUpperCase('ru');
  if (transform === 'lowercase') return text.toLocaleLowerCase('ru');
  return text;
}

function verticalAlignment(value) {
  if (value === 'center') return 'center';
  if (value === 'bottom') return 'flex-end';
  return 'flex-start';
}

function objectFit(value) {
  return value === 'cover' || value === 'fill' ? value : 'contain';
}

function mediaNode(type) {
  if (type === 'video') {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('disablepictureinpicture', '');
    video.setAttribute('aria-hidden', 'true');
    return video;
  }
  const image = document.createElement('img');
  image.alt = '';
  image.decoding = 'async';
  image.loading = 'eager';
  image.setAttribute('aria-hidden', 'true');
  return image;
}

function applyMediaLayout(node, media) {
  node.style.width = '100%';
  node.style.height = '100%';
  node.style.display = 'block';
  node.style.objectFit = objectFit(media?.fit);
  node.style.objectPosition = String(Number(media?.position_x_percent ?? 50)) + '% ' + String(Number(media?.position_y_percent ?? 50)) + '%';
}

function textShadow(effects) {
  const shadows = [];
  if (effects?.shadow?.enabled === true) {
    shadows.push(
      sceneUnit(effects.shadow.offset_x_px) + ' ' +
      sceneUnit(effects.shadow.offset_y_px) + ' ' +
      sceneUnit(effects.shadow.blur_px) + ' ' +
      rgba(effects.shadow.color, effects.shadow.opacity)
    );
  }
  if (effects?.glow?.enabled === true) {
    const color = rgba(effects.glow.color, effects.glow.opacity);
    const blur = sceneUnit(effects.glow.blur_px);
    const spread = sceneUnit(effects.glow.spread_px);
    shadows.push('0 0 ' + blur + ' ' + color);
    if (Number(effects.glow.spread_px || 0) > 0) {
      shadows.push(spread + ' 0 ' + blur + ' ' + color);
      shadows.push('-' + spread + ' 0 ' + blur + ' ' + color);
      shadows.push('0 ' + spread + ' ' + blur + ' ' + color);
      shadows.push('0 -' + spread + ' ' + blur + ' ' + color);
    }
  }
  return shadows.join(', ');
}

function applyTextRun(span, run, effects) {
  span.textContent = transformedText(run?.value, run?.text_transform);
  span.style.display = 'inline-block';
  span.style.fontFamily = FONT_FAMILIES[run?.font_family] || FONT_FAMILIES['system-sans'];
  span.style.fontSize = sceneUnit(run?.font_size_px ?? 64);
  span.style.fontWeight = String(Number(run?.font_weight ?? 400));
  span.style.fontStyle = run?.italic === true ? 'italic' : 'normal';
  span.style.letterSpacing = sceneUnit(run?.tracking_px ?? 0);
  span.style.lineHeight = String(Number(run?.leading_percent ?? 120) / 100);
  span.style.opacity = String(clampOpacity(run?.opacity, 1) * clampOpacity(effects?.fill?.opacity, 1));
  span.style.position = 'relative';
  span.style.top = sceneUnit(-Number(run?.baseline_shift_px || 0));
  span.style.transformOrigin = 'left center';
  span.style.transform = 'scale(' +
    String(Number(run?.horizontal_scale_percent ?? 100) / 100) + ',' +
    String(Number(run?.vertical_scale_percent ?? 100) / 100) + ')';

  const fill = effects?.fill;
  if (fill?.enabled !== false && fill?.mode === 'linear-gradient' && Array.isArray(fill?.gradient?.stops)) {
    const stops = fill.gradient.stops.map((stop) => rgba(stop.color, stop.opacity) + ' ' + String(Number(stop.offset_percent || 0)) + '%').join(', ');
    span.style.backgroundImage = 'linear-gradient(' + String(Number(fill.gradient.angle_deg || 0)) + 'deg, ' + stops + ')';
    span.style.backgroundClip = 'text';
    span.style.webkitBackgroundClip = 'text';
    span.style.color = 'transparent';
    span.style.webkitTextFillColor = 'transparent';
  } else {
    span.style.backgroundImage = 'none';
    span.style.backgroundClip = '';
    span.style.webkitBackgroundClip = '';
    span.style.color = String(run?.color || '#FFFFFF');
    span.style.webkitTextFillColor = '';
  }

  if (effects?.stroke?.enabled === true) {
    span.style.webkitTextStroke = sceneUnit(effects.stroke.width_px) + ' ' + rgba(effects.stroke.color, effects.stroke.opacity);
  } else {
    span.style.webkitTextStroke = '0 transparent';
  }
  span.style.textShadow = textShadow(effects);
}

function renderText(node, text) {
  node.replaceChildren();
  const paragraph = text?.paragraph || {};
  const effects = text?.effects || {};
  node.style.width = '100%';
  node.style.height = '100%';
  node.style.display = 'flex';
  node.style.flexWrap = 'wrap';
  node.style.alignContent = verticalAlignment(paragraph.vertical_align);
  node.style.justifyContent = paragraph.align === 'center' ? 'center' : paragraph.align === 'right' ? 'flex-end' : 'flex-start';
  node.style.textAlign = paragraph.align === 'center' || paragraph.align === 'right' ? paragraph.align : 'left';
  node.style.whiteSpace = paragraph.wrap === false ? 'pre' : 'pre-wrap';
  node.style.overflowWrap = paragraph.wrap === false ? 'normal' : 'anywhere';
  node.style.overflow = 'hidden';

  for (const run of Array.isArray(text?.runs) ? text.runs : []) {
    const span = document.createElement('span');
    applyTextRun(span, run, effects);
    node.append(span);
  }
}

function syncVideo(video, element, documentVisible) {
  if (!(video instanceof HTMLVideoElement)) return;
  const media = element?.media || {};
  video.loop = media.loop !== false;
  video.muted = media.muted !== false;
  video.defaultMuted = video.muted;
  const playbackRate = Number(media.playback_rate || 1);
  if (Number.isFinite(playbackRate) && playbackRate >= 0.25 && playbackRate <= 4) video.playbackRate = playbackRate;

  const shouldPlay = element?.enabled !== false && documentVisible && Boolean(video.dataset.sceneSource);
  if (!shouldPlay) {
    video.pause();
    return;
  }
  const play = video.play();
  if (play && typeof play.catch === 'function') play.catch(() => {});
}

function updateMedia(node, element, documentVisible) {
  const media = element?.media || {};
  const source = sameOriginAsset(media.source_url);
  applyMediaLayout(node, media);
  if (node.dataset.sceneSource !== source) {
    node.dataset.sceneSource = source;
    if (node instanceof HTMLVideoElement) node.pause();
    if (source) node.setAttribute('src', source);
    else node.removeAttribute('src');
    if (node instanceof HTMLVideoElement) node.load();
  }
  if (node instanceof HTMLVideoElement) syncVideo(node, element, documentVisible);
}

function createContent(type) {
  if (type === 'text') {
    const node = document.createElement('div');
    node.dataset.sceneText = '';
    return node;
  }
  if (type === 'weather') {
    const node = document.createElement('div');
    node.dataset.sceneWeatherMount = '';
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  return mediaNode(type);
}

function updateContent(content, element, documentVisible) {
  if (element.type === 'text') {
    renderText(content, element.text);
    return;
  }
  if (element.type === 'weather') {
    content.dataset.weatherMode = String(element.weather?.mode || 'current');
    content.dataset.showLocation = element.weather?.show_location === false ? 'false' : 'true';
    content.dataset.showCondition = element.weather?.show_condition === false ? 'false' : 'true';
    return;
  }
  updateMedia(content, element, documentVisible);
}

function applyGeometry(node, element) {
  node.style.position = 'absolute';
  node.style.left = percentage(element.x, SCENE_WIDTH);
  node.style.top = percentage(element.y, SCENE_HEIGHT);
  node.style.width = percentage(element.width, SCENE_WIDTH);
  node.style.height = percentage(element.height, SCENE_HEIGHT);
  node.style.zIndex = String(Number(element.z_index || 0));
  node.style.opacity = String(clampOpacity(element.opacity, 1));
  node.style.transform = 'rotate(' + String(Number(element.rotation_deg || 0)) + 'deg)';
  node.style.transformOrigin = 'center center';
  node.style.overflow = 'hidden';
  node.style.pointerEvents = 'none';
  node.style.display = element.enabled === false ? 'none' : 'block';
}

export class SceneElementRenderer {
  constructor(layer) {
    if (!(layer instanceof HTMLElement)) throw new TypeError('SceneElementRenderer requires an HTMLElement layer.');
    this.layer = layer;
    this.entries = new Map();
    this.destroyed = false;
    this.handleVisibilityChange = () => this.syncVideos();
    layer.setAttribute('data-scene-elements-layer', '');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.overflow = 'hidden';
    layer.style.pointerEvents = 'none';
    layer.style.containerType = 'inline-size';
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  render(scene) {
    if (this.destroyed) return;
    const elements = Array.isArray(scene?.elements) ? scene.elements : [];
    const liveIds = new Set();

    for (const element of elements) {
      const id = String(element?.id || '');
      if (!id) continue;
      liveIds.add(id);
      let entry = this.entries.get(id);
      if (!entry) {
        const node = document.createElement('div');
        node.dataset.sceneElementId = id;
        node.setAttribute('aria-hidden', 'true');
        entry = { node, type: '', content: null, fingerprint: '', element: null };
        this.entries.set(id, entry);
      }

      if (entry.type !== element.type || !(entry.content instanceof HTMLElement)) {
        if (entry.content instanceof HTMLVideoElement) entry.content.pause();
        entry.node.replaceChildren();
        entry.content = createContent(element.type);
        entry.node.append(entry.content);
        entry.type = element.type;
        entry.node.dataset.sceneElementType = String(element.type || '');
        entry.fingerprint = '';
      }

      const fingerprint = JSON.stringify(element);
      applyGeometry(entry.node, element);
      entry.element = element;
      if (entry.fingerprint !== fingerprint) {
        updateContent(entry.content, element, !document.hidden);
        entry.fingerprint = fingerprint;
      } else if (entry.content instanceof HTMLVideoElement) {
        syncVideo(entry.content, element, !document.hidden);
      }

      this.layer.append(entry.node);
    }

    for (const [id, entry] of this.entries) {
      if (liveIds.has(id)) continue;
      if (entry.content instanceof HTMLVideoElement) entry.content.pause();
      entry.node.remove();
      this.entries.delete(id);
    }
  }

  syncVideos() {
    if (this.destroyed) return;
    for (const entry of this.entries.values()) {
      if (entry.content instanceof HTMLVideoElement) syncVideo(entry.content, entry.element, !document.hidden);
    }
  }

  clear() {
    for (const entry of this.entries.values()) {
      if (entry.content instanceof HTMLVideoElement) entry.content.pause();
      entry.node.remove();
    }
    this.entries.clear();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.clear();
    this.layer = null;
  }
}

export const SCENE_ELEMENT_REFERENCE_SIZE = Object.freeze({ width: SCENE_WIDTH, height: SCENE_HEIGHT });
