import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MENU_THEME_OVERRIDE_KEYS,
  MENU_THEME_PRESET_IDS,
  MENU_THEME_PRESETS,
  menuThemeCatalog,
  menuThemeInput,
  validateMenuThemeBindings
} from '../src/contracts/menu-theme.js';
import {
  ALCOHOL_WARNING_MIN_AREA_RATIO,
  ALCOHOL_WARNING_REFERENCE_AREA_RATIO,
  ALCOHOL_WARNING_TEXT
} from '../src/web/admin-ui/public/js/themes/menu-theme-registry.js';

test('theme catalog keeps legacy plus the three approved MIRA-TV presets', () => {
  assert.deepEqual(MENU_THEME_PRESET_IDS, ['legacy','premium','chalk','brand-premium']);
  assert.deepEqual(menuThemeCatalog().map((item) => item.label), [
    'Текущая',
    'Премиальная классическая',
    'Меловая',
    'Брендовая премиальная'
  ]);
  assert.equal(menuThemeCatalog().find((item) => item.id === 'premium').default_utility_mode, 'weather');
  assert.equal(menuThemeCatalog().find((item) => item.id === 'chalk').default_utility_mode, 'weather');
  assert.equal(menuThemeCatalog().find((item) => item.id === 'brand-premium').default_utility_mode, 'weather');
});

test('every approved theme owns its table, weather, typography and default background design', () => {
  const premium=MENU_THEME_PRESETS.find((item)=>item.id==='premium');
  const chalk=MENU_THEME_PRESETS.find((item)=>item.id==='chalk');
  const brand=MENU_THEME_PRESETS.find((item)=>item.id==='brand-premium');

  for (const preset of [premium,chalk,brand]) {
    assert.ok(preset.table?.variant);
    assert.ok(preset.weather?.variant);
    assert.match(preset.settings.background_image_url,/^\/brand\/themes\/.+-background\.svg$/);
    assert.ok(preset.table.section_font_family);
    assert.ok(preset.table.item_font_family);
    assert.ok(preset.table.price_font_family);
    assert.ok(preset.weather.temperature_font_family);
    assert.ok(Number(preset.weather.temperature_font_size_pt) > 0);
    assert.ok(Number(preset.weather.icon_scale_percent) >= 100);
  }

  assert.equal(premium.table.show_sequence,true);
  assert.equal(chalk.table.show_sequence,false);
  assert.equal(chalk.table.separator_dashed,true);
  assert.equal(brand.table.price_mode,'primary-accent');
  assert.notEqual(premium.table.variant,chalk.table.variant);
  assert.notEqual(chalk.table.variant,brand.table.variant);
});

test('theme contract stores editable brand typography, utility slot and weather typography', () => {
  const theme = menuThemeInput({
    preset_id:'brand-premium',
    preset_version:1,
    brand:{
      name:'БИР ФИШ',
      caption:'Надпись над кружкой',
      logo_element_id:'logo-main',
      name_font_family:'arial-narrow',
      name_font_size_px:78,
      name_font_weight:800,
      caption_font_family:'tahoma-bold',
      caption_font_size_px:24,
      caption_font_weight:700
    },
    utility_slot:{
      mode:'text',
      text:'Сегодня свежее поступление',
      weather_element_id:'weather-main',
      font_family:'system-sans',
      font_size_px:34,
      font_weight:700,
      temperature_font_family:'mira-serif',
      temperature_font_size_pt:62,
      location_font_size_pt:18,
      icon_scale_percent:150
    },
    overrides:['font_family','background_image_url','font_family','table_x']
  });
  assert.equal(theme.preset_id, 'brand-premium');
  assert.equal(theme.brand.name, 'БИР ФИШ');
  assert.equal(theme.brand.caption, 'Надпись над кружкой');
  assert.equal(theme.brand.name_font_size_px,78);
  assert.equal(theme.brand.name_font_weight,800);
  assert.equal(theme.brand.caption_font_size_px,24);
  assert.equal(theme.utility_slot.mode, 'text');
  assert.equal(theme.utility_slot.font_size_px,34);
  assert.equal(theme.utility_slot.temperature_font_family,'mira-serif');
  assert.equal(theme.utility_slot.temperature_font_size_pt,62);
  assert.equal(theme.utility_slot.location_font_size_pt,18);
  assert.equal(theme.utility_slot.icon_scale_percent,150);
  assert.deepEqual(theme.overrides, MENU_THEME_OVERRIDE_KEYS.filter((key) =>
    ['font_family','background_image_url','table_x'].includes(key)
  ));
});

test('weather and logo slots bind to canonical generic scene elements', () => {
  const theme = menuThemeInput({
    preset_id:'premium',
    brand:{ logo_element_id:'logo-main' },
    utility_slot:{ mode:'weather', weather_element_id:'weather-main' }
  });
  const scene = {
    version:1,
    elements:[
      { id:'logo-main', type:'logo' },
      { id:'weather-main', type:'weather' }
    ]
  };
  assert.equal(validateMenuThemeBindings(theme, scene).preset_id, 'premium');
  assert.throws(
    () => validateMenuThemeBindings(theme, { version:1, elements:[{ id:'logo-main', type:'image' }, { id:'weather-main', type:'weather' }] }),
    /типа «Логотип»/
  );
  assert.throws(
    () => validateMenuThemeBindings(menuThemeInput({ preset_id:'premium', utility_slot:{ mode:'weather' } }), scene),
    /режима «Погода»/
  );
});

test('alcohol warning keeps the mandated wording and at least ten percent of the reference frame', () => {
  assert.equal(ALCOHOL_WARNING_TEXT,'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ');
  assert.equal(ALCOHOL_WARNING_MIN_AREA_RATIO,0.10);
  assert.ok(ALCOHOL_WARNING_REFERENCE_AREA_RATIO.ratio >= ALCOHOL_WARNING_MIN_AREA_RATIO);
  assert.equal(
    ALCOHOL_WARNING_REFERENCE_AREA_RATIO.warning_width * ALCOHOL_WARNING_REFERENCE_AREA_RATIO.warning_height,
    1920 * 112
  );
});

test('legacy scenes receive a no-op theme identity and invalid theme data is rejected', () => {
  const legacy = menuThemeInput();
  assert.equal(legacy.preset_id, 'legacy');
  assert.equal(legacy.utility_slot.mode, 'none');
  assert.deepEqual(legacy.overrides, []);
  assert.throws(() => menuThemeInput({ preset_id:'unknown-theme' }), /неподдерживаемая тема/);
  assert.throws(() => menuThemeInput({ preset_id:'premium', preset_version:2 }), /Версия темы/);
  assert.throws(() => menuThemeInput({ overrides:['unknown_setting'] }), /нельзя переопределять/);
  assert.throws(() => menuThemeInput({ utility_slot:{ mode:'video' } }), /не поддерживается/);
});
