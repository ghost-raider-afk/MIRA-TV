function positiveDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function standaloneSvg(markup) {
  const source = String(markup || '').trim();
  if (!source.startsWith('<svg')) throw new TypeError('Flat menu renderer requires SVG markup.');
  if (/\sxmlns=/.test(source.slice(0, source.indexOf('>') + 1))) return source;
  return source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

function loadSvgImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error instanceof Error ? error : new Error('Flat menu SVG image failed to load.'));
    };
    image.src = url;
  });
}

async function rasterSource(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {}
  }
  return loadSvgImage(blob);
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
    if (!(layer instanceof Element)) throw new TypeError('Flat menu renderer requires a layer element.');
    const generation = ++this.generation;
    this.layer = layer;
    const width = positiveDimension(viewport.width, 1920);
    const height = positiveDimension(viewport.height, 1080);
    const svg = standaloneSvg(svgMarkup);

    try {
      await document.fonts?.ready;
    } catch {}

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const source = await rasterSource(blob);
    if (generation !== this.generation || layer !== this.layer) {
      source.close?.();
      return false;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'tv-player-menu-flat';
    canvas.dataset.flatMenuCanvas = '';
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute('aria-hidden', 'true');

    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) {
      source.close?.();
      throw new Error('Flat menu renderer could not acquire a 2D canvas context.');
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    source.close?.();

    if (generation !== this.generation || layer !== this.layer) return false;
    layer.replaceChildren(canvas);
    return true;
  }
}
