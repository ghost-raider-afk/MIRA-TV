import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMenuThemeRuntime } from '../src/web/admin-ui/public/js/player/menu-theme-runtime.js';

function theme(overrides = []) {
  return {
    schema_version:1,
    preset_id:'premium',
    preset_version:1,
    brand:{ name:'БИР ФИШ',caption:'',logo_element_id:'logo-1',name_font_family:'',caption_font_family:'' },
    utility_slot:{ mode:'weather',text:'',weather_element_id:'weather-1',font_family:'' },
    overrides
  };
}

test('theme resolver applies preset defaults but explicit overrides stay authoritative', () => {
  const preset = resolveMenuThemeRuntime({
    background_color:'#123456',
    font_family:'tahoma-bold',
    theme:theme()
  },{ version:1,elements:[] });
  assert.equal(preset.settings.background_color,'#070A0C');
  assert.equal(preset.settings.font_family,'arial');

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
      { id:'weather-1',type:'weather',x:1,y:2,width:100,height:80,enabled:true }
    ]
  });
  const logo=runtime.scene.elements.find((item)=>item.id==='logo-1');
  const weather=runtime.scene.elements.find((item)=>item.id==='weather-1');
  assert.deepEqual(
    { x:logo.x,y:logo.y,width:logo.width,height:logo.height,z:logo.z_index },
    { x:1530,y:314,width:320,height:118,z:40 }
  );
  assert.deepEqual(
    { x:weather.x,y:weather.y,width:weather.width,height:weather.height,z:weather.z_index },
    { x:1510,y:48,width:360,height:244,z:35 }
  );
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
