import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url)=>url.pathname==='/'),
    page.getByRole('button',{name:/войти/i}).click()
  ]);
}

function weatherScene(screenId) {
  return {
    version:1,
    elements:[{
      id:'weather-parity',
      type:'weather',
      enabled:true,
      x:700, y:315, width:525, height:360,
      z_index:5, opacity:.96, rotation_deg:0,
      weather:{
        mode:'current-and-forecast',
        location_name:'Хельсинки',
        latitude:60.1699,
        longitude:24.9384,
        timezone:'Europe/Helsinki',
        refresh_minutes:15,
        show_location:true,
        show_condition:true,
        show_feels_like:true,
        show_humidity:true,
        show_wind:true,
        show_forecast:true,
        forecast_items:3,
        animation_enabled:false,
        animation_speed:1,
        animation_intensity:1,
        widget_motion_enabled:false,
        screen_id:screenId
      }
    }]
  };
}

async function normalizedGeometry(page, layerSelector, nodeSelector) {
  return page.locator(layerSelector).evaluate((layer,{nodeSelector})=>{
    const node=layer.querySelector(nodeSelector);
    if(!(node instanceof HTMLElement)) return null;
    const layerRect=layer.getBoundingClientRect();
    const rect=node.getBoundingClientRect();
    const scale=layerRect.width/1920;
    return {
      x:(rect.left-layerRect.left)/scale,
      y:(rect.top-layerRect.top)/scale,
      width:rect.width/scale,
      height:rect.height/scale
    };
  },{nodeSelector});
}

test('generic Weather keeps canonical geometry between monitor Preview and Player', async ({ browser }) => {
  const admin=await browser.newContext({ baseURL, viewport:{width:1600,height:900} });
  const adminPage=await admin.newPage();
  let locationId=null;

  try {
    await login(adminPage);
    const stamp=Date.now();
    const locationResponse=await adminPage.request.post('/api/locations',{data:{name:`Weather parity ${stamp}`,address:'',active:true}});
    expect(locationResponse.status()).toBe(201);
    const location=await locationResponse.json();
    locationId=location.id;
    const screenResponse=await adminPage.request.post(`/api/locations/${locationId}/screens`,{data:{}});
    expect(screenResponse.status()).toBe(201);
    const screen=await screenResponse.json();
    const editor=await (await adminPage.request.get(`/api/screens/${screen.id}/editor`)).json();
    const save=await adminPage.request.put(`/api/screens/${screen.id}/draft`,{data:{
      revision:editor.draft.revision,
      rows:editor.draft.rows,
      settings:editor.draft.settings,
      scene:weatherScene(screen.id)
    }});
    expect(save.ok()).toBeTruthy();

    await adminPage.goto(`/screen-editor?id=${screen.id}`);
    const previewLayer=adminPage.locator('#editor-menu-preview [data-scene-elements-layer]');
    const previewNode=previewLayer.locator('[data-scene-element-id="weather-parity"]');
    await expect(previewNode.locator('[data-scene-weather-mount] .weather-widget')).toBeVisible();
    const previewGeometry=await normalizedGeometry(adminPage,'#editor-menu-preview [data-scene-elements-layer]','[data-scene-element-id="weather-parity"]');
    expect(previewGeometry).not.toBeNull();

    const player=await browser.newContext({ baseURL, viewport:{width:1920,height:1080}, serviceWorkers:'block' });
    await player.addInitScript(()=>{
      class FakeWebSocket extends EventTarget {
        static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
        constructor(){super();this.readyState=FakeWebSocket.CONNECTING;setTimeout(()=>{this.readyState=FakeWebSocket.OPEN;this.dispatchEvent(new Event('open'));},10);}
        close(){this.readyState=FakeWebSocket.CLOSED;this.dispatchEvent(new Event('close'));}
        send(){}
      }
      window.WebSocket=FakeWebSocket;
    });
    const playerPage=await player.newPage();
    const scene=weatherScene(screen.id);
    const hashes=Object.fromEntries(['screen','menu','scene','animation','scene_playlist','runtime'].map(name=>[name,`${name}-weather-parity-012345678901234567890123`]));
    const state={
      schema_version:4, revision:'4:1', render_revision:1, hashes,
      screen:{...screen,resolution:'1920x1080'},
      draft:{rows:[],settings:{background_color:'#101828'},revision:1},
      products:[], packaging:[], scene,
      animation:{enabled:false,profile:null},
      scene_playlist:{enabled:false,animation_enabled:true,menu_duration_seconds:40,scenes:[]},
      app_version:'1.10.2', fallback_poll_interval_ms:60000, log_batch_size:100,
      log_local_max_entries:5000, log_local_max_bytes:10485760
    };
    const snapshot={
      location_name:'Хельсинки', temperature:18, apparent_temperature:17, humidity:64, wind_speed:12,
      weather_code:61, is_day:true, condition:'Дождь', icon:'rain', updated_at:new Date().toISOString(),
      forecast:[]
    };
    let deltaRequests=0;
    await playerPage.route('**/api/device/session',route=>route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({authorized:true,device_id:1,device_key:'weather-parity-device',session_expires_at:new Date(Date.now()+86400000).toISOString(),screen:state.screen})
    }));
    await playerPage.route('**/api/device/player-logs',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accepted_through:9999})}));
    await playerPage.route('**/api/device/player-delta',route=>{
      deltaRequests+=1;
      const body=deltaRequests===1
        ? {full_snapshot_required:true,context:state}
        : {unchanged:true,schema_version:4,revision:state.revision,render_revision:1,hashes:state.hashes};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await playerPage.route('**/api/device/weather',route=>route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({settings:scene.elements[0].weather,snapshot})
    }));

    await playerPage.goto('/player');
    const playerLayer=playerPage.locator('[data-player-stage] [data-scene-elements-layer]');
    const playerNode=playerLayer.locator('[data-scene-element-id="weather-parity"]');
    await expect(playerNode.locator('.weather-widget')).toBeVisible();
    const playerGeometry=await normalizedGeometry(playerPage,'[data-player-stage] [data-scene-elements-layer]','[data-scene-element-id="weather-parity"]');
    expect(playerGeometry).not.toBeNull();

    for(const key of ['x','y','width','height']) {
      expect(Math.abs(previewGeometry[key]-playerGeometry[key]),key).toBeLessThan(1.5);
    }
    await player.close();
  } finally {
    if(locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
    await admin.close();
  }
});
