import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMenuThemeRuntime } from '../src/web/admin-ui/public/js/player/menu-theme-runtime.js';

function theme(overrides = []) {
  return {
    schema_version:1,
    preset_id:'premium',
    preset_version:1,
    brand:{
      name:'БИР ФИШ',
      caption:'',
      logo_element_id:'logo-1',
      name_font_family:'arial',
      name_font_size_px:68,
      name_font_weight:900,
      caption_font_family:'arial',
      caption_font_size_px:20,
      caption_font_weight:700
    },
    utility_slot:{
      mode:'weather',
      text:'',
      weather_element_id:'weather-1',
      font_family:'arial',
      font_size_px:30,
      font_weight:800,
      temperature_font_family:'arial',
      temperature_font_size_pt:60,
      location_font_size_pt:17,
      icon_scale_percent:145
    },
    overrides
  };
}

test('theme resolver applies preset defaults but explicit overrides stay authoritative', () => {
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
    theme:theme(['background_color','font_family'])
  },{ version:1,elements:[] });
  assert.equal(overridden.settings.background_color,'#123456');
  assert.equal(overridden.settings.font_family,'tahoma-bold');
});

test('theme resolver reuses canonical logo and weather elements and places them into theme slots', () => {
  const runtime = resolveMenuThemeRuntime({
    theme:theme()
  },{
    version:1,
    elements:[
      { id:'logo-1',type:'logo',x:1,y:2,width:100,height:80,enabled:true },
      {
        id:'weather-1',
        type:'weather',
        x:1,y:2,width:100,height:80,enabled:true,
        weather:{
          temperature_font_family:'mira-serif',
          temperature_font_size_pt:48,
          location_font_size_pt:14,
          icon_scale_percent:100,
          forecast_items:3
        }
      }
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
  assert.equal(weather.weather.temperature_font_family,'arial');
  assert.equal(weather.weather.temperature_font_size_pt,60);
  assert.equal(weather.weather.location_font_size_pt,17);
  assert.equal(weather.weather.icon_scale_percent,145);
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
