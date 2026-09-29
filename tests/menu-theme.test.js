import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MENU_THEME_OVERRIDE_KEYS,
  MENU_THEME_PRESET_IDS,
  MENU_THEME_PRESETS,
  menuThemeCatalog,
  menuThemeInput,
  themeWeatherSettings,
  validateMenuThemeBindings
} from '../src/contracts/menu-theme.js';
import {
  ALCOHOL_WARNING_MIN_AREA_RATIO,
  ALCOHOL_WARNING_REFERENCE_AREA_RATIO,
  ALCOHOL_WARNING_TEXT
} from '../src/web/admin-ui/public/js/themes/menu-theme-registry.js';

test('theme catalog exposes three approved presets plus Theme Constructor', () => {
  assert.deepEqual(MENU_THEME_PRESET_IDS, ['legacy','premium','chalk','brand-premium']);
  const catalog=menuThemeCatalog();
  assert.deepEqual(catalog.map((item) => item.label), [
    'Конструктор темы',
    'Премиальная',
    'Меловая',
    'Брендовая премиальная'
  ]);
  assert.equal(catalog.find((item)=>item.id==='legacy').kind,'constructor');
  for(const id of ['premium','chalk','brand-premium']){
    const item=catalog.find((entry)=>entry.id===id);
    assert.equal(item.kind,'preset');
    assert.equal(item.default_utility_mode,'weather');
    assert.equal(item.preset_version,id==='chalk' ? 2 : 1);
  }
});

test('approved presets own genuinely distinct table, weather, typography and legal systems', () => {
  const premium=MENU_THEME_PRESETS.find((item)=>item.id==='premium');
  const chalk=MENU_THEME_PRESETS.find((item)=>item.id==='chalk');
  const brand=MENU_THEME_PRESETS.find((item)=>item.id==='brand-premium');

  for(const preset of [premium,chalk,brand]) {
    assert.ok(preset.table?.variant);
    assert.ok(preset.weather?.variant);
    assert.match(preset.settings.background_image_url,/^\/brand\/themes\/.+-background\.svg$/);
    assert.ok(preset.visual?.legalVariant);
    assert.ok(preset.visual?.brandDivider);
    assert.match(preset.visual?.decorAsset,/^\/brand\/themes\/.+-side\.svg$/);
  }

  assert.deepEqual(
    [premium.table.section_font_family,premium.table.item_font_family,premium.table.price_font_family],
    ['montserrat','roboto-condensed','oswald']
  );
  assert.deepEqual(
    [chalk.table.section_font_family,chalk.table.item_font_family,chalk.table.meta_font_family,chalk.table.price_font_family,chalk.visual.brandNameFontFamily,chalk.visual.brandCaptionFontFamily],
    ['montserrat','montserrat','roboto-condensed','oswald','montserrat','neucha']
  );
  assert.deepEqual(
    [brand.table.section_font_family,brand.table.item_font_family,brand.table.price_font_family],
    ['russo-one','pt-sans-narrow','montserrat']
  );

  assert.equal(premium.table.show_sequence,true);
  assert.equal(premium.table.price_mode,'white-primary');
  assert.equal(chalk.table.show_sequence,false);
  assert.equal(chalk.table.separator_dashed,true);
  assert.equal(chalk.table.price_mode,'promotion-accent');
  assert.equal(brand.table.price_mode,'primary-accent');
  for (const preset of [premium,chalk,brand]) {
    assert.equal(preset.table.item_tone_mode,'fixed');
    assert.equal(preset.table.promotion_style,'price-only');
  }

  assert.deepEqual(
    [premium.visual.utilityFontFamily,premium.weather.temperature_font_family,premium.weather.condition_font_family,premium.weather.forecast_font_family,premium.weather.icon_style],
    ['montserrat','oswald','roboto-condensed','roboto-condensed','premium-line']
  );
  assert.deepEqual(
    [chalk.visual.utilityFontFamily,chalk.weather.temperature_font_family,chalk.weather.condition_font_family,chalk.weather.forecast_font_family,chalk.weather.icon_style],
    ['montserrat','montserrat','neucha','roboto-condensed','chalk-drawn']
  );
  assert.deepEqual(
    [brand.visual.utilityFontFamily,brand.weather.temperature_font_family,brand.weather.condition_font_family,brand.weather.forecast_font_family,brand.weather.icon_style],
    ['russo-one','montserrat','russo-one','pt-sans-narrow','brand-gold']
  );
  assert.notEqual(premium.weather.current_layout,chalk.weather.current_layout);
  assert.notEqual(chalk.weather.current_layout,brand.weather.current_layout);
  assert.notEqual(premium.visual.legalVariant,chalk.visual.legalVariant);
  assert.notEqual(chalk.visual.legalVariant,brand.visual.legalVariant);
  assert.equal(premium.visual.brandDivider,'hop');
  assert.equal(chalk.visual.brandDivider,'none');
  assert.equal(brand.visual.brandDivider,'wave');
  assert.equal(new Set([premium.visual.decorAsset,chalk.visual.decorAsset,brand.visual.decorAsset]).size,3);
  assert.equal(premium.visual.decorFit,'contain');
  assert.equal(chalk.visual.decorFit,'contain');
  assert.equal(brand.visual.decorFit,'cover');
});

test('approved preset decor assets are self-contained SVG files', () => {
  for (const preset of MENU_THEME_PRESETS.filter((item) => item.id !== 'legacy')) {
    const relative=String(preset.visual.decorAsset || '').replace(/^\//,'');
    const source=readFileSync(new URL(`../src/web/admin-ui/public/${relative}`,import.meta.url),'utf8');
    assert.match(source,/^<svg\b|<svg\b/,`${preset.id}: decor is not SVG`);
    assert.doesNotMatch(source,/(?:href|xlink:href)\s*=\s*["']https?:\/\//i,`${preset.id}: decor must not load remote assets`);
    assert.doesNotMatch(source,/url\(\s*["']?https?:\/\//i,`${preset.id}: decor must not load remote CSS assets`);
  }
});

test('theme geometry keeps table, side composition and legal footer in separate regions', () => {
  const approvedHorizontalGeometry={
    premium:{tableRight:1477,panelX:1495,panelRight:1892},
    chalk:{tableRight:1455,panelX:1469,panelRight:1873},
    'brand-premium':{tableRight:1463,panelX:1475,panelRight:1896}
  };
  const approvedVerticalGeometry={
    premium:{weatherBottom:296,brandY:315,decorY:525,decorBottom:936},
    chalk:{weatherBottom:222,brandY:258,decorY:512,decorBottom:936},
    'brand-premium':{weatherBottom:280,brandY:300,decorY:570,decorBottom:936}
  };
  for (const preset of MENU_THEME_PRESETS.filter((item)=>item.id !== 'legacy')) {
    const tableRight=Number(preset.settings.table_x)+Number(preset.settings.table_width_px);
    const tableBottom=Number(preset.settings.table_y)+Number(preset.settings.table_height_px);
    const panelRight=Number(preset.layout.panel.x)+Number(preset.layout.panel.width);
    const decorRight=Number(preset.layout.decor.x)+Number(preset.layout.decor.width);
    const decorBottom=Number(preset.layout.decor.y)+Number(preset.layout.decor.height);
    assert.deepEqual(
      {tableRight,panelX:preset.layout.panel.x,panelRight},
      approvedHorizontalGeometry[preset.id],
      `${preset.id}: horizontal composition drifted from the approved prototype`
    );
    assert.deepEqual(
      {
        weatherBottom:preset.layout.weather.y+preset.layout.weather.height,
        brandY:preset.layout.brand.y,
        decorY:preset.layout.decor.y,
        decorBottom
      },
      approvedVerticalGeometry[preset.id],
      `${preset.id}: vertical side composition drifted from the approved prototype`
    );
    assert.ok(tableRight <= preset.layout.panel.x, `${preset.id}: table overlaps side panel`);
    assert.ok(preset.layout.decor.x >= preset.layout.panel.x, `${preset.id}: decor starts outside side panel`);
    assert.ok(decorRight <= panelRight, `${preset.id}: decor leaves side panel`);
    assert.ok(tableBottom <= preset.layout.footer.y, `${preset.id}: table overlaps legal footer`);
    assert.ok(decorBottom <= preset.layout.footer.y, `${preset.id}: decor overlaps legal footer`);
    assert.ok(panelRight <= 1920, `${preset.id}: side panel leaves viewport`);
  }
});

test('chalk preset v1 defaults migrate to v2 without overwriting explicit custom typography', () => {
  const migrated=menuThemeInput({
    preset_id:'chalk',
    preset_version:1,
    brand:{
      name:'БИР ФИШ',
      caption:'Хорошее пиво рядом!',
      name_font_family:'underdog',
      name_font_size_px:70,
      caption_font_family:'neucha',
      caption_font_size_px:28
    },
    utility_slot:{
      mode:'weather',
      font_family:'yanone-kaffeesatz',
      font_weight:700,
      temperature_font_family:'yanone-kaffeesatz',
      location_font_size_pt:14
    }
  });
  assert.equal(migrated.preset_version,2);
  assert.equal(migrated.brand.name_font_family,'montserrat');
  assert.equal(migrated.brand.name_font_size_px,108);
  assert.equal(migrated.brand.caption_font_size_px,34);
  assert.equal(migrated.utility_slot.font_family,'montserrat');
  assert.equal(migrated.utility_slot.font_weight,900);
  assert.equal(migrated.utility_slot.temperature_font_family,'montserrat');
  assert.equal(migrated.utility_slot.location_font_size_pt,16);

  const custom=menuThemeInput({
    preset_id:'chalk',
    preset_version:1,
    brand:{name_font_family:'russo-one',name_font_size_px:92},
    utility_slot:{mode:'none',font_family:'pt-sans-narrow',temperature_font_family:'oswald',location_font_size_pt:20}
  });
  assert.equal(custom.preset_version,2);
  assert.equal(custom.brand.name_font_family,'russo-one');
  assert.equal(custom.brand.name_font_size_px,92);
  assert.equal(custom.utility_slot.font_family,'pt-sans-narrow');
  assert.equal(custom.utility_slot.temperature_font_family,'oswald');
  assert.equal(custom.utility_slot.location_font_size_pt,20);
});

test('preset theme contract stores embedded weather, replaceable decor and editable legal typography', () => {
  const theme=menuThemeInput({
    preset_id:'brand-premium',
    brand:{
      name:'БИР ФИШ',
      caption:'ПИВО · ЗАКУСКИ · ХОРОШАЯ КОМПАНИЯ',
      logo_url:'/site-assets/scene/logo.webp',
      name_font_family:'russo-one',
      name_font_size_px:82,
      name_font_weight:900,
      caption_font_family:'pt-sans-narrow',
      caption_font_size_px:19,
      caption_font_weight:700
    },
    utility_slot:{
      mode:'weather',
      temperature_font_family:'montserrat',
      temperature_font_size_pt:64,
      location_font_size_pt:18,
      icon_scale_percent:145,
      weather:{
        location_name:'Комсомольск-на-Амуре',
        latitude:50.55,
        longitude:137.01,
        timezone:'Asia/Vladivostok',
        refresh_minutes:20,
        show_condition:true,
        show_forecast:true,
        forecast_items:4
      }
    },
    decor:{ source_url:'/site-assets/scene/custom-mug.webp' },
    legal:{
      text:'ПРЕДУПРЕЖДЕНИЕ',
      age_text:'18+',
      font_family:'pt-sans-narrow',
      font_size_px:31,
      font_weight:700,
      letter_spacing_px:4
    },
    overrides:['font_family','background_image_url','font_family','table_x']
  });

  assert.equal(theme.brand.logo_url,'/site-assets/scene/logo.webp');
  assert.equal(theme.utility_slot.weather.location_name,'Комсомольск-на-Амуре');
  assert.equal(theme.utility_slot.weather.latitude,50.55);
  assert.equal(theme.utility_slot.weather.longitude,137.01);
  assert.equal(theme.utility_slot.weather.forecast_items,4);
  assert.equal(theme.decor.source_url,'/site-assets/scene/custom-mug.webp');
  assert.equal(theme.legal.text,'ПРЕДУПРЕЖДЕНИЕ');
  assert.equal(theme.legal.font_size_px,31);
  assert.deepEqual(theme.overrides, MENU_THEME_OVERRIDE_KEYS.filter((key) =>
    ['font_family','background_image_url','table_x'].includes(key)
  ));
});

test('preset weather is self contained and does not require a generic scene weather element', () => {
  const theme=menuThemeInput({
    preset_id:'premium',
    utility_slot:{
      mode:'weather',
      weather:{
        location_name:'Владивосток',
        latitude:43.1155,
        longitude:131.8855,
        timezone:'Asia/Vladivostok'
      }
    }
  });

  const validated=validateMenuThemeBindings(theme,{version:1,elements:[]});
  assert.equal(validated.preset_id,'premium');

  const weather=themeWeatherSettings(theme,{version:1,elements:[]});
  assert.equal(weather.enabled,true);
  assert.equal(weather.location_name,'Владивосток');
  assert.equal(weather.latitude,43.1155);
  assert.equal(weather.longitude,131.8855);
  assert.equal(weather.show_humidity,false);
  assert.equal(weather.show_wind,false);
});

test('legacy v1.17.1 weather binding is accepted only as migration input, not a required preset binding', () => {
  const theme=menuThemeInput({
    preset_id:'premium',
    utility_slot:{ mode:'weather',weather_element_id:'weather-old' }
  });
  const scene={
    version:1,
    elements:[{
      id:'weather-old',
      type:'weather',
      weather:{
        location_name:'Хабаровск',
        latitude:48.48,
        longitude:135.07,
        timezone:'Asia/Vladivostok'
      }
    }]
  };
  const weather=themeWeatherSettings(theme,scene);
  assert.equal(weather.location_name,'Хабаровск');
  assert.equal(weather.latitude,48.48);
  assert.equal(validateMenuThemeBindings(theme,scene).preset_id,'premium');
  assert.throws(
    ()=>validateMenuThemeBindings(
      menuThemeInput({preset_id:'premium',utility_slot:{mode:'weather',weather_element_id:'weather-old'}}),
      {version:1,elements:[{id:'weather-old',type:'image'}]}
    ),
    /элемент типа «Погода»/
  );
});

test('alcohol warning keeps the warning area at least ten percent of the reference frame', () => {
  assert.equal(ALCOHOL_WARNING_TEXT,'ЧРЕЗМЕРНОЕ УПОТРЕБЛЕНИЕ АЛКОГОЛЯ ВРЕДИТ ВАШЕМУ ЗДОРОВЬЮ');
  assert.equal(ALCOHOL_WARNING_MIN_AREA_RATIO,0.10);
  assert.ok(ALCOHOL_WARNING_REFERENCE_AREA_RATIO.ratio >= ALCOHOL_WARNING_MIN_AREA_RATIO);
  assert.equal(
    ALCOHOL_WARNING_REFERENCE_AREA_RATIO.warning_width * ALCOHOL_WARNING_REFERENCE_AREA_RATIO.warning_height,
    1920 * 112
  );
});

test('legacy scenes remain Theme Constructor without changing their scene contract', () => {
  const legacy=menuThemeInput();
  assert.equal(legacy.preset_id,'legacy');
  assert.equal(legacy.utility_slot.mode,'none');
  assert.deepEqual(legacy.overrides,[]);
  assert.throws(()=>menuThemeInput({preset_id:'unknown-theme'}),/неподдерживаемая тема/);
  assert.throws(()=>menuThemeInput({preset_id:'premium',preset_version:2}),/Версия темы/);
  assert.throws(()=>menuThemeInput({overrides:['unknown_setting']}),/нельзя переопределять/);
  assert.throws(()=>menuThemeInput({utility_slot:{mode:'video'}}),/не поддерживается/);
});
