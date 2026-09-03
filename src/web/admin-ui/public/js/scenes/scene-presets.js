const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
const MIN_DISPLAYS = 1;
const MAX_DISPLAYS = 6;

const PRESETS = [
  {
    id: 'mira-minimal',
    name: 'MIRA Minimal',
    category: 'Универсальный',
    description: 'Чистая тёмная композиция с акцентной ценой.',
    palette: { background: '#0d1117', surface: 'transparent', text: '#ffffff', accent: '#f4c915' },
    tablePreset: 'clean',
    density: 'comfortable',
    priceStyle: 'accent',
    headerStyle: 'subtle',
    decoration: 'rail',
    title: 'МЕНЮ'
  },
  {
    id: 'taproom',
    name: 'Taproom',
    category: 'Бар',
    description: 'Контрастное меню для разливных напитков и баров.',
    palette: { background: '#15110b', surface: 'transparent', text: '#fff8ea', accent: '#f0a928' },
    tablePreset: 'menu-board',
    density: 'comfortable',
    priceStyle: 'accent',
    headerStyle: 'subtle',
    decoration: 'rail',
    title: 'ON TAP'
  },
  {
    id: 'modern-bistro',
    name: 'Modern Bistro',
    category: 'Ресторан',
    description: 'Тёплый светлый дизайн с выразительной шапкой.',
    palette: { background: '#f2eadc', surface: '#2b2621', text: '#26211d', accent: '#b5603b', titleText: '#fffaf2' },
    tablePreset: 'bistro',
    density: 'comfortable',
    priceStyle: 'bold',
    headerStyle: 'subtle',
    decoration: 'header',
    title: 'МЕНЮ'
  },
  {
    id: 'coffee-house',
    name: 'Coffee House',
    category: 'Кафе',
    description: 'Мягкая типографика для кофе, десертов и завтраков.',
    palette: { background: '#f6f0e8', surface: '#fffaf3', text: '#3b2d26', accent: '#9b6448' },
    tablePreset: 'cafe',
    density: 'spacious',
    priceStyle: 'bold',
    headerStyle: 'subtle',
    decoration: 'floating',
    title: 'COFFEE & FOOD'
  },
  {
    id: 'chalk-board',
    name: 'Chalk Board',
    category: 'Бар · Кафе',
    description: 'Классическая доска с лёгким тёплым акцентом.',
    palette: { background: '#111412', surface: 'transparent', text: '#f5f1e7', accent: '#d8bd73' },
    tablePreset: 'chalkboard',
    density: 'comfortable',
    priceStyle: 'plain',
    headerStyle: 'subtle',
    decoration: 'frame',
    title: 'TODAY MENU'
  },
  {
    id: 'night-neon',
    name: 'Night Neon',
    category: 'Бар',
    description: 'Глубокий тёмный фон и холодный акцент для вечернего меню.',
    palette: { background: '#07131b', surface: '#0b202a', text: '#eaffff', accent: '#55e6d8' },
    tablePreset: 'menu-board',
    density: 'compact',
    priceStyle: 'accent',
    headerStyle: 'subtle',
    decoration: 'line',
    title: 'NIGHT MENU'
  },
  {
    id: 'premium-black',
    name: 'Premium Black',
    category: 'Ресторан',
    description: 'Чёрный фон, золотой акцент и спокойная премиальная композиция.',
    palette: { background: '#080808', surface: '#121212', text: '#f7f2e7', accent: '#c8a55a' },
    tablePreset: 'bistro',
    density: 'spacious',
    priceStyle: 'accent',
    headerStyle: 'subtle',
    decoration: 'floating',
    title: 'SIGNATURE MENU'
  },
  {
    id: 'fresh-market',
    name: 'Fresh Market',
    category: 'Магазин',
    description: 'Светлый универсальный прайс с зелёным акцентом.',
    palette: { background: '#f7f8f3', surface: '#ffffff', text: '#1e2b22', accent: '#4f8f62' },
    tablePreset: 'clean',
    density: 'comfortable',
    priceStyle: 'accent',
    headerStyle: 'subtle',
    decoration: 'rail',
    title: 'СЕГОДНЯ В МЕНЮ'
  }
];

export const SCENE_PRESETS = Object.freeze(PRESETS.map((preset) => Object.freeze(preset)));

export function getScenePreset(id) {
  return SCENE_PRESETS.find((preset) => preset.id === id) || null;
}

function displayCount(value) {
  return Math.min(MAX_DISPLAYS, Math.max(MIN_DISPLAYS, Math.round(Number(value) || 1)));
}

function element(type, geometry, style = {}, extra = {}) {
  return { type, geometry, style, ...extra };
}

export function buildScenePresetLayout(presetSource, requestedDisplays = 1) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');

  const displays = displayCount(requestedDisplays);
  const canvasWidth = DISPLAY_WIDTH * displays;
  const margin = displays === 1 ? 110 : 140;
  const contentWidth = canvasWidth - margin * 2;
  const titleY = preset.decoration === 'header' ? 52 : 64;
  const titleColor = preset.palette.titleText || preset.palette.text;
  const elements = [];

  if (preset.decoration === 'rail') {
    elements.push(element('shape', { x: 0, y: 0, width: 20, height: DISPLAY_HEIGHT }, {
      background: preset.palette.accent, radius: 0, border_width: 0, border_color: preset.palette.accent
    }));
  } else if (preset.decoration === 'header') {
    elements.push(element('shape', { x: 0, y: 0, width: canvasWidth, height: 190 }, {
      background: preset.palette.surface, radius: 0, border_width: 0, border_color: preset.palette.surface
    }));
  } else if (preset.decoration === 'frame') {
    elements.push(element('shape', { x: 40, y: 40, width: canvasWidth - 80, height: DISPLAY_HEIGHT - 80 }, {
      background: 'transparent', radius: 10, border_width: 3, border_color: preset.palette.accent
    }));
  } else if (preset.decoration === 'line') {
    elements.push(element('shape', { x: margin, y: 166, width: contentWidth, height: 20 }, {
      background: preset.palette.accent, radius: 3, border_width: 0, border_color: preset.palette.accent
    }));
  }

  elements.push(element('text', { x: margin, y: titleY, width: contentWidth, height: 105 }, {
    color: titleColor,
    background: 'transparent',
    font_size: displays === 1 ? 72 : 78,
    font_weight: 800,
    text_align: preset.decoration === 'floating' ? 'center' : 'left',
    vertical_align: 'center',
    line_height: 0.94,
    letter_spacing: displays === 1 ? 1 : 2,
    radius: 0,
    border_width: 0,
    border_color: titleColor
  }, { content: preset.title }));

  const menuY = preset.decoration === 'header' ? 220 : 205;
  const menuBackground = preset.decoration === 'floating' ? preset.palette.surface : 'transparent';
  elements.push(element('table', { x: margin, y: menuY, width: contentWidth, height: DISPLAY_HEIGHT - menuY - 70 }, {
    color: preset.palette.text,
    background: menuBackground,
    font_size: displays === 1 ? 46 : 50,
    font_weight: 500,
    text_align: 'left',
    vertical_align: 'top',
    line_height: 1.06,
    letter_spacing: 0,
    radius: preset.decoration === 'floating' ? 28 : 0,
    border_width: 0,
    border_color: preset.palette.accent
  }, {
    content: 'Меню',
    table: {
      preset: preset.tablePreset,
      density: preset.density,
      headerStyle: preset.headerStyle,
      priceStyle: preset.priceStyle,
      accentColor: preset.palette.accent,
      showTitle: false,
      rowDividers: preset.tablePreset === 'clean',
      zebra: false,
      rowLimit: preset.density === 'compact' ? 16 : preset.density === 'spacious' ? 10 : 12
    }
  }));

  return {
    id: preset.id,
    name: preset.name,
    displayCount: displays,
    canvasWidth,
    canvasHeight: DISPLAY_HEIGHT,
    background: preset.palette.background,
    elements
  };
}
