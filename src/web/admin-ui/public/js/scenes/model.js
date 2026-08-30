import { normaliseTableConfig } from './catalog-table.js';

const DEFAULT_DISPLAY_WIDTH = 1920;
const DEFAULT_DISPLAY_HEIGHT = 1080;
const MIN_DISPLAYS = 1;
const MAX_DISPLAYS = 6;
const MEDIA_ELEMENT_TYPES = new Set(['image', 'logo', 'video']);

function id(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createSlide(index = 1) {
  return {
    id: id('slide'),
    name: `Слайд ${index}`,
    duration_ms: 10000,
    transition: 'fade',
    background: {
      type: 'color',
      color: '#10141c',
      asset_id: ''
    },
    elements: []
  };
}

export function createScene({ name = 'Новая сцена', displayCount = 1 } = {}) {
  const count = clamp(displayCount, MIN_DISPLAYS, MAX_DISPLAYS);
  const firstSlide = createSlide(1);
  return {
    schema_version: 1,
    id: id('scene'),
    name: String(name || 'Новая сцена').slice(0, 120),
    display_count: count,
    display_width: DEFAULT_DISPLAY_WIDTH,
    display_height: DEFAULT_DISPLAY_HEIGHT,
    canvas_width: count * DEFAULT_DISPLAY_WIDTH,
    canvas_height: DEFAULT_DISPLAY_HEIGHT,
    slides: [firstSlide],
    active_slide_id: firstSlide.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

const ELEMENT_DEFAULTS = Object.freeze({
  text: { width: 760, height: 140, content: 'Новый текст', style: { color: '#ffffff', font_size: 72, background: 'transparent', radius: 0 } },
  table: {
    width: 1120,
    height: 700,
    content: 'Меню',
    style: { color: '#ffffff', font_size: 42, background: 'rgba(0,0,0,.28)', radius: 24 },
    data_binding: { source: 'catalog_products' },
    table: normaliseTableConfig()
  },
  image: { width: 560, height: 360, content: 'Изображение', style: { color: '#ffffff', font_size: 40, background: 'rgba(255,255,255,.08)', radius: 24 } },
  logo: { width: 520, height: 220, content: 'Логотип', style: { color: '#ffffff', font_size: 54, background: 'rgba(255,255,255,.08)', radius: 24 } },
  video: { width: 720, height: 405, content: 'Видео', style: { color: '#ffffff', font_size: 42, background: '#05070a', radius: 20 } },
  weather: { width: 480, height: 230, content: 'Погода', variant: 'compact', style: { color: '#ffffff', font_size: 42, background: 'rgba(9,15,25,.72)', radius: 28 } },
  clock: { width: 420, height: 180, content: 'Часы', variant: 'digital', style: { color: '#ffffff', font_size: 76, background: 'rgba(9,15,25,.48)', radius: 24 } },
  shape: { width: 520, height: 260, content: '', style: { color: '#ffffff', font_size: 40, background: '#f4c915', radius: 28 } }
});

export function createElement(type, scene, slide) {
  const defaults = ELEMENT_DEFAULTS[type];
  if (!defaults) throw new Error(`Unsupported scene element type: ${type}`);
  const ordinal = slide.elements.length;
  const x = Math.min(scene.canvas_width - defaults.width, 120 + ordinal * 36);
  const y = Math.min(scene.canvas_height - defaults.height, 120 + ordinal * 28);
  return {
    id: id('element'),
    type,
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: defaults.width,
    height: defaults.height,
    z_index: ordinal + 1,
    opacity: 1,
    content: defaults.content,
    variant: defaults.variant || 'default',
    style: deepClone(defaults.style),
    effects: {
      shadow: false,
      glow: false,
      blur: 0
    },
    animation: {
      entrance: 'none',
      loop: 'none',
      exit: 'none',
      duration_ms: 600
    },
    ...(MEDIA_ELEMENT_TYPES.has(type) ? { asset_id: '' } : {}),
    ...(defaults.data_binding ? { data_binding: deepClone(defaults.data_binding) } : {}),
    ...(defaults.table ? { table: deepClone(defaults.table) } : {})
  };
}

export function appendSlide(scene) {
  const slide = createSlide(scene.slides.length + 1);
  scene.slides.push(slide);
  scene.active_slide_id = slide.id;
  touchScene(scene);
  return slide;
}

export function duplicateSlide(scene, slideId) {
  const source = scene.slides.find((slide) => slide.id === slideId);
  if (!source) return null;
  const copy = deepClone(source);
  copy.id = id('slide');
  copy.name = `${source.name} — копия`;
  copy.elements = copy.elements.map((element) => ({ ...element, id: id('element') }));
  scene.slides.push(copy);
  scene.active_slide_id = copy.id;
  touchScene(scene);
  return copy;
}

export function removeSlide(scene, slideId) {
  if (scene.slides.length <= 1) return false;
  const index = scene.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return false;
  scene.slides.splice(index, 1);
  if (scene.active_slide_id === slideId) {
    scene.active_slide_id = scene.slides[Math.max(0, index - 1)]?.id || scene.slides[0].id;
  }
  touchScene(scene);
  return true;
}

export function setDisplayCount(scene, displayCount) {
  const count = clamp(displayCount, MIN_DISPLAYS, MAX_DISPLAYS);
  scene.display_count = count;
  scene.canvas_width = count * scene.display_width;
  for (const slide of scene.slides) {
    for (const element of slide.elements) {
      element.width = Math.min(element.width, scene.canvas_width);
      element.x = Math.max(0, Math.min(element.x, scene.canvas_width - element.width));
    }
  }
  touchScene(scene);
}

export function touchScene(scene) {
  scene.updated_at = new Date().toISOString();
}

function normaliseElement(element) {
  const result = element && typeof element === 'object' ? element : {};
  result.effects = { shadow: false, glow: false, blur: 0, ...(result.effects || {}) };
  result.animation = { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600, ...(result.animation || {}) };
  result.style = { color: '#ffffff', font_size: 40, background: 'transparent', radius: 0, ...(result.style || {}) };
  if (MEDIA_ELEMENT_TYPES.has(result.type)) result.asset_id = typeof result.asset_id === 'string' ? result.asset_id : '';
  if (result.type === 'table') {
    result.data_binding = { source: 'catalog_products', ...(result.data_binding || {}) };
    result.table = normaliseTableConfig(result.table || {});
  }
  return result;
}

export function normaliseScene(source) {
  const scene = deepClone(source);
  scene.schema_version = 1;
  scene.display_width = DEFAULT_DISPLAY_WIDTH;
  scene.display_height = DEFAULT_DISPLAY_HEIGHT;
  scene.display_count = clamp(scene.display_count, MIN_DISPLAYS, MAX_DISPLAYS);
  scene.canvas_width = scene.display_count * scene.display_width;
  scene.canvas_height = scene.display_height;
  if (!Array.isArray(scene.slides) || scene.slides.length === 0) scene.slides = [createSlide(1)];
  for (const slide of scene.slides) {
    const background = slide.background && typeof slide.background === 'object' ? slide.background : {};
    slide.background = {
      type: ['color', 'image', 'video'].includes(background.type) ? background.type : 'color',
      color: typeof background.color === 'string' ? background.color : '#10141c',
      asset_id: typeof background.asset_id === 'string' ? background.asset_id : ''
    };
    if (!Array.isArray(slide.elements)) slide.elements = [];
    slide.elements = slide.elements.map(normaliseElement);
  }
  if (!scene.slides.some((slide) => slide.id === scene.active_slide_id)) scene.active_slide_id = scene.slides[0].id;
  return scene;
}
