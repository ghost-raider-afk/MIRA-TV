const BASE = Object.freeze({
  background_color:'#101828',
  accent_color:'#F4C915',
  text_color:'#F8FAFC',
  font_scale_percent:100,
  font_family:'arial-narrow',
  price_font_size_pt:27,
  promotion_badge_shape:'base',
  promotion_font_family:'arial-narrow',
  promotion_font_size_percent:100,
  promotion_font_weight:900,
  promotion_font_height_percent:112,
  promotion_letter_spacing_px:0,
  table_x:56,
  table_y:15,
  table_width_px:1374,
  table_height_px:925
});

const LAYOUT = Object.freeze({
  premium:Object.freeze({
    frame:Object.freeze({ x:28,y:24,width:1864,height:984,radius:28 }),
    panel:Object.freeze({ x:1490,y:24,width:402,height:984 }),
    weather:Object.freeze({ x:1510,y:48,width:360,height:244 }),
    logo:Object.freeze({ x:1530,y:314,width:320,height:118 }),
    brand:Object.freeze({ x:1510,y:304,width:360,height:175 }),
    decor:Object.freeze({ x:1491,y:490,width:400,height:495 }),
    footer:Object.freeze({ x:62,y:1014,width:1815,height:54 })
  }),
  chalk:Object.freeze({
    frame:Object.freeze({ x:48,y:28,width:1822,height:955,radius:24 }),
    panel:Object.freeze({ x:1470,y:28,width:400,height:955 }),
    weather:Object.freeze({ x:1492,y:48,width:356,height:205 }),
    logo:Object.freeze({ x:1510,y:270,width:322,height:115 }),
    brand:Object.freeze({ x:1494,y:265,width:360,height:168 }),
    decor:Object.freeze({ x:1472,y:430,width:396,height:515 }),
    footer:Object.freeze({ x:72,y:1000,width:1774,height:62 })
  }),
  'brand-premium':Object.freeze({
    frame:Object.freeze({ x:32,y:20,width:1855,height:996,radius:22 }),
    panel:Object.freeze({ x:1470,y:20,width:417,height:996 }),
    weather:Object.freeze({ x:1490,y:42,width:375,height:225 }),
    logo:Object.freeze({ x:1505,y:292,width:345,height:118 }),
    brand:Object.freeze({ x:1495,y:286,width:370,height:195 }),
    decor:Object.freeze({ x:1472,y:555,width:413,height:438 }),
    footer:Object.freeze({ x:52,y:1014,width:1815,height:54 })
  })
});

const PRESETS = Object.freeze([
  Object.freeze({
    id:'legacy',
    label:'Текущая',
    description:'Текущее оформление MIRA-TV без тематического пресета.',
    preset_version:1,
    default_utility_mode:'none',
    settings:BASE,
    visual:Object.freeze({ kind:'legacy' }),
    layout:null
  }),
  Object.freeze({
    id:'premium',
    label:'Премиальная классическая',
    description:'Строгая чёрно-золотая тема с погодой, брендингом и фото-зоной справа.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#070A0C',
      accent_color:'#F2B72A',
      text_color:'#F8F8F4',
      font_family:'arial',
      price_font_size_pt:28,
      table_x:44,
      table_y:36,
      table_width_px:1420,
      table_height_px:955
    }),
    visual:Object.freeze({
      kind:'premium',
      panelBackground:'#070A0C',
      border:'#E3AD2B',
      brandColor:'#F3BB2E',
      brandText:'БИР ФИШ',
      brandCaption:'',
      footerText:'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ'
    }),
    layout:LAYOUT.premium
  }),
  Object.freeze({
    id:'chalk',
    label:'Меловая',
    description:'Чёрная доска, золотые заголовки и крафтовая правая зона с меловой графикой.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#11110F',
      accent_color:'#F1B91F',
      text_color:'#F4F1E9',
      font_family:'dejavu-condensed',
      price_font_size_pt:27,
      table_x:60,
      table_y:34,
      table_width_px:1388,
      table_height_px:942
    }),
    visual:Object.freeze({
      kind:'chalk',
      panelBackground:'#121210',
      border:'#E0AB16',
      brandColor:'#F3B91F',
      brandText:'БИР ФИШ',
      brandCaption:'Хорошее пиво рядом!',
      footerText:'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ'
    }),
    layout:LAYOUT.chalk
  }),
  Object.freeze({
    id:'brand-premium',
    label:'Брендовая премиальная',
    description:'Чёрно-золотая тема с крупным брендовым блоком, слоганом и фото-зоной.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#080B0D',
      accent_color:'#F4B51D',
      text_color:'#F8F8F5',
      font_family:'arial',
      price_font_size_pt:28,
      table_x:46,
      table_y:30,
      table_width_px:1412,
      table_height_px:962
    }),
    visual:Object.freeze({
      kind:'brand-premium',
      panelBackground:'#090B0C',
      border:'#DFA91E',
      brandColor:'#F4B61F',
      brandText:'БИР ФИШ',
      brandCaption:'ПИВО · ЗАКУСКИ · ХОРОШАЯ КОМПАНИЯ',
      footerText:'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ'
    }),
    layout:LAYOUT['brand-premium']
  })
]);

export const MENU_THEME_OVERRIDE_KEYS = Object.freeze([
  'background_color','background_image_url','accent_color','text_color','font_scale_percent','font_family',
  'price_font_size_pt','promotion_badge_shape','promotion_font_family','promotion_font_size_percent',
  'promotion_font_weight','promotion_font_height_percent','promotion_letter_spacing_px',
  'table_x','table_y','table_width_px','table_height_px'
]);

const BY_ID = new Map(PRESETS.map((item)=>[item.id,item]));
export const MENU_THEME_PRESETS = PRESETS;
export const MENU_THEME_PRESET_IDS = Object.freeze(PRESETS.map((item)=>item.id));

export function menuThemePreset(id) {
  return BY_ID.get(String(id || 'legacy')) || BY_ID.get('legacy');
}

export function menuThemeCatalog() {
  return PRESETS.map(({ settings,visual,layout,...meta }) => ({ ...meta }));
}

export function resolveMenuThemeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const theme = source.theme && typeof source.theme === 'object' ? source.theme : {};
  const preset = menuThemePreset(theme.preset_id);
  if (preset.id === 'legacy') return Object.freeze({ ...source });
  const overrides = new Set(Array.isArray(theme.overrides) ? theme.overrides : []);
  const resolved = { ...source };
  for (const [key,value] of Object.entries(preset.settings)) {
    if (!overrides.has(key)) resolved[key] = value;
  }
  return Object.freeze(resolved);
}
