const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
const MIN_DISPLAYS = 1;
const MAX_DISPLAYS = 6;
const MANAGED_ID_PREFIX = 'element-preset-managed-';
const CORE_ID_PREFIX = 'element-preset-core-';

const PRESETS = [
  {
    id: 'mira-minimal', name: 'MIRA Minimal', category: 'Универсальный',
    description: 'Редакционный digital-стиль: орбитальная графика, крупный акцент и спокойная информационная зона.',
    palette: { background: '#0b1018', surface: 'rgba(13,21,33,.82)', text: '#f7fbff', accent: '#f4c915' },
    backgrounds: ['radial-gradient(circle at 16% 18%,rgba(75,120,170,.28),transparent 34%)', 'linear-gradient(118deg,transparent 0 70%,rgba(244,201,21,.08) 70% 71%,transparent 71%)'],
    art: '/assets/presets/mira-minimal.svg', layout: 'hero-left', title: 'МЕНЮ', brand: 'MIRA / DAILY', promo: 'СЕГОДНЯ · СВЕЖЕЕ · АКТУАЛЬНО', widget: 'clock', widgetVariant: 'minimal',
    tablePreset: 'clean', density: 'comfortable', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['fade','none',620], menu: ['slide-up','none',760], art: ['scale','float',1100], promo: ['fade','pulse',900], widget: ['fade','none',700] }
  },
  {
    id: 'taproom', name: 'Taproom', category: 'Бар',
    description: 'Барный экран с большим бокалом, хмелем, янтарным светом и отдельным блоком happy hour.',
    palette: { background: '#110d08', surface: 'rgba(34,24,13,.86)', text: '#fff7e8', accent: '#f0a928' },
    backgrounds: ['radial-gradient(circle at 20% 48%,rgba(240,169,40,.26),transparent 34%)', 'repeating-radial-gradient(circle at 7% 20%,rgba(255,220,160,.09) 0 3px,transparent 4px 30px)'],
    art: '/assets/presets/taproom.svg', layout: 'hero-left', title: 'ON TAP', brand: 'HOPS & BARREL', promo: 'HAPPY HOUR · 17:00—20:00', widget: 'clock', widgetVariant: 'seconds',
    tablePreset: 'menu-board', density: 'comfortable', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['slide-up','none',700], menu: ['fade','none',820], art: ['scale','float',1250], promo: ['scale','pulse',760], widget: ['fade','none',560] }
  },
  {
    id: 'modern-bistro', name: 'Modern Bistro', category: 'Ресторан',
    description: 'Светлый ресторанный макет: крупная тарелка, терракотовая геометрия и аккуратная вечерняя подача.',
    palette: { background: '#f0e6d6', surface: 'rgba(255,251,244,.94)', text: '#29231f', accent: '#b65f3d' },
    backgrounds: ['radial-gradient(ellipse at 92% 12%,rgba(182,95,61,.21) 0 19%,transparent 20%)', 'linear-gradient(112deg,transparent 0 67%,rgba(43,38,33,.06) 67% 68%,transparent 68%)'],
    art: '/assets/presets/modern-bistro.svg', layout: 'hero-right', title: 'SEASONAL MENU', brand: 'BISTRO / 24', promo: 'CHEF’S CHOICE', widget: 'weather', widgetVariant: 'minimal',
    tablePreset: 'bistro', density: 'comfortable', priceStyle: 'bold', headerStyle: 'subtle',
    motion: { title: ['fade','none',520], menu: ['slide-up','none',900], art: ['fade','none',1000], promo: ['slide-up','none',720], widget: ['scale','none',620] }
  },
  {
    id: 'coffee-house', name: 'Coffee House', category: 'Кафе',
    description: 'Тёплая кофейня с чашкой, зерном, кремовыми карточками и компактными часами.',
    palette: { background: '#f5eee5', surface: 'rgba(255,250,244,.94)', text: '#3b2d26', accent: '#9b6448' },
    backgrounds: ['radial-gradient(circle at 84% 22%,transparent 0 13%,rgba(155,100,72,.18) 13.5% 15%,transparent 15.5%)', 'radial-gradient(ellipse at 10% 96%,rgba(205,164,128,.20) 0 20%,transparent 21%)'],
    art: '/assets/presets/coffee-house.svg', layout: 'hero-right', title: 'COFFEE & FOOD', brand: 'THE COFFEE HOUSE', promo: 'ROASTED DAILY', widget: 'clock', widgetVariant: 'date',
    tablePreset: 'cafe', density: 'spacious', priceStyle: 'bold', headerStyle: 'subtle',
    motion: { title: ['fade','none',700], menu: ['scale','none',780], art: ['slide-up','float',1180], promo: ['fade','none',900], widget: ['slide-up','none',620] }
  },
  {
    id: 'chalk-board', name: 'Chalk Board', category: 'Бар · Кафе',
    description: 'Меловая доска с ручной иллюстрацией, рамкой, специальным предложением и мягким движением.',
    palette: { background: '#101310', surface: 'rgba(16,19,16,.78)', text: '#f5f1e7', accent: '#d8bd73' },
    backgrounds: ['repeating-linear-gradient(8deg,rgba(255,255,255,.025) 0 1px,transparent 1px 8px)', 'radial-gradient(circle at 18% 30%,rgba(255,255,255,.045),transparent 23%)'],
    art: '/assets/presets/chalk-board.svg', layout: 'hero-left', title: 'TODAY MENU', brand: 'HANDMADE / DAILY', promo: 'SPECIAL OF THE DAY', widget: 'weather', widgetVariant: 'compact',
    tablePreset: 'chalkboard', density: 'comfortable', priceStyle: 'plain', headerStyle: 'subtle',
    motion: { title: ['fade','none',850], menu: ['fade','none',1050], art: ['scale','float',1300], promo: ['slide-up','float',900], widget: ['fade','none',800] }
  },
  {
    id: 'night-neon', name: 'Night Neon', category: 'Бар',
    description: 'Ночной коктейльный экран с неоном, стеклом, холодным свечением и динамичной акцией.',
    palette: { background: '#06121a', surface: 'rgba(7,28,38,.84)', text: '#eaffff', accent: '#55e6d8' },
    backgrounds: ['radial-gradient(circle at 22% 25%,rgba(85,230,216,.24),transparent 32%)', 'linear-gradient(125deg,transparent 0 66%,rgba(133,82,255,.18) 66% 67%,transparent 67%)'],
    art: '/assets/presets/night-neon.svg', layout: 'hero-left', title: 'NIGHT MENU', brand: 'AFTER DARK', promo: '2 FOR 1 · 22:00—00:00', widget: 'clock', widgetVariant: 'seconds',
    tablePreset: 'menu-board', density: 'compact', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['scale','pulse',650], menu: ['fade','none',760], art: ['slide-up','float',1050], promo: ['scale','pulse',620], widget: ['fade','pulse',780] }
  },
  {
    id: 'premium-black', name: 'Premium Black', category: 'Ресторан',
    description: 'Премиальный тёмный экран с золотым светом, fine-dining иллюстрацией и спокойной анимацией.',
    palette: { background: '#070707', surface: 'rgba(18,18,18,.90)', text: '#f7f2e7', accent: '#c8a55a' },
    backgrounds: ['radial-gradient(ellipse at 76% 4%,rgba(200,165,90,.20),transparent 39%)', 'linear-gradient(110deg,transparent 0 72%,rgba(200,165,90,.08) 72% 72.5%,transparent 72.5%)'],
    art: '/assets/presets/premium-black.svg', layout: 'hero-right', title: 'SIGNATURE MENU', brand: 'MAISON / SIGNATURE', promo: 'CHEF’S TASTING', widget: 'clock', widgetVariant: 'minimal',
    tablePreset: 'bistro', density: 'spacious', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['fade','none',1100], menu: ['slide-up','none',1200], art: ['scale','none',1500], promo: ['fade','none',1300], widget: ['fade','none',900] }
  },
  {
    id: 'fresh-market', name: 'Fresh Market', category: 'Магазин',
    description: 'Яркий fresh-market: овощи, зелёные органические формы, погода и крупное предложение дня.',
    palette: { background: '#f6f8f2', surface: 'rgba(255,255,255,.94)', text: '#1f2d23', accent: '#4f8f62' },
    backgrounds: ['radial-gradient(ellipse at 90% 16%,rgba(79,143,98,.18) 0 17%,transparent 18%)', 'radial-gradient(ellipse at 7% 95%,rgba(146,187,118,.18) 0 21%,transparent 22%)'],
    art: '/assets/presets/fresh-market.svg', layout: 'hero-right', title: 'FRESH TODAY', brand: 'LOCAL MARKET', promo: 'ПРЕДЛОЖЕНИЕ ДНЯ', widget: 'weather', widgetVariant: 'forecast',
    tablePreset: 'clean', density: 'comfortable', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['slide-up','none',650], menu: ['fade','none',850], art: ['slide-up','float',1150], promo: ['scale','pulse',700], widget: ['scale','none',720] }
  }
];

export const SCENE_PRESETS = Object.freeze(PRESETS.map((preset) => Object.freeze(preset)));

export function getScenePreset(id) {
  return SCENE_PRESETS.find((preset) => preset.id === id) || null;
}

function displayCount(value) {
  return Math.min(MAX_DISPLAYS, Math.max(MIN_DISPLAYS, Math.round(Number(value) || 1)));
}

function motionTuple(tuple) {
  return { entrance: tuple?.[0] || 'none', loop: tuple?.[1] || 'none', exit: 'none', duration_ms: tuple?.[2] || 600 };
}

function element(type, geometry, style = {}, extra = {}) {
  return { type, geometry, style, ...extra };
}

function graphicStyle(url, accent, radius = 30) {
  return {
    color: accent, background: `url('${url}') center/contain no-repeat`, font_size: 40, font_weight: 400,
    text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 0,
    radius, border_width: 0, border_color: accent
  };
}

function textStyle(preset, { size = 56, weight = 700, align = 'left', color = null, background = 'transparent', radius = 0 } = {}) {
  return {
    color: color || preset.palette.text, background, font_size: size, font_weight: weight,
    text_align: align, vertical_align: 'center', line_height: .98, letter_spacing: .6,
    radius, border_width: 0, border_color: preset.palette.accent
  };
}

function geometryScaler(canvasWidth) {
  const scaleX = canvasWidth / DISPLAY_WIDTH;
  return (x, y, width, height) => ({ x: x * scaleX, y, width: width * scaleX, height });
}

function layoutGeometry(preset, canvasWidth) {
  const g = geometryScaler(canvasWidth);
  const leftHero = preset.layout === 'hero-left';
  return {
    brand: g(88, 58, 650, 56),
    title: leftHero ? g(780, 102, 1040, 100) : g(92, 102, 1080, 100),
    menu: leftHero ? g(760, 220, 1060, 760) : g(90, 220, 1110, 760),
    art: leftHero ? g(70, 190, 650, 650) : g(1230, 170, 610, 670),
    promoBox: leftHero ? g(105, 830, 560, 132) : g(1270, 820, 520, 132),
    promo: leftHero ? g(125, 846, 520, 96) : g(1290, 836, 480, 96),
    widget: leftHero ? g(95, 115, 540, 150) : g(1320, 55, 430, 140)
  };
}

function backgroundElements(preset, canvasWidth) {
  return preset.backgrounds.map((background, index) => element('shape', { x: 0, y: 0, width: canvasWidth, height: DISPLAY_HEIGHT }, {
    color: preset.palette.text, background, font_size: 40, font_weight: 400, text_align: 'center', vertical_align: 'center',
    line_height: 1, letter_spacing: 0, radius: 0, border_width: 0, border_color: preset.palette.background
  }, { managed: true, role: `background-${index}`, animation: motionTuple(['fade','none',500 + index * 120]) }));
}

export function buildScenePresetLayout(presetSource, requestedDisplays = 1) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');
  const displays = displayCount(requestedDisplays);
  const canvasWidth = DISPLAY_WIDTH * displays;
  const geo = layoutGeometry(preset, canvasWidth);
  const elements = [...backgroundElements(preset, canvasWidth)];

  elements.push(
    element('text', geo.brand, textStyle(preset, { size: 30, weight: 800, color: preset.palette.accent }), {
      content: preset.brand, role: 'brand', managed: true, animation: motionTuple(preset.motion.widget)
    }),
    element('text', geo.title, textStyle(preset, { size: 72, weight: 800 }), {
      content: preset.title, role: 'title', managed: false, animation: motionTuple(preset.motion.title)
    }),
    element('shape', geo.art, graphicStyle(preset.art, preset.palette.accent, 28), {
      content: `${preset.name} artwork`, role: 'art', managed: true,
      effects: { shadow: preset.id !== 'chalk-board', glow: preset.id === 'night-neon', blur: 0 },
      animation: motionTuple(preset.motion.art)
    }),
    element('shape', geo.promoBox, {
      color: preset.palette.text, background: preset.palette.surface, font_size: 40, font_weight: 400,
      text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 0,
      radius: 28, border_width: 1, border_color: preset.palette.accent
    }, { role: 'promo-box', managed: true, animation: motionTuple(preset.motion.promo) }),
    element('text', geo.promo, textStyle(preset, { size: 28, weight: 800, align: 'center', color: preset.palette.accent }), {
      content: preset.promo, role: 'promo', managed: true, animation: motionTuple(preset.motion.promo)
    })
  );

  elements.push(element('table', geo.menu, {
    color: preset.palette.text, background: preset.palette.surface, font_size: 42, font_weight: 500,
    text_align: 'left', vertical_align: 'top', line_height: 1.04, letter_spacing: 0,
    radius: 24, border_width: preset.id === 'night-neon' || preset.id === 'chalk-board' ? 1 : 0,
    border_color: preset.palette.accent
  }, {
    content: 'Меню', role: 'menu', managed: false, animation: motionTuple(preset.motion.menu),
    table: {
      preset: preset.tablePreset, density: preset.density, headerStyle: preset.headerStyle,
      priceStyle: preset.priceStyle, accentColor: preset.palette.accent,
      showTitle: false, rowDividers: ['clean','bistro'].includes(preset.tablePreset), zebra: preset.id === 'fresh-market',
      rowLimit: preset.density === 'compact' ? 16 : preset.density === 'spacious' ? 10 : 12
    }
  }));

  elements.push(element(preset.widget, geo.widget, {
    color: preset.palette.text, background: preset.palette.surface, font_size: preset.widget === 'clock' ? 54 : 34,
    font_weight: 700, text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 0,
    radius: 24, border_width: 1, border_color: preset.palette.accent
  }, {
    content: preset.widget === 'clock' ? 'Часы' : 'Погода', variant: preset.widgetVariant,
    role: 'widget', managed: true, weather: preset.widget === 'weather' ? { location: '' } : undefined,
    animation: motionTuple(preset.motion.widget)
  }));

  return { id: preset.id, name: preset.name, displayCount: displays, canvasWidth, canvasHeight: DISPLAY_HEIGHT, background: preset.palette.background, elements };
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isManagedElement(element) {
  return String(element?.id || '').startsWith(MANAGED_ID_PREFIX);
}

function animationForElement(element, preset) {
  if (element.type === 'table') return motionTuple(preset.motion.menu);
  if (['image','logo','video','shape'].includes(element.type)) return motionTuple(preset.motion.art);
  if (['clock','weather'].includes(element.type)) return motionTuple(preset.motion.widget);
  return motionTuple(preset.motion.title);
}

function restyleElement(element, preset) {
  element.style = element.style && typeof element.style === 'object' ? element.style : {};
  element.effects = { shadow: false, glow: false, blur: 0, ...(element.effects || {}) };
  element.animation = animationForElement(element, preset);
  if (['text','table','weather','clock'].includes(element.type)) {
    element.style.color = preset.palette.text;
    element.style.border_color = preset.palette.accent;
  }
  if (element.type === 'table') {
    element.style.background = preset.palette.surface;
    element.style.radius = 24;
    element.style.border_width = preset.id === 'night-neon' || preset.id === 'chalk-board' ? 1 : 0;
    const table = element.table && typeof element.table === 'object' ? element.table : {};
    const appearance = table.appearance && typeof table.appearance === 'object' ? table.appearance : {};
    element.table = { ...table, appearance: {
      ...appearance, preset: preset.tablePreset, density: preset.density, header_style: preset.headerStyle,
      price_style: preset.priceStyle, accent_color: preset.palette.accent,
      row_dividers: ['clean','bistro'].includes(preset.tablePreset), zebra: preset.id === 'fresh-market'
    } };
  }
  if (['weather','clock'].includes(element.type)) {
    element.style.background = preset.palette.surface;
    element.style.radius = 24;
    element.style.border_width = 1;
  }
  if (['image','logo','video'].includes(element.type)) {
    element.style.border_color = preset.palette.accent;
    element.effects.shadow = preset.id !== 'chalk-board';
    element.effects.glow = preset.id === 'night-neon';
  }
}

function materializeElement(scene, slide, spec, index) {
  const managed = spec.managed === true;
  const idPrefix = managed ? MANAGED_ID_PREFIX : CORE_ID_PREFIX;
  const style = {
    color: '#ffffff', font_size: 40, font_weight: 400, text_align: 'center', vertical_align: 'center',
    line_height: 1.06, letter_spacing: 0, background: 'transparent', radius: 0, border_width: 0, border_color: '#ffffff',
    ...(spec.style || {})
  };
  const item = {
    id: `${idPrefix}${slide.id}-${spec.role || index}-${index}`,
    type: spec.type,
    x: spec.geometry.x, y: spec.geometry.y, width: spec.geometry.width, height: spec.geometry.height,
    z_index: managed && String(spec.role || '').startsWith('background') ? index : 20 + index,
    opacity: 1, content: spec.content || '', variant: spec.variant || 'default', style,
    effects: { shadow: false, glow: false, blur: 0, ...(spec.effects || {}) },
    animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600, ...(spec.animation || {}) }
  };
  if (spec.type === 'table') {
    item.data_binding = { source: 'catalog_items' };
    item.table = {
      view_id: 0, item_ids: [], class_code: '', group_by_class: true, show_description: false, show_metadata: true,
      price_layout: 'single', quantity_unit: 'л', active_only: true,
      row_limit: spec.table?.rowLimit || 12, quantities: [0.5,1,1.5], volumes_l: [0.5,1,1.5],
      show_producer: true, show_strength: true, show_color: true, show_filtration: true,
      appearance: {
        preset: spec.table?.preset || 'clean', density: spec.table?.density || 'comfortable',
        header_style: spec.table?.headerStyle || 'subtle', price_style: spec.table?.priceStyle || 'accent',
        accent_color: spec.table?.accentColor || '#f4c915', show_title: spec.table?.showTitle === true,
        row_dividers: spec.table?.rowDividers !== false, zebra: spec.table?.zebra === true
      }
    };
  }
  if (spec.type === 'weather') item.weather = spec.weather || { location: '' };
  return item;
}

export function applySceneDesignPreset(sceneSource, presetSource) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');
  if (!sceneSource || !Array.isArray(sceneSource.slides) || !sceneSource.slides.length) throw new Error('Invalid scene');
  const scene = clone(sceneSource);
  const allNonManaged = scene.slides.flatMap((slide) => slide.elements || []).filter((item) => !isManagedElement(item));
  const seeded = allNonManaged.length === 0;
  const layout = buildScenePresetLayout(preset, scene.display_count);

  for (const slide of scene.slides) {
    const existing = (slide.elements || []).filter((item) => !isManagedElement(item));
    existing.forEach((item) => restyleElement(item, preset));
    slide.background = { type: 'color', color: preset.palette.background, asset_id: '' };
    const specs = seeded ? layout.elements : layout.elements.filter((item) => item.managed === true);
    const generated = specs.map((spec, index) => materializeElement(scene, slide, spec, index));
    slide.elements = [...generated, ...existing];
  }

  if (seeded && (!String(scene.name || '').trim() || scene.name === 'Новая сцена')) scene.name = preset.name;
  return { scene, seeded };
}

export function isSceneDesignManagedElement(element) {
  return isManagedElement(element);
}
