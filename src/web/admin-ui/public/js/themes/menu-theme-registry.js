const BASE = Object.freeze({
  background_color:'#101828',
  background_image_url:'',
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
    panel:Object.freeze({ x:1490,y:24,width:402,height:912 }),
    weather:Object.freeze({ x:1512,y:48,width:356,height:236 }),
    logo:Object.freeze({ x:1522,y:300,width:336,height:112 }),
    brand:Object.freeze({ x:1510,y:288,width:360,height:190 }),
    decor:Object.freeze({ x:1492,y:490,width:398,height:446 }),
    footer:Object.freeze({ x:24,y:960,width:1872,height:112 })
  }),
  chalk:Object.freeze({
    panel:Object.freeze({ x:1490,y:24,width:402,height:912 }),
    weather:Object.freeze({ x:1512,y:48,width:356,height:236 }),
    logo:Object.freeze({ x:1522,y:300,width:336,height:112 }),
    brand:Object.freeze({ x:1510,y:286,width:360,height:194 }),
    decor:Object.freeze({ x:1492,y:492,width:398,height:444 }),
    footer:Object.freeze({ x:24,y:960,width:1872,height:112 })
  }),
  'brand-premium':Object.freeze({
    panel:Object.freeze({ x:1490,y:24,width:402,height:912 }),
    weather:Object.freeze({ x:1512,y:48,width:356,height:236 }),
    logo:Object.freeze({ x:1518,y:296,width:344,height:116 }),
    brand:Object.freeze({ x:1508,y:282,width:364,height:204 }),
    decor:Object.freeze({ x:1492,y:500,width:398,height:436 }),
    footer:Object.freeze({ x:24,y:960,width:1872,height:112 })
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
    description:'Строгая тёмно-золотая тема с отдельным фоном, погодной карточкой и брендовой зоной.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#050607',
      background_image_url:'/brand/themes/premium-background.svg',
      accent_color:'#F2B72A',
      text_color:'#F8F8F4',
      font_family:'arial',
      price_font_size_pt:28,
      table_x:54,
      table_y:42,
      table_width_px:1390,
      table_height_px:894
    }),
    visual:Object.freeze({
      kind:'premium',
      panelBackground:'#07090A',
      border:'#DFAE33',
      brandColor:'#F3BB2E',
      brandText:'БИР ФИШ',
      brandCaption:'',
      brandNameFontFamily:'arial',
      brandNameFontSizePx:68,
      brandNameFontWeight:900,
      brandCaptionFontFamily:'arial',
      brandCaptionFontSizePx:20,
      brandCaptionFontWeight:700,
      utilityFontFamily:'arial',
      utilityFontSizePx:30,
      utilityFontWeight:800,
      clockFontSizePx:78,
      decorAsset:'/brand/themes/premium-side.svg',
      footerText:'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ'
    }),
    layout:LAYOUT.premium
  }),
  Object.freeze({
    id:'chalk',
    label:'Меловая',
    description:'Чистая меловая тема без наклонов и случайных рамок: тёмная доска, аккуратная графика и тёплые акценты.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#11110F',
      background_image_url:'/brand/themes/chalk-background.svg',
      accent_color:'#E5B62E',
      text_color:'#F4F1E9',
      font_family:'dejavu-condensed',
      price_font_size_pt:27,
      table_x:56,
      table_y:42,
      table_width_px:1388,
      table_height_px:894
    }),
    visual:Object.freeze({
      kind:'chalk',
      panelBackground:'#10110E',
      border:'#D8AC2C',
      brandColor:'#E5B62E',
      brandText:'БИР ФИШ',
      brandCaption:'Хорошее пиво рядом!',
      brandNameFontFamily:'dejavu-condensed',
      brandNameFontSizePx:62,
      brandNameFontWeight:800,
      brandCaptionFontFamily:'mira-serif',
      brandCaptionFontSizePx:24,
      brandCaptionFontWeight:600,
      utilityFontFamily:'dejavu-condensed',
      utilityFontSizePx:28,
      utilityFontWeight:700,
      clockFontSizePx:74,
      decorAsset:'/brand/themes/chalk-side.svg',
      footerText:'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ'
    }),
    layout:LAYOUT.chalk
  }),
  Object.freeze({
    id:'brand-premium',
    label:'Брендовая премиальная',
    description:'Брендовая тёмно-золотая тема с собственным фоном, крупным названием, слоганом и чистой правой композицией.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#050607',
      background_image_url:'/brand/themes/brand-premium-background.svg',
      accent_color:'#F4B51D',
      text_color:'#F8F8F5',
      font_family:'arial',
      price_font_size_pt:28,
      table_x:54,
      table_y:42,
      table_width_px:1390,
      table_height_px:894
    }),
    visual:Object.freeze({
      kind:'brand-premium',
      panelBackground:'#08090A',
      border:'#DFA91E',
      brandColor:'#F4B61F',
      brandText:'БИР ФИШ',
      brandCaption:'ПИВО · ЗАКУСКИ · ХОРОШАЯ КОМПАНИЯ',
      brandNameFontFamily:'arial',
      brandNameFontSizePx:72,
      brandNameFontWeight:900,
      brandCaptionFontFamily:'arial-narrow',
      brandCaptionFontSizePx:19,
      brandCaptionFontWeight:800,
      utilityFontFamily:'arial',
      utilityFontSizePx:30,
      utilityFontWeight:800,
      clockFontSizePx:80,
      decorAsset:'/brand/themes/brand-premium-side.svg',
      footerText:'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ'
    }),
    layout:LAYOUT['brand-premium']
  })
]);

export const ALCOHOL_WARNING_TEXT = 'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ';
export const ALCOHOL_WARNING_MIN_AREA_RATIO = 0.10;
export const ALCOHOL_WARNING_REFERENCE_AREA_RATIO = Object.freeze({
  width:1920,
  height:1080,
  x:24,
  y:960,
  warning_width:1872,
  warning_height:112,
  ratio:(1872 * 112) / (1920 * 1080)
});

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
