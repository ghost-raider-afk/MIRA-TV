import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMenuThemeRuntime } from '../src/web/admin-ui/public/js/player/menu-theme-runtime.js';
import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel
} from '../src/web/admin-ui/public/js/editor/renderer.js';
import { buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer-svg.js';

function theme(presetId = 'premium', overrides = []) {
  return {
    schema_version:1,
    preset_id:presetId,
    preset_version:1,
    brand:{ name:'БИР ФИШ',caption:'',logo_element_id:'logo-1',name_font_family:'',caption_font_family:'' },
    utility_slot:{ mode:'weather',text:'',weather_element_id:'weather-1',font_family:'' },
    overrides
  };
}

test('theme resolver applies preset background/table defaults but explicit overrides stay authoritative', () => {
  const preset = resolveMenuThemeRuntime({
    background_color:'#123456',
    font_family:'tahoma-bold',
    theme:theme()
  },{ version:1,elements:[] });
  assert.equal(preset.settings.background_color,'#050607');
  assert.equal(preset.settings.background_image_url,'/brand/themes/premium-background.svg');
  assert.equal(preset.settings.font_family,'arial');
  assert.equal(preset.settings.theme_table_style.variant,'premium');

  const overridden = resolveMenuThemeRuntime({
    background_color:'#123456',
    font_family:'tahoma-bold',
    theme:theme('premium',['background_color','font_family'])
  },{ version:1,elements:[] });
  assert.equal(overridden.settings.background_color,'#123456');
  assert.equal(overridden.settings.font_family,'tahoma-bold');
});

test('theme resolver reuses canonical logo/weather and applies theme weather design without mutating saved scene', () => {
  const sourceWeather={
    id:'weather-1',type:'weather',x:1,y:2,width:100,height:80,enabled:true,
    weather:{ temperature_font_family:'mira-mono',temperature_font_size_pt:44,location_font_size_pt:12,icon_scale_percent:90 }
  };
  const runtime = resolveMenuThemeRuntime({ theme:theme() },{
    version:1,
    elements:[
      { id:'logo-1',type:'logo',x:1,y:2,width:100,height:80,enabled:true },
      sourceWeather
    ]
  });
  const logo=runtime.scene.elements.find((item)=>item.id==='logo-1');
  const weather=runtime.scene.elements.find((item)=>item.id==='weather-1');
  assert.deepEqual(
    { x:logo.x,y:logo.y,width:logo.width,height:logo.height,z:logo.z_index },
    { x:1522,y:300,width:336,height:112,z:40 }
  );
  assert.deepEqual(
    { x:weather.x,y:weather.y,width:weather.width,height:weather.height,z:weather.z_index },
    { x:1512,y:48,width:356,height:236,z:35 }
  );
  assert.deepEqual(
    {
      font:weather.weather.temperature_font_family,
      temp:weather.weather.temperature_font_size_pt,
      city:weather.weather.location_font_size_pt,
      icon:weather.weather.icon_scale_percent
    },
    { font:'arial',temp:54,city:15,icon:128 }
  );
  assert.equal(sourceWeather.x,1);
  assert.equal(sourceWeather.weather.temperature_font_size_pt,44);
});

test('clock or text utility hides only the bound weather element without mutating the saved scene', () => {
  const savedWeather={ id:'weather-1',type:'weather',x:50,y:60,width:400,height:260,enabled:true };
  const settings={ theme:{ ...theme(),utility_slot:{ ...theme().utility_slot,mode:'clock' } } };
  const source={ version:1,elements:[savedWeather] };
  const runtime=resolveMenuThemeRuntime(settings,source);
  assert.equal(runtime.scene.elements[0].enabled,false);
  assert.equal(source.elements[0].enabled,true);
  assert.equal(source.elements[0].x,50);
});

function themedTableSvg(presetId) {
  const runtime=resolveMenuThemeRuntime({ theme:theme(presetId) },{ version:1,elements:[] });
  const model=buildRenderModel({
    settings:runtime.settings,
    rows:[
      { id:'section-1',kind:'section',name:'ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ',enabled:true },
      { id:'item-1',kind:'item',product_id:1,enabled:true }
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
  const layout=buildRenderLayout(model,lines);
  return buildTableSvg(model,lines,layout);
}

test('approved themes have distinct table chrome and typography through the same renderer', () => {
  const premium=themedTableSvg('premium');
  const chalk=themedTableSvg('chalk');
  const brand=themedTableSvg('brand-premium');

  assert.match(premium,/fill="url\(#mira-theme-premium-gold\)"/);
  assert.match(premium,/class="item-sequence"/);
  assert.match(premium,/class="theme-price-columns"/);
  assert.match(premium,/font-family="Arial, Liberation Sans, sans-serif"/);

  assert.match(chalk,/fill="url\(#mira-theme-chalk-gold\)"/);
  assert.doesNotMatch(chalk,/class="item-sequence"/);
  assert.doesNotMatch(chalk,/class="theme-price-columns"/);
  assert.match(chalk,/font-family="DejaVu Sans Condensed, DejaVu Sans, sans-serif"/);

  assert.match(brand,/fill="url\(#mira-theme-brand-gold\)"/);
  assert.doesNotMatch(brand,/class="item-sequence"/);
  assert.match(brand,/class="theme-price-columns"/);
  assert.match(brand,/font-family="Arial Narrow, Liberation Sans Narrow, DejaVu Sans Condensed, Arial, sans-serif"/);
});
