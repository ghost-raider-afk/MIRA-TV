import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMenuThemeRuntime } from '../src/web/admin-ui/public/js/player/menu-theme-runtime.js';
import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel
} from '../src/web/admin-ui/public/js/editor/renderer.js';
import { buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer-svg.js';

function theme(presetId='premium',overrides=[]) {
  return {
    schema_version:1,
    preset_id:presetId,
    preset_version:1,
    brand:{name:'БИР ФИШ',caption:'',logo_element_id:'',logo_url:'',name_font_family:'',caption_font_family:''},
    utility_slot:{
      mode:'weather',
      text:'',
      weather_element_id:'',
      font_family:'',
      weather:{
        location_name:'Владивосток',
        latitude:43.1155,
        longitude:131.8855,
        timezone:'Asia/Vladivostok',
        forecast_items:3
      }
    },
    overrides
  };
}

test('theme resolver applies preset defaults while explicit menu overrides remain authoritative', () => {
  const preset=resolveMenuThemeRuntime({
    background_color:'#123456',
    font_family:'tahoma-bold',
    theme:theme()
  },{version:1,elements:[]});

  assert.equal(preset.settings.background_color,'#050607');
  assert.equal(preset.settings.background_image_url,'/brand/themes/premium-background.svg');
  assert.equal(preset.settings.font_family,'roboto-condensed');
  assert.equal(preset.settings.theme_table_style.variant,'premium');

  const overridden=resolveMenuThemeRuntime({
    background_color:'#123456',
    font_family:'tahoma-bold',
    theme:theme('premium',['background_color','font_family'])
  },{version:1,elements:[]});

  assert.equal(overridden.settings.background_color,'#123456');
  assert.equal(overridden.settings.font_family,'tahoma-bold');
  assert.equal(overridden.settings.theme_table_style.section_font_family,'tahoma-bold');
  assert.equal(overridden.settings.theme_table_style.item_font_family,'tahoma-bold');
  assert.equal(overridden.settings.theme_table_style.meta_font_family,'tahoma-bold');
  assert.equal(overridden.settings.theme_table_style.price_font_family,'tahoma-bold');
});

test('preset runtime never repositions, resizes or disables generic weather scene elements', () => {
  const sourceWeather={
    id:'weather-1',
    type:'weather',
    x:51,y:62,width:410,height:270,enabled:true,
    weather:{temperature_font_size_pt:44}
  };
  const source={version:1,elements:[sourceWeather]};
  const runtime=resolveMenuThemeRuntime({theme:theme()},source);
  const weather=runtime.scene.elements.find((item)=>item.id==='weather-1');

  assert.deepEqual(
    {x:weather.x,y:weather.y,width:weather.width,height:weather.height,enabled:weather.enabled},
    {x:51,y:62,width:410,height:270,enabled:true}
  );
  assert.equal(weather.weather.temperature_font_size_pt,44);
  assert.equal(sourceWeather.x,51);
});

test('clock and text preset modes do not hide an independent generic weather element', () => {
  const savedWeather={id:'weather-1',type:'weather',x:50,y:60,width:400,height:260,enabled:true};
  for(const mode of ['clock','text']){
    const current=theme();
    current.utility_slot={...current.utility_slot,mode};
    const runtime=resolveMenuThemeRuntime({theme:current},{version:1,elements:[savedWeather]});
    assert.equal(runtime.scene.elements[0].enabled,true);
    assert.equal(runtime.scene.elements[0].x,50);
  }
});

test('legacy logo binding is consumed only as a migration fallback without mutating saved scene', () => {
  const logo={id:'logo-old',type:'logo',enabled:true,x:20,y:30,width:300,height:120,media:{source_url:'/site-assets/scene/logo.webp'}};
  const current=theme();
  current.brand={...current.brand,logo_element_id:'logo-old'};
  const source={version:1,elements:[logo]};
  const runtime=resolveMenuThemeRuntime({theme:current},source);

  assert.equal(runtime.theme.brand.logo_url,'/site-assets/scene/logo.webp');
  assert.equal(runtime.scene.elements[0].enabled,false);
  assert.equal(source.elements[0].enabled,true);
  assert.equal(source.elements[0].x,20);
});

function themedTableSvg(presetId,{promotion=false}={}) {
  const runtime=resolveMenuThemeRuntime({theme:theme(presetId)},{version:1,elements:[]});
  const model=buildRenderModel({
    settings:runtime.settings,
    rows:[
      {id:'section-1',kind:'section',name:'ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ',enabled:true},
      {id:'item-1',kind:'item',product_id:1,enabled:true,promotion,promotion_text:promotion?'АКЦИЯ':''}
    ]
  });
  const lines=buildDisplayLines(model,{
    products:[{
      id:1,
      name:'БИР КОМ СВЕТЛОЕ',
      producer:'Пивоварня БИР КОМ',
      strength:'4,5',
      beverage_color:'light',
      filtration:'filtered',
      price_primary:'230',
      price_secondary:'345'
    }]
  });
  return buildTableSvg(model,lines,buildRenderLayout(model,lines));
}

test('the three approved presets have different table grammar through the same table renderer', () => {
  const premium=themedTableSvg('premium');
  const chalk=themedTableSvg('chalk');
  const brand=themedTableSvg('brand-premium');

  assert.match(premium,/fill="url\(#mira-theme-premium-gold\)"/);
  assert.match(premium,/class="item-sequence"/);
  assert.match(premium,/class="theme-price-columns"/);
  assert.match(premium,/MIRA Montserrat/);
  assert.match(premium,/MIRA Roboto Condensed/);
  assert.match(premium,/MIRA Oswald/);

  assert.match(chalk,/fill="url\(#mira-theme-chalk-gold\)"/);
  assert.doesNotMatch(chalk,/class="item-sequence"/);
  assert.doesNotMatch(chalk,/class="theme-price-columns"/);
  assert.match(chalk,/MIRA Montserrat/);
  assert.match(chalk,/MIRA Roboto Condensed/);
  assert.match(chalk,/MIRA Oswald/);

  assert.match(brand,/fill="url\(#mira-theme-brand-gold\)"/);
  assert.doesNotMatch(brand,/class="item-sequence"/);
  assert.match(brand,/class="theme-price-columns"/);
  assert.match(brand,/MIRA Russo One/);
  assert.match(brand,/MIRA PT Sans Narrow/);
  assert.match(brand,/MIRA Montserrat/);

  assert.notEqual(premium,chalk);
  assert.notEqual(chalk,brand);
  assert.notEqual(premium,brand);
});

test('saved chalk v1 defaults are upgraded before the shared runtime resolves typography', () => {
  const settings={
    theme:{
      preset_id:'chalk',
      preset_version:1,
      brand:{name_font_family:'underdog',name_font_size_px:70,caption_font_size_px:28},
      utility_slot:{
        mode:'weather',
        font_family:'yanone-kaffeesatz',
        font_weight:700,
        temperature_font_family:'yanone-kaffeesatz',
        location_font_size_pt:14
      }
    }
  };
  const resolved=resolveMenuThemeRuntime(settings,{version:1,elements:[]});
  assert.equal(resolved.theme.preset_version,2);
  assert.equal(resolved.theme.brand.name_font_family,'montserrat');
  assert.equal(resolved.theme.brand.name_font_size_px,108);
  assert.equal(resolved.theme.utility_slot.font_family,'montserrat');
  assert.equal(resolved.theme.utility_slot.temperature_font_family,'montserrat');
  assert.equal(resolved.theme.utility_slot.location_font_size_pt,16);
});

test('approved preset rows keep fixed text tone and use semantic promotion price accents', () => {
  const premium=themedTableSvg('premium');
  const premiumPromotion=themedTableSvg('premium',{promotion:true});
  const chalk=themedTableSvg('chalk');
  const chalkPromotion=themedTableSvg('chalk',{promotion:true});

  assert.match(premium,/class="item-name"[^>]*fill="#F8F8F4"/);
  assert.match(premium,/class="price"[^>]*fill="#F8F8F4"/);
  assert.match(premium,/class="cents"[^>]*fill="#F2B72A"/);
  assert.doesNotMatch(premiumPromotion,/class="promotion-badge"/);
  assert.match(premiumPromotion,/class="price"[^>]*fill="#F2B72A"/);
  assert.match(premiumPromotion,/class="cents"[^>]*fill="#F2B72A"/);

  assert.match(chalk,/class="item-name"[^>]*fill="#F4F1E9"/);
  assert.match(chalk,/class="price"[^>]*fill="#F4F1E9"/);
  assert.doesNotMatch(chalkPromotion,/class="promotion-badge"/);
  assert.match(chalkPromotion,/class="price"[^>]*fill="#E5B62E"/);
});
