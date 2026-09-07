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

function fitStage(stage, width, height) {
  if (!(stage instanceof HTMLElement)) return;
  const apply = () => {
    const viewportWidth = Math.max(1, window.innerWidth || stage.parentElement?.clientWidth || width);
    const viewportHeight = Math.max(1, window.innerHeight || stage.parentElement?.clientHeight || height);
    const scale = Math.min(viewportWidth / width, viewportHeight / height);
    const outputWidth = Math.max(1, Math.floor(width * scale));
    const outputHeight = Math.max(1, Math.floor(height * scale));
    stage.style.width = `${outputWidth}px`;
    stage.style.height = `${outputHeight}px`;
    stage.style.left = '50%';
    stage.style.top = '50%';
    stage.style.right = 'auto';
    stage.style.bottom = 'auto';
    stage.style.transform = 'translate(-50%, -50%)';
    stage.dataset.sceneWidth = String(width);
    stage.dataset.sceneHeight = String(height);
  };
  apply();
  if (observers.has(stage)) return;
  const resize = new ResizeObserver(apply);
  resize.observe(document.documentElement);
  observers.set(stage, resize);
}

export function playerMenuRenderMode(context = {}) {
  const animation = context?.animation;
  return animation?.enabled === true && animation?.profile ? 'flat-gpu' : 'flat';
}

export class FlatMenuRenderer {
  constructor() {
    this.generation = 0;
    this.layer = null;
  }

  destroy() {
    this.generation += 1;
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
    const stage = layer.closest('[data-player-stage]');
    fitStage(stage, width, height);
    return generation === this.generation && layer === this.layer;
  }
}
