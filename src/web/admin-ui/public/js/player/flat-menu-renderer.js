function positiveDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function standaloneSvg(markup) {
  const source = String(markup || '').trim();
  if (!source.startsWith('<svg')) throw new TypeError('MIRA-TV renderer requires SVG markup.');
  if (/\sxmlns=/.test(source.slice(0, source.indexOf('>') + 1))) return source;
  return source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

const observers = new WeakMap();

function releaseStage(stage) {
  const resize = stage instanceof HTMLElement ? observers.get(stage) : null;
  resize?.disconnect();
  if (stage instanceof HTMLElement) observers.delete(stage);
}

function fitStage(stage, width, height) {
  if (!(stage instanceof HTMLElement)) return;
  stage.dataset.sceneWidth = String(width);
  stage.dataset.sceneHeight = String(height);
  stage.style.aspectRatio = `${width} / ${height}`;

  const fullscreenHost = stage.matches('[data-player-stage], .manager-fullscreen-stage');
  if (!fullscreenHost) {
    releaseStage(stage);
    stage.style.left = 'auto';
    stage.style.top = 'auto';
    stage.style.right = 'auto';
    stage.style.bottom = 'auto';
    stage.style.transform = 'none';

    const managerShell = stage.closest('.manager-screen-preview-shell');
    if (managerShell instanceof HTMLElement) {
      managerShell.style.aspectRatio = `${width} / ${height}`;
      stage.style.position = 'absolute';
      stage.style.inset = '0';
      stage.style.width = '100%';
      stage.style.height = '100%';
    } else {
      stage.style.position = 'relative';
      stage.style.inset = 'auto';
      stage.style.width = '100%';
      stage.style.height = 'auto';
    }
    return;
  }

  const host = stage.parentElement;
  const apply = () => {
    const viewportWidth = Math.max(1, host?.clientWidth || window.innerWidth || width);
    const viewportHeight = Math.max(1, host?.clientHeight || window.innerHeight || height);
    const scale = Math.min(viewportWidth / width, viewportHeight / height);
    const outputWidth = Math.max(1, Math.floor(width * scale));
    const outputHeight = Math.max(1, Math.floor(height * scale));
    stage.style.position = 'absolute';
    stage.style.width = `${outputWidth}px`;
    stage.style.height = `${outputHeight}px`;
    stage.style.left = '50%';
    stage.style.top = '50%';
    stage.style.right = 'auto';
    stage.style.bottom = 'auto';
    stage.style.transform = 'translate(-50%, -50%)';
  };

  apply();
  releaseStage(stage);
  const resize = new ResizeObserver(apply);
  resize.observe(host || document.documentElement);
  observers.set(stage, resize);
}

export function playerMenuRenderMode(context = {}) {
  const animation = context?.animation;
  return animation?.enabled === true && animation?.profile ? 'flat-motion' : 'flat';
}

export class FlatMenuRenderer {
  constructor() {
    this.generation = 0;
    this.layer = null;
    this.stage = null;
  }

  destroy() {
    this.generation += 1;
    releaseStage(this.stage);
    this.stage = null;
    this.layer = null;
  }

  async render(layer, svgMarkup, viewport = {}) {
    if (!(layer instanceof Element)) throw new TypeError('MIRA-TV renderer requires a layer element.');
    const generation = ++this.generation;
    this.layer = layer;
    const width = positiveDimension(viewport.width, 1920);
    const height = positiveDimension(viewport.height, 1080);
    const svg = standaloneSvg(svgMarkup);

    try { await document.fonts?.ready; } catch {}
    if (generation !== this.generation || layer !== this.layer) return false;

    // Keep the canonical vector output in the DOM. Preview and Player use the same final SVG path,
    // avoiding SVG-to-bitmap conversion while remaining sharp on 4K and HiDPI displays.
    layer.innerHTML = svg;
    layer.dataset.vectorMenu = 'true';
    const stage = layer.closest('.player-scene-stage');
    this.stage = stage instanceof HTMLElement ? stage : null;
    fitStage(this.stage, width, height);
    return generation === this.generation && layer === this.layer;
  }
}
