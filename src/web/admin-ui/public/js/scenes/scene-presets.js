const DISPLAY_WIDTH = 1920;
const DISPLAY_HEIGHT = 1080;
const MIN_DISPLAYS = 1;
const MAX_DISPLAYS = 6;
const MANAGED_ID_PREFIX = 'element-preset-managed-';
const CORE_ID_PREFIX = 'element-preset-core-';

const PRESETS = [
  {
    id: 'taproom', name: 'Taproom Sales Pack', category: 'Бар',
    description: 'Крафтовый бар: разливное меню, кран недели, happy hour и допродажа закусок.',
    palette: { background: '#110d08', surface: 'rgba(34,24,13,.88)', text: '#fff7e8', accent: '#f0a928' },
    backgrounds: ['radial-gradient(circle at 18% 48%,rgba(240,169,40,.28),transparent 34%)', 'repeating-radial-gradient(circle at 7% 20%,rgba(255,220,160,.08) 0 3px,transparent 4px 30px)'],
    art: '/assets/presets/taproom.svg', layout: 'hero-left', brand: 'HOPS & BARREL', widget: 'clock', widgetVariant: 'seconds',
    tablePreset: 'menu-board', density: 'comfortable', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['slide-up','none',700], menu: ['fade','none',820], art: ['scale','float',1250], promo: ['scale','pulse',760], widget: ['fade','none',560] },
    previewRows: [['Citrus IPA','390'],['Helles Lager','340'],['Dark Stout','420']],
    campaign: [
      { kind: 'menu', label: 'Основное меню', kicker: '12 КРАНОВ · СЕГОДНЯ', title: 'ON TAP', promo: 'СВЕЖИЙ РОЗЛИВ · ОБНОВЛЯЕТСЯ ЕЖЕДНЕВНО' },
      { kind: 'hero', label: 'Кран недели', kicker: 'ВЫБОР БАРМЕНА', title: 'КРАН НЕДЕЛИ', promo: 'НОВИНКА · ПОПРОБУЙТЕ ПЕРВЫМ' },
      { kind: 'offer', label: 'Happy Hour', kicker: 'ТОЛЬКО СЕГОДНЯ', title: 'HAPPY HOUR', promo: '17:00—20:00 · СПЕЦЦЕНА НА ИЗБРАННЫЕ ПОЗИЦИИ' },
      { kind: 'upsell', label: 'К пиву', kicker: 'ИДЕАЛЬНАЯ ПАРА', title: 'К ПИВУ', promo: 'ДОБАВЬТЕ ЗАКУСКУ К ЛЮБИМОМУ СОРТУ' }
    ]
  },
  {
    id: 'night-neon', name: 'Cocktail Night', category: 'Бар',
    description: 'Коктейльный бар: signature drinks, вечерняя акция, premium serve и ночной upsell.',
    palette: { background: '#06121a', surface: 'rgba(7,28,38,.86)', text: '#eaffff', accent: '#55e6d8' },
    backgrounds: ['radial-gradient(circle at 22% 25%,rgba(85,230,216,.24),transparent 32%)', 'linear-gradient(125deg,transparent 0 66%,rgba(133,82,255,.18) 66% 67%,transparent 67%)'],
    art: '/assets/presets/night-neon.svg', layout: 'hero-left', brand: 'AFTER DARK', widget: 'clock', widgetVariant: 'seconds',
    tablePreset: 'menu-board', density: 'compact', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['scale','pulse',650], menu: ['fade','none',760], art: ['slide-up','float',1050], promo: ['scale','pulse',620], widget: ['fade','pulse',780] },
    previewRows: [['NEON SOUR','590'],['MIDNIGHT IPA','420'],['HIGHBALL','540']],
    campaign: [
      { kind: 'menu', label: 'Cocktail Menu', kicker: 'SIGNATURE COLLECTION', title: 'NIGHT MENU', promo: 'КОКТЕЙЛИ · HIGHBALL · ZERO PROOF' },
      { kind: 'hero', label: 'Signature', kicker: 'BARTENDER SIGNATURE', title: 'NEON SOUR', promo: 'АВТОРСКИЙ КОКТЕЙЛЬ ВЕЧЕРА' },
      { kind: 'offer', label: '2 for 1', kicker: '22:00—00:00', title: '2 FOR 1', promo: 'ДВА SIGNATURE COCKTAIL ПО ЦЕНЕ ОДНОГО' },
      { kind: 'upsell', label: 'Bar Bites', kicker: 'PAIR IT', title: 'BAR BITES', promo: 'ЗАКУСКИ, КОТОРЫЕ ПРОДОЛЖАЮТ ВЕЧЕР' }
    ]
  },
  {
    id: 'chalk-board', name: 'Craft Pub', category: 'Бар',
    description: 'Тёплый паб: меловая подача, блюдо дня, пивной pairing и предложение компании.',
    palette: { background: '#101310', surface: 'rgba(16,19,16,.80)', text: '#f5f1e7', accent: '#d8bd73' },
    backgrounds: ['repeating-linear-gradient(8deg,rgba(255,255,255,.025) 0 1px,transparent 1px 8px)', 'radial-gradient(circle at 18% 30%,rgba(255,255,255,.045),transparent 23%)'],
    art: '/assets/presets/chalk-board.svg', layout: 'hero-right', brand: 'CRAFT / KITCHEN', widget: 'weather', widgetVariant: 'compact',
    tablePreset: 'chalkboard', density: 'comfortable', priceStyle: 'plain', headerStyle: 'subtle',
    motion: { title: ['fade','none',850], menu: ['fade','none',1050], art: ['scale','float',1300], promo: ['slide-up','float',900], widget: ['fade','none',800] },
    previewRows: [['Бургер паб','690'],['Fish & Chips','620'],['Крылья BBQ','540']],
    campaign: [
      { kind: 'menu', label: 'Pub Menu', kicker: 'CRAFT FOOD & BEER', title: 'PUB MENU', promo: 'БУРГЕРЫ · ГРИЛЬ · ЗАКУСКИ' },
      { kind: 'hero', label: 'Блюдо дня', kicker: 'TODAY SPECIAL', title: 'БЛЮДО ДНЯ', promo: 'ОГРАНИЧЕННАЯ ПАРТИЯ · СПРОСИТЕ БАРМЕНА' },
      { kind: 'upsell', label: 'Pairing', kicker: 'BEER + FOOD', title: 'ИДЕАЛЬНАЯ ПАРА', promo: 'ПОДБЕРИТЕ СОРТ К БЛЮДУ' },
      { kind: 'offer', label: 'Для компании', kicker: 'SHARE MORE', title: 'НА КОМПАНИЮ', promo: 'БОЛЬШОЙ СЕТ · ВЫГОДНЕЕ ВМЕСТЕ' }
    ]
  },
  {
    id: 'coffee-house', name: 'Coffee House', category: 'Кафе',
    description: 'Кофейня: основное меню, напиток сезона, кофе с выпечкой и утреннее комбо.',
    palette: { background: '#f5eee5', surface: 'rgba(255,250,244,.95)', text: '#3b2d26', accent: '#9b6448' },
    backgrounds: ['radial-gradient(circle at 84% 22%,transparent 0 13%,rgba(155,100,72,.18) 13.5% 15%,transparent 15.5%)', 'radial-gradient(ellipse at 10% 96%,rgba(205,164,128,.20) 0 20%,transparent 21%)'],
    art: '/assets/presets/coffee-house.svg', layout: 'hero-right', brand: 'THE COFFEE HOUSE', widget: 'clock', widgetVariant: 'date',
    tablePreset: 'cafe', density: 'spacious', priceStyle: 'bold', headerStyle: 'subtle',
    motion: { title: ['fade','none',700], menu: ['scale','none',780], art: ['slide-up','float',1180], promo: ['fade','none',900], widget: ['slide-up','none',620] },
    previewRows: [['Капучино','240'],['Флэт уайт','280'],['Круассан','210']],
    campaign: [
      { kind: 'menu', label: 'Coffee & Food', kicker: 'ROASTED DAILY', title: 'COFFEE & FOOD', promo: 'КОФЕ · ВЫПЕЧКА · ЗАВТРАКИ' },
      { kind: 'hero', label: 'Напиток сезона', kicker: 'SEASONAL DROP', title: 'НАПИТОК СЕЗОНА', promo: 'ПОПРОБУЙТЕ, ПОКА ОН В МЕНЮ' },
      { kind: 'upsell', label: 'Coffee + pastry', kicker: 'PERFECT MATCH', title: 'КОФЕ + ВЫПЕЧКА', promo: 'ВМЕСТЕ ВКУСНЕЕ · ДОБАВЬТЕ ДЕСЕРТ' },
      { kind: 'offer', label: 'Утреннее комбо', kicker: 'ДО 11:00', title: 'GOOD MORNING', promo: 'КОФЕ + ЗАВТРАК ПО СПЕЦИАЛЬНОЙ ЦЕНЕ' }
    ]
  },
  {
    id: 'mira-minimal', name: 'Brunch Studio', category: 'Кафе',
    description: 'Современный brunch: чистая типографика, завтрак, hero-позиция и комбо для роста среднего чека.',
    palette: { background: '#0b1018', surface: 'rgba(13,21,33,.84)', text: '#f7fbff', accent: '#f4c915' },
    backgrounds: ['radial-gradient(circle at 16% 18%,rgba(75,120,170,.28),transparent 34%)', 'linear-gradient(118deg,transparent 0 70%,rgba(244,201,21,.08) 70% 71%,transparent 71%)'],
    art: '/assets/presets/mira-minimal.svg', layout: 'hero-left', brand: 'BRUNCH / DAILY', widget: 'weather', widgetVariant: 'minimal',
    tablePreset: 'clean', density: 'comfortable', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['fade','none',620], menu: ['slide-up','none',760], art: ['scale','float',1100], promo: ['fade','pulse',900], widget: ['fade','none',700] },
    previewRows: [['Авокадо тост','490'],['Боул','620'],['Сырники','350']],
    campaign: [
      { kind: 'menu', label: 'Brunch Menu', kicker: 'ALL DAY BREAKFAST', title: 'BRUNCH MENU', promo: 'ЗАВТРАКИ ВЕСЬ ДЕНЬ' },
      { kind: 'hero', label: 'Бестселлер', kicker: 'MOST LOVED', title: 'БЕСТСЕЛЛЕР', promo: 'ПОЗИЦИЯ, ЗА КОТОРОЙ ВОЗВРАЩАЮТСЯ' },
      { kind: 'offer', label: 'Комбо', kicker: 'SMART CHOICE', title: 'BRUNCH COMBO', promo: 'ОСНОВНОЕ + НАПИТОК · ВЫГОДНЕЕ ВМЕСТЕ' },
      { kind: 'upsell', label: 'Add coffee', kicker: 'MAKE IT BETTER', title: '+ КОФЕ', promo: 'ДОБАВЬТЕ НАПИТОК К ЛЮБОМУ ЗАВТРАКУ' }
    ]
  },
  {
    id: 'fresh-market', name: 'Bakery & Fresh', category: 'Кафе',
    description: 'Пекарня-кафе: свежая выпечка, горячая партия, lunch combo и afternoon deal.',
    palette: { background: '#f6f8f2', surface: 'rgba(255,255,255,.95)', text: '#1f2d23', accent: '#4f8f62' },
    backgrounds: ['radial-gradient(ellipse at 90% 16%,rgba(79,143,98,.18) 0 17%,transparent 18%)', 'radial-gradient(ellipse at 7% 95%,rgba(146,187,118,.18) 0 21%,transparent 22%)'],
    art: '/assets/presets/fresh-market.svg', layout: 'hero-right', brand: 'BAKERY / DAILY', widget: 'clock', widgetVariant: 'minimal',
    tablePreset: 'clean', density: 'comfortable', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['slide-up','none',650], menu: ['fade','none',850], art: ['slide-up','float',1150], promo: ['scale','pulse',700], widget: ['scale','none',720] },
    previewRows: [['Круассан','190'],['Фокачча','260'],['Чизкейк','430']],
    campaign: [
      { kind: 'menu', label: 'Fresh Today', kicker: 'BAKED TODAY', title: 'FRESH TODAY', promo: 'СВЕЖАЯ ВЫПЕЧКА КАЖДЫЙ ДЕНЬ' },
      { kind: 'hero', label: 'Из печи', kicker: 'JUST BAKED', title: 'ГОРЯЧАЯ ПАРТИЯ', promo: 'ТОЛЬКО ИЗ ПЕЧИ · ПОКА НЕ РАЗОБРАЛИ' },
      { kind: 'upsell', label: 'Lunch combo', kicker: 'LUNCH 12—16', title: 'LUNCH COMBO', promo: 'СЭНДВИЧ + НАПИТОК' },
      { kind: 'offer', label: 'Afternoon', kicker: 'ПОСЛЕ 16:00', title: 'SWEET AFTERNOON', promo: 'КОФЕ + ДЕСЕРТ ПО СПЕЦИАЛЬНОЙ ЦЕНЕ' }
    ]
  },
  {
    id: 'modern-bistro', name: 'Modern Bistro', category: 'Ресторан',
    description: 'Ресторан: основное меню, chef special, wine pairing и десертная допродажа.',
    palette: { background: '#f0e6d6', surface: 'rgba(255,251,244,.95)', text: '#29231f', accent: '#b65f3d' },
    backgrounds: ['radial-gradient(ellipse at 92% 12%,rgba(182,95,61,.21) 0 19%,transparent 20%)', 'linear-gradient(112deg,transparent 0 67%,rgba(43,38,33,.06) 67% 68%,transparent 68%)'],
    art: '/assets/presets/modern-bistro.svg', layout: 'hero-right', brand: 'BISTRO / 24', widget: 'weather', widgetVariant: 'minimal',
    tablePreset: 'bistro', density: 'comfortable', priceStyle: 'bold', headerStyle: 'subtle',
    motion: { title: ['fade','none',520], menu: ['slide-up','none',900], art: ['fade','none',1000], promo: ['slide-up','none',720], widget: ['scale','none',620] },
    previewRows: [['Тартар','790'],['Паста с трюфелем','980'],['Десерт дня','520']],
    campaign: [
      { kind: 'menu', label: 'Seasonal Menu', kicker: 'SEASONAL KITCHEN', title: 'SEASONAL MENU', promo: 'СЕЗОННЫЕ ПРОДУКТЫ · ЧЕСТНЫЙ ВКУС' },
      { kind: 'hero', label: 'Chef Special', kicker: 'CHEF’S CHOICE', title: 'SPECIAL TODAY', promo: 'БЛЮДО, КОТОРОЕ СТОИТ ПОПРОБОВАТЬ СЕГОДНЯ' },
      { kind: 'upsell', label: 'Wine Pairing', kicker: 'PERFECT PAIRING', title: 'WINE PAIRING', promo: 'РЕКОМЕНДОВАНО К ВАШЕМУ БЛЮДУ' },
      { kind: 'offer', label: 'Dessert', kicker: 'SAVE ROOM', title: 'DESSERT?', promo: 'ЗАВЕРШИТЕ УЖИН ПРАВИЛЬНО' }
    ]
  },
  {
    id: 'premium-black', name: 'Chef Signature', category: 'Ресторан',
    description: 'Премиальный ресторан: signature menu, tasting set, pairing и финальный dessert moment.',
    palette: { background: '#070707', surface: 'rgba(18,18,18,.92)', text: '#f7f2e7', accent: '#c8a55a' },
    backgrounds: ['radial-gradient(ellipse at 76% 4%,rgba(200,165,90,.20),transparent 39%)', 'linear-gradient(110deg,transparent 0 72%,rgba(200,165,90,.08) 72% 72.5%,transparent 72.5%)'],
    art: '/assets/presets/premium-black.svg', layout: 'hero-right', brand: 'MAISON / SIGNATURE', widget: 'clock', widgetVariant: 'minimal',
    tablePreset: 'bistro', density: 'spacious', priceStyle: 'accent', headerStyle: 'subtle',
    motion: { title: ['fade','none',1100], menu: ['slide-up','none',1200], art: ['scale','none',1500], promo: ['fade','none',1300], widget: ['fade','none',900] },
    previewRows: [['SIGNATURE','1490'],['CHEF SPECIAL','1890'],['DESSERT','690']],
    campaign: [
      { kind: 'menu', label: 'Signature Menu', kicker: 'MAISON SIGNATURE', title: 'SIGNATURE MENU', promo: 'АВТОРСКАЯ КУХНЯ · ВЕЧЕРНЯЯ ПОДАЧА' },
      { kind: 'hero', label: 'Tasting', kicker: 'CHEF EXPERIENCE', title: 'TASTING SET', promo: 'НЕСКОЛЬКО КУРСОВ · ОДНА ИСТОРИЯ' },
      { kind: 'upsell', label: 'Pairing', kicker: 'SOMMELIER PICK', title: 'PAIRING', promo: 'ВИНО, КОТОРОЕ РАСКРЫВАЕТ БЛЮДО' },
      { kind: 'offer', label: 'Finale', kicker: 'THE FINALE', title: 'DESSERT MOMENT', promo: 'ФИНАЛ, КОТОРЫЙ ЗАПОМНЯТ' }
    ]
  }
];

export const SCENE_PRESETS = Object.freeze(PRESETS.map((preset) => Object.freeze(preset)));

export function getScenePreset(id) {
  return SCENE_PRESETS.find((preset) => preset.id === id) || null;
}

function displayCount(value) {
  return Math.min(MAX_DISPLAYS, Math.max(MIN_DISPLAYS, Math.round(Number(value) || 1)));
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function uid(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function motionTuple(tuple) {
  return { entrance: tuple?.[0] || 'none', loop: tuple?.[1] || 'none', exit: 'none', duration_ms: tuple?.[2] || 600 };
}

function element(type, geometry, style = {}, extra = {}) {
  return { type, geometry, style, ...extra };
}

function textStyle(preset, { size = 56, weight = 700, align = 'left', color = null, background = 'transparent', radius = 0 } = {}) {
  return {
    color: color || preset.palette.text, background, font_size: size, font_weight: weight,
    text_align: align, vertical_align: 'center', line_height: .98, letter_spacing: .6,
    radius, border_width: 0, border_color: preset.palette.accent
  };
}

function graphicStyle(url, preset, radius = 30) {
  return {
    color: preset.palette.accent, background: `url('${url}') center/contain no-repeat`, font_size: 40, font_weight: 400,
    text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 0,
    radius, border_width: 0, border_color: preset.palette.accent
  };
}

function layoutGeometry(preset, canvasWidth, kind = 'menu') {
  const leftHero = preset.layout === 'hero-left';
  const multi = canvasWidth > DISPLAY_WIDTH;
  if (!multi) {
    if (kind === 'hero' || kind === 'offer') {
      return {
        brand: { x: 90, y: 54, width: 600, height: 56 },
        logo: { x: 1450, y: 42, width: 360, height: 76 },
        title: { x: 90, y: 145, width: 900, height: 180 },
        art: { x: leftHero ? 950 : 1040, y: 145, width: 760, height: 760 },
        promoBox: { x: 90, y: 560, width: 760, height: 190 },
        promo: { x: 125, y: 590, width: 690, height: 130 },
        widget: { x: 90, y: 800, width: 430, height: 140 },
        menu: { x: 90, y: 350, width: 760, height: 190 }
      };
    }
    return {
      brand: { x: 88, y: 58, width: 650, height: 56 },
      logo: leftHero ? { x: 1450, y: 38, width: 360, height: 76 } : { x: 90, y: 38, width: 330, height: 76 },
      title: leftHero ? { x: 780, y: 102, width: 1040, height: 100 } : { x: 92, y: 102, width: 1080, height: 100 },
      menu: leftHero ? { x: 760, y: 220, width: 1060, height: 760 } : { x: 90, y: 220, width: 1110, height: 760 },
      art: leftHero ? { x: 70, y: 240, width: 620, height: 560 } : { x: 1260, y: 210, width: 560, height: 590 },
      promoBox: leftHero ? { x: 105, y: 830, width: 560, height: 132 } : { x: 1270, y: 820, width: 520, height: 132 },
      promo: leftHero ? { x: 125, y: 846, width: 520, height: 96 } : { x: 1290, y: 836, width: 480, height: 96 },
      widget: leftHero ? { x: 95, y: 120, width: 500, height: 120 } : { x: 1320, y: 70, width: 430, height: 120 }
    };
  }

  const heroStart = leftHero ? 0 : canvasWidth - DISPLAY_WIDTH;
  const contentStart = leftHero ? DISPLAY_WIDTH : 0;
  const contentWidth = canvasWidth - DISPLAY_WIDTH;
  const art = { x: heroStart + 180, y: kind === 'menu' ? 230 : 180, width: 1380, height: kind === 'menu' ? 620 : 760 };
  const menu = { x: contentStart + 100, y: 235, width: Math.max(1200, contentWidth - 200), height: 735 };
  return {
    brand: { x: heroStart + 100, y: 64, width: 700, height: 56 },
    logo: { x: canvasWidth - 470, y: 50, width: 360, height: 76 },
    title: kind === 'hero' || kind === 'offer'
      ? { x: heroStart + 110, y: 140, width: 1500, height: 170 }
      : { x: contentStart + 100, y: 100, width: Math.max(1100, contentWidth - 700), height: 110 },
    menu,
    art,
    promoBox: { x: heroStart + 130, y: 800, width: 1480, height: 150 },
    promo: { x: heroStart + 165, y: 822, width: 1410, height: 105 },
    widget: { x: contentStart + Math.max(100, contentWidth - 520), y: 70, width: 420, height: 120 }
  };
}

function backgroundElements(preset, canvasWidth) {
  return preset.backgrounds.map((background, index) => element('shape', { x: 0, y: 0, width: canvasWidth, height: DISPLAY_HEIGHT }, {
    color: preset.palette.text, background, font_size: 40, font_weight: 400, text_align: 'center', vertical_align: 'center',
    line_height: 1, letter_spacing: 0, radius: 0, border_width: 0, border_color: preset.palette.background
  }, { managed: true, role: `background-${index}`, animation: motionTuple(['fade','none',500 + index * 120]) }));
}

function tableSpec(preset, geometry, rowLimit = 12) {
  return element('table', geometry, {
    color: preset.palette.text, background: preset.palette.surface, font_size: 42, font_weight: 500,
    text_align: 'left', vertical_align: 'top', line_height: 1.04, letter_spacing: 0,
    radius: 24, border_width: preset.id === 'night-neon' || preset.id === 'chalk-board' ? 1 : 0,
    border_color: preset.palette.accent
  }, {
    content: 'Меню', role: 'menu', managed: false, animation: motionTuple(preset.motion.menu),
    table: {
      preset: preset.tablePreset, density: preset.density, headerStyle: preset.headerStyle,
      priceStyle: preset.priceStyle, accentColor: preset.palette.accent,
      showTitle: false, rowDividers: ['clean','bistro'].includes(preset.tablePreset), zebra: preset.id === 'fresh-market', rowLimit
    }
  });
}

export function buildScenePresetLayout(presetSource, requestedDisplays = 1, slideIndex = 0) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');
  const displays = displayCount(requestedDisplays);
  const canvasWidth = DISPLAY_WIDTH * displays;
  const slide = preset.campaign[slideIndex % preset.campaign.length] || preset.campaign[0];
  const geo = layoutGeometry(preset, canvasWidth, slide.kind);
  const elements = [...backgroundElements(preset, canvasWidth)];

  elements.push(
    element('text', geo.brand, textStyle(preset, { size: 30, weight: 800, color: preset.palette.accent }), {
      content: preset.brand, role: 'brand', managed: true, animation: motionTuple(preset.motion.widget)
    }),
    element('text', geo.title, textStyle(preset, { size: slide.kind === 'hero' || slide.kind === 'offer' ? 92 : 72, weight: 850 }), {
      content: slide.title, role: 'title', managed: false, animation: motionTuple(preset.motion.title)
    }),
    element('shape', geo.art, graphicStyle(preset.art, preset, 28), {
      content: `${preset.name} artwork`, role: 'art', managed: true,
      effects: { shadow: preset.id !== 'chalk-board', glow: preset.id === 'night-neon', blur: 0 },
      animation: motionTuple(preset.motion.art)
    }),
    element('shape', geo.promoBox, {
      color: preset.palette.text, background: preset.palette.surface, font_size: 40, font_weight: 400,
      text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 0,
      radius: 28, border_width: 1, border_color: preset.palette.accent
    }, { role: 'promo-box', managed: true, animation: motionTuple(preset.motion.promo) }),
    element('text', geo.promo, textStyle(preset, { size: slide.kind === 'offer' ? 34 : 28, weight: 850, align: 'center', color: preset.palette.accent }), {
      content: `${slide.kicker} · ${slide.promo}`, role: 'promo', managed: true, animation: motionTuple(preset.motion.promo)
    }),
    element(preset.widget, geo.widget, {
      color: preset.palette.text, background: preset.palette.surface, font_size: preset.widget === 'clock' ? 54 : 34,
      font_weight: 700, text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 0,
      radius: 24, border_width: 1, border_color: preset.palette.accent
    }, {
      content: preset.widget === 'clock' ? 'Часы' : 'Погода', variant: preset.widgetVariant,
      role: 'widget', managed: true, weather: preset.widget === 'weather' ? { location: '' } : undefined,
      animation: motionTuple(preset.motion.widget)
    }),
    element('logo', geo.logo, {
      color: preset.palette.text, background: 'transparent', font_size: 24, font_weight: 700,
      text_align: 'center', vertical_align: 'center', line_height: 1, letter_spacing: 1,
      radius: 18, border_width: 1, border_color: preset.palette.accent
    }, {
      content: 'ВАШ ЛОГОТИП', role: 'logo', managed: false, asset_id: '', media: { fit: 'contain', position: 'center' },
      animation: motionTuple(['fade','none',700])
    })
  );

  if (slide.kind === 'menu') elements.push(tableSpec(preset, geo.menu, preset.density === 'compact' ? 16 : preset.density === 'spacious' ? 10 : 12));
  if (slide.kind === 'upsell') elements.push(tableSpec(preset, geo.menu, 6));

  return {
    id: preset.id, name: preset.name, slide, displayCount: displays, canvasWidth, canvasHeight: DISPLAY_HEIGHT,
    background: preset.palette.background, elements
  };
}

export function buildScenePresetCampaign(presetSource, requestedDisplays = 1) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');
  return preset.campaign.map((_, index) => buildScenePresetLayout(preset, requestedDisplays, index));
}

function isPresetOwnedElement(element) {
  return element?.preset_owned === true
    || String(element?.id || '').startsWith(MANAGED_ID_PREFIX)
    || String(element?.id || '').startsWith(CORE_ID_PREFIX);
}

function inferRole(element) {
  if (element?.preset_role) return element.preset_role;
  const id = String(element?.id || '');
  for (const role of ['background-0','background-1','brand','title','art','promo-box','promo','widget','menu','logo']) {
    if (id.includes(`-${role}`)) return role;
  }
  return '';
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

function restylePresetOwnedElement(element, preset, slideSpec) {
  restyleElement(element, preset);
  const role = inferRole(element);
  element.preset_owned = true;
  element.preset_id = preset.id;
  element.preset_role = role;
  if (role.startsWith('background-')) {
    const index = Number(role.split('-')[1]) || 0;
    element.style.background = preset.backgrounds[index % preset.backgrounds.length];
    return;
  }
  if (role === 'art') {
    element.style.background = `url('${preset.art}') center/contain no-repeat`;
    element.effects.glow = preset.id === 'night-neon';
    return;
  }
  if (role === 'brand') element.style.color = preset.palette.accent;
  if (role === 'promo') element.style.color = preset.palette.accent;
  if (role === 'promo-box') {
    element.style.background = preset.palette.surface;
    element.style.border_color = preset.palette.accent;
  }
  if (role === 'widget') element.variant = preset.widgetVariant;
  if (role === 'title' && element.preset_default_content && element.content === element.preset_default_content) element.content = slideSpec.title;
  if (role === 'promo' && element.preset_default_content && element.content === element.preset_default_content) element.content = `${slideSpec.kicker} · ${slideSpec.promo}`;
  if (role === 'brand' && element.preset_default_content && element.content === element.preset_default_content) element.content = preset.brand;
}

function materializeElement(slide, preset, spec, index) {
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
    animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600, ...(spec.animation || {}) },
    preset_owned: true, preset_id: preset.id, preset_role: spec.role || '', preset_default_content: spec.content || ''
  };
  if (spec.type === 'table') {
    item.data_binding = { source: 'catalog_items' };
    item.table = {
      selection_mode: 'view', view_id: 0, item_ids: [], class_code: '', group_by_class: true,
      show_description: false, show_metadata: true, price_layout: 'single', quantity_unit: 'л', active_only: true,
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
  if (spec.type === 'logo') {
    item.asset_id = spec.asset_id || '';
    item.media = spec.media || { fit: 'contain', position: 'center' };
  }
  return item;
}

function snapshotReusableData(scene) {
  const tables = scene.slides.flatMap((slide) => slide.elements || []).filter((element) => element.type === 'table');
  const logos = scene.slides.flatMap((slide) => slide.elements || []).filter((element) => element.type === 'logo' && element.asset_id);
  return {
    table: tables[0]?.table ? clone(tables[0].table) : null,
    logoAssetId: logos[0]?.asset_id || ''
  };
}

function campaignSlides(scene, preset) {
  const reusable = snapshotReusableData(scene);
  return buildScenePresetCampaign(preset, scene.display_count).map((layout, index) => {
    const slide = {
      id: uid('slide'), name: `${preset.name} · ${layout.slide.label}`,
      duration_ms: layout.slide.kind === 'offer' ? 7000 : 10000,
      transition: index % 2 === 0 ? 'fade' : 'crossfade',
      background: { type: 'color', color: preset.palette.background, asset_id: '' }, elements: []
    };
    slide.elements = layout.elements.map((spec, elementIndex) => materializeElement(slide, preset, spec, elementIndex));
    for (const element of slide.elements) {
      if (element.type === 'table' && reusable.table) element.table = { ...element.table, ...clone(reusable.table), appearance: element.table.appearance };
      if (element.type === 'logo' && reusable.logoAssetId) element.asset_id = reusable.logoAssetId;
    }
    return slide;
  });
}

function sceneIsEmpty(scene) {
  return scene.slides.length === 1 && (scene.slides[0].elements || []).length === 0;
}

export function addScenePresetCampaign(sceneSource, presetSource) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');
  const scene = clone(sceneSource);
  const slides = campaignSlides(scene, preset);
  scene.slides.push(...slides);
  scene.active_slide_id = slides[0].id;
  return { scene, addedSlides: slides.length };
}

export function applySceneDesignPreset(sceneSource, presetSource, { mode = 'auto' } = {}) {
  const preset = typeof presetSource === 'string' ? getScenePreset(presetSource) : presetSource;
  if (!preset) throw new Error('Unknown scene preset');
  if (!sceneSource || !Array.isArray(sceneSource.slides) || !sceneSource.slides.length) throw new Error('Invalid scene');
  const scene = clone(sceneSource);
  const empty = sceneIsEmpty(scene);

  if (mode === 'campaign' || (mode === 'auto' && empty)) {
    const slides = campaignSlides(scene, preset);
    scene.slides = slides;
    scene.active_slide_id = slides[0].id;
    if (!String(scene.name || '').trim() || scene.name === 'Новая сцена') scene.name = preset.name;
    return { scene, seeded: true, addedSlides: slides.length };
  }

  for (let index = 0; index < scene.slides.length; index += 1) {
    const slide = scene.slides[index];
    const slideSpec = preset.campaign[index % preset.campaign.length];
    slide.background = { type: 'color', color: preset.palette.background, asset_id: '' };
    for (const item of slide.elements || []) {
      if (isPresetOwnedElement(item)) restylePresetOwnedElement(item, preset, slideSpec);
      else restyleElement(item, preset);
    }
  }
  return { scene, seeded: false, addedSlides: 0 };
}

export function isSceneDesignManagedElement(element) {
  return isPresetOwnedElement(element);
}
