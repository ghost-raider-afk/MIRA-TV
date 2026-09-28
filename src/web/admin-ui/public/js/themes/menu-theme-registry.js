export const ALCOHOL_WARNING_TEXT = 'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ';
export const ALCOHOL_WARNING_MIN_AREA_RATIO = 0.10;
export const ALCOHOL_WARNING_REFERENCE_AREA_RATIO = Object.freeze({
  width:1920,
  height:1080,
  x:0,
  y:968,
  warning_width:1920,
  warning_height:112,
  ratio:(1920 * 112) / (1920 * 1080)
});

const BASE = Object.freeze({
  background_color:'#101828',
  background_image_url:'',
  accent_color:'#F4C915',
  text_color:'#F8FAFC',
  font_scale_percent:100,
  font_family:'system-sans',
  price_font_size_pt:27,
  promotion_badge_shape:'base',
  promotion_font_family:'mira-condensed',
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
    panel:Object.freeze({ x:1484,y:24,width:408,height:912 }),
    weather:Object.freeze({ x:1502,y:42,width:372,height:238 }),
    logo:Object.freeze({ x:1516,y:302,width:344,height:92 }),
    brand:Object.freeze({ x:1500,y:286,width:376,height:192 }),
    decor:Object.freeze({ x:1488,y:496,width:400,height:440 }),
    footer:Object.freeze({ x:0,y:968,width:1920,height:112 })
  }),
  chalk:Object.freeze({
    panel:Object.freeze({ x:1484,y:24,width:408,height:912 }),
    weather:Object.freeze({ x:1500,y:42,width:376,height:204 }),
    logo:Object.freeze({ x:1514,y:264,width:348,height:86 }),
    brand:Object.freeze({ x:1498,y:252,width:380,height:250 }),
    decor:Object.freeze({ x:1490,y:500,width:396,height:436 }),
    footer:Object.freeze({ x:0,y:968,width:1920,height:112 })
  }),
  'brand-premium':Object.freeze({
    panel:Object.freeze({ x:1484,y:24,width:408,height:912 }),
    weather:Object.freeze({ x:1500,y:42,width:376,height:238 }),
    logo:Object.freeze({ x:1514,y:300,width:348,height:92 }),
    brand:Object.freeze({ x:1498,y:286,width:380,height:204 }),
    decor:Object.freeze({ x:1488,y:498,width:400,height:438 }),
    footer:Object.freeze({ x:0,y:968,width:1920,height:112 })
  })
});

const PRESETS = Object.freeze([
  Object.freeze({
    id:'legacy',
    kind:'constructor',
    label:'Конструктор темы',
    description:'Свободная тема: фон, текст, логотип, изображение, погода и другие элементы добавляются пользователем.',
    preset_version:1,
    default_utility_mode:'none',
    settings:BASE,
    visual:Object.freeze({ kind:'constructor' }),
    table:null,
    weather:null,
    layout:null
  }),
  Object.freeze({
    id:'premium',
    kind:'preset',
    label:'Премиальная',
    description:'Готовый строгий пресет по утверждённому макету: нумерация, ровная золотая сетка, встроенная погода, hop-разделитель и реалистичная кружка.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#050607',
      background_image_url:'/brand/themes/premium-background.svg',
      accent_color:'#F2B72A',
      text_color:'#F8F8F4',
      font_family:'roboto-condensed',
      price_font_size_pt:28,
      table_x:48,
      table_y:34,
      table_width_px:1404,
      table_height_px:902
    }),
    visual:Object.freeze({
      kind:'premium',
      panelBackground:'#050607',
      border:'#DFAE33',
      brandColor:'#F3BB2E',
      brandText:'БИР ФИШ',
      brandCaption:'',
      brandDivider:'hop',
      brandNameFontFamily:'montserrat',
      brandNameFontSizePx:76,
      brandNameFontWeight:900,
      brandCaptionFontFamily:'roboto-condensed',
      brandCaptionFontSizePx:18,
      brandCaptionFontWeight:700,
      utilityFontFamily:'montserrat',
      utilityFontSizePx:28,
      utilityFontWeight:800,
      clockFontSizePx:78,
      decorAsset:'/brand/themes/premium-approved-decor.webp',
      decorFit:'cover',
      legalVariant:'premium',
      legalFontFamily:'oswald',
      legalFontSizePx:30,
      legalFontWeight:400,
      legalLetterSpacingPx:8,
      footerText:ALCOHOL_WARNING_TEXT,
      ageText:'18+'
    }),
    table:Object.freeze({
      variant:'premium',
      section_font_family:'montserrat',
      item_font_family:'roboto-condensed',
      meta_font_family:'roboto-condensed',
      price_font_family:'oswald',
      separator:'#3F4346',
      separator_dashed:false,
      price_mode:'white-primary',
      show_sequence:true,
      price_column_borders:true
    }),
    weather:Object.freeze({
      variant:'premium',
      temperature_font_family:'oswald',
      temperature_font_size_pt:58,
      location_font_size_pt:14,
      icon_scale_percent:122,
      show_condition:true,
      show_forecast:true,
      forecast_items:3,
      current_layout:'split',
      forecast_layout:'three-column',
      divider_style:'solid',
      show_now_label:true
    }),
    layout:LAYOUT.premium
  }),
  Object.freeze({
    id:'chalk',
    kind:'preset',
    label:'Меловая',
    description:'Готовый меловой пресет по утверждённому макету: chalkboard, меловые линии, отдельная типографика, рисованная кружка и свой погодный блок.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#11110F',
      background_image_url:'/brand/themes/chalk-background.svg',
      accent_color:'#E5B62E',
      text_color:'#F4F1E9',
      font_family:'yanone-kaffeesatz',
      price_font_size_pt:27,
      table_x:56,
      table_y:34,
      table_width_px:1390,
      table_height_px:902
    }),
    visual:Object.freeze({
      kind:'chalk',
      panelBackground:'#10110E',
      border:'#D8AC2C',
      brandColor:'#E5B62E',
      brandText:'БИР ФИШ',
      brandCaption:'Хорошее пиво рядом!',
      brandDivider:'chalk-line',
      brandNameFontFamily:'underdog',
      brandNameFontSizePx:70,
      brandNameFontWeight:900,
      brandCaptionFontFamily:'neucha',
      brandCaptionFontSizePx:28,
      brandCaptionFontWeight:400,
      utilityFontFamily:'yanone-kaffeesatz',
      utilityFontSizePx:27,
      utilityFontWeight:700,
      clockFontSizePx:72,
      decorAsset:'/brand/themes/chalk-approved-decor.webp',
      decorFit:'contain',
      legalVariant:'chalk',
      legalFontFamily:'neucha',
      legalFontSizePx:32,
      legalFontWeight:700,
      legalLetterSpacingPx:3,
      footerText:ALCOHOL_WARNING_TEXT,
      ageText:'18+'
    }),
    table:Object.freeze({
      variant:'chalk',
      section_font_family:'underdog',
      item_font_family:'yanone-kaffeesatz',
      meta_font_family:'yanone-kaffeesatz',
      price_font_family:'yanone-kaffeesatz',
      separator:'#66645D',
      separator_dashed:true,
      price_mode:'chalk-accent',
      show_sequence:false,
      price_column_borders:false
    }),
    weather:Object.freeze({
      variant:'chalk',
      temperature_font_family:'yanone-kaffeesatz',
      temperature_font_size_pt:54,
      location_font_size_pt:14,
      icon_scale_percent:118,
      show_condition:true,
      show_forecast:true,
      forecast_items:3,
      current_layout:'compact-row',
      forecast_layout:'inline',
      divider_style:'chalk',
      show_now_label:false
    }),
    layout:LAYOUT.chalk
  }),
  Object.freeze({
    id:'brand-premium',
    kind:'preset',
    label:'Брендовая премиальная',
    description:'Готовый брендовый пресет по утверждённому макету: крупный золотой бренд, волнообразный знак, отдельная типографика и собственная композиция погоды.',
    preset_version:1,
    default_utility_mode:'weather',
    settings:Object.freeze({
      ...BASE,
      background_color:'#050607',
      background_image_url:'/brand/themes/brand-premium-background.svg',
      accent_color:'#F4B51D',
      text_color:'#F8F8F5',
      font_family:'pt-sans-narrow',
      price_font_size_pt:28,
      table_x:48,
      table_y:28,
      table_width_px:1404,
      table_height_px:908
    }),
    visual:Object.freeze({
      kind:'brand-premium',
      panelBackground:'#08090A',
      border:'#DFA91E',
      brandColor:'#F4B61F',
      brandText:'БИР ФИШ',
      brandCaption:'ПИВО · ЗАКУСКИ · ХОРОШАЯ КОМПАНИЯ',
      brandDivider:'wave',
      brandNameFontFamily:'russo-one',
      brandNameFontSizePx:80,
      brandNameFontWeight:900,
      brandCaptionFontFamily:'pt-sans-narrow',
      brandCaptionFontSizePx:17,
      brandCaptionFontWeight:700,
      utilityFontFamily:'pt-sans-narrow',
      utilityFontSizePx:30,
      utilityFontWeight:800,
      clockFontSizePx:82,
      decorAsset:'/brand/themes/brand-premium-approved-decor.webp',
      decorFit:'cover',
      legalVariant:'brand-premium',
      legalFontFamily:'pt-sans-narrow',
      legalFontSizePx:28,
      legalFontWeight:400,
      legalLetterSpacingPx:6,
      footerText:ALCOHOL_WARNING_TEXT,
      ageText:'18+'
    }),
    table:Object.freeze({
      variant:'brand-premium',
      section_font_family:'russo-one',
      item_font_family:'pt-sans-narrow',
      meta_font_family:'pt-sans-narrow',
      price_font_family:'montserrat',
      separator:'#404448',
      separator_dashed:false,
      price_mode:'primary-accent',
      show_sequence:false,
      price_column_borders:true
    }),
    weather:Object.freeze({
      variant:'brand-premium',
      temperature_font_family:'montserrat',
      temperature_font_size_pt:60,
      location_font_size_pt:15,
      icon_scale_percent:126,
      show_condition:true,
      show_forecast:true,
      forecast_items:3,
      current_layout:'hero',
      forecast_layout:'three-column',
      divider_style:'gold',
      show_now_label:false
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
  const key = String(id || 'legacy');
  return BY_ID.get(key === 'constructor' ? 'legacy' : key) || BY_ID.get('legacy');
}

export function menuThemeCatalog() {
  return PRESETS.map(({ settings,visual,table,weather,layout,...meta }) => ({ ...meta }));
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
  const tableStyle = preset.table ? { ...preset.table } : null;
  if (tableStyle && overrides.has('font_family')) {
    tableStyle.section_font_family = resolved.font_family;
    tableStyle.item_font_family = resolved.font_family;
    tableStyle.meta_font_family = resolved.font_family;
    tableStyle.price_font_family = resolved.font_family;
  }
  resolved.theme_table_style = tableStyle;
  return Object.freeze(resolved);
}
