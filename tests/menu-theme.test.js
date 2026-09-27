import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MENU_THEME_OVERRIDE_KEYS,
  MENU_THEME_PRESET_IDS,
  menuThemeCatalog,
  menuThemeInput,
  validateMenuThemeBindings
} from '../src/contracts/menu-theme.js';

test('theme catalog keeps legacy plus the three approved MIRA-TV presets', () => {
  assert.deepEqual(MENU_THEME_PRESET_IDS, ['legacy','premium','chalk','brand-premium']);
  assert.deepEqual(menuThemeCatalog().map((item) => item.label), [
    'Текущая',
    'Премиальная',
    'Меловая',
    'Брендовая премиальная'
  ]);
  assert.equal(menuThemeCatalog().find((item) => item.id === 'premium').default_utility_mode, 'weather');
  assert.equal(menuThemeCatalog().find((item) => item.id === 'chalk').default_utility_mode, 'weather');
  assert.equal(menuThemeCatalog().find((item) => item.id === 'brand-premium').default_utility_mode, 'weather');
});

test('theme contract stores editable brand content, utility slot and explicit renderer overrides', () => {
  const theme = menuThemeInput({
    preset_id:'brand-premium',
    preset_version:1,
    brand:{
      name:'БИР ФИШ',
      caption:'Надпись над кружкой',
      logo_element_id:'logo-main',
      name_font_family:'arial-narrow',
      caption_font_family:'tahoma-bold'
    },
    utility_slot:{
      mode:'text',
      text:'Сегодня свежее поступление',
      weather_element_id:'weather-main',
      font_family:'system-sans'
    },
    overrides:['font_family','background_image_url','font_family','table_x']
  });
  assert.equal(theme.preset_id, 'brand-premium');
  assert.equal(theme.brand.name, 'БИР ФИШ');
  assert.equal(theme.brand.caption, 'Надпись над кружкой');
  assert.equal(theme.utility_slot.mode, 'text');
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
