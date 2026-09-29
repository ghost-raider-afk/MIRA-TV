import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('preset themes are self-contained and apply to another TV without creating generic weather', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await login(page);

  const stamp=Date.now();
  let locationId=null;
  const screenIds=[];
  try {
    const locationResponse=await page.request.post('/api/locations',{
      data:{name:`Theme CI ${stamp}`,address:'Theme regression',active:true}
    });
    expect(locationResponse.status()).toBe(201);
    const location=await locationResponse.json();
    locationId=location.id;

    for(let index=0;index<2;index+=1){
      const response=await page.request.post(`/api/locations/${location.id}/screens`,{data:{}});
      expect(response.status()).toBe(201);
      screenIds.push((await response.json()).id);
    }

    const [sourceId,targetId]=screenIds;
    await page.goto(`/scene?screen=${sourceId}`);
    const stage=page.locator('#scene-editor-stage');
    await expect(stage).toHaveAttribute('data-menu-theme','legacy');

    await page.locator('#scene-editor-theme-layer').click();
    const themeSelect=page.getByLabel('Тема меню');
    await expect(themeSelect).toBeVisible();
    await expect(themeSelect.locator('option')).toHaveText([
      'Конструктор темы',
      'Премиальная',
      'Меловая',
      'Брендовая премиальная'
    ]);

    const approvedPresets=[
      ['premium','/brand/themes/premium-side.svg','premium'],
      ['chalk','/brand/themes/chalk-side.svg','chalk'],
      ['brand-premium','/brand/themes/brand-premium-side.svg','brand-premium']
    ];
    for(const [presetId,decorSource,weatherVariant] of approvedPresets){
      await themeSelect.selectOption(presetId);
      await expect(stage).toHaveAttribute('data-menu-theme',presetId);
      await expect(stage.locator('.menu-theme-side-panel')).toHaveAttribute('data-theme-variant',presetId);
      await expect(stage.locator('.menu-theme-brand-name')).toHaveText('БИР ФИШ');
      await expect(stage.locator('.menu-theme-decor-image')).toHaveAttribute('src',decorSource);
      await expect(stage.locator('.menu-theme-utility')).toHaveAttribute('data-utility-mode','weather');
      await expect(stage.locator('.menu-theme-utility')).toHaveAttribute('data-weather-variant',weatherVariant);
      await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(0);
      if(presetId==='chalk'){
        await expect(stage.locator('.menu-theme-brand-divider')).toHaveCSS('display','none');
        await expect(stage.locator('.menu-theme-brand-caption')).toHaveText('Хорошее пиво рядом!');
      }
    }
    await themeSelect.selectOption('premium');
    await expect(stage).toHaveAttribute('data-menu-theme','premium');
    await expect(page.getByLabel('Кегль температуры темы')).toBeEnabled();
    await expect(page.getByLabel('Масштаб иконки погоды темы')).toBeEnabled();
    await expect(page.getByLabel('Текст предупреждения')).toBeEnabled();
    await expect(page.getByRole('button',{name:'Настроить погоду'})).toHaveCount(0);

    await page.getByLabel('Размер названия бренда').fill('79');
    await page.getByLabel('Кегль температуры темы').fill('61');
    await page.getByLabel('Масштаб иконки погоды темы').fill('146');
    await page.getByLabel('Текст предупреждения').fill('ТЕСТОВОЕ ПРЕДУПРЕЖДЕНИЕ');

    await page.locator('#scene-editor-save').click();
    await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Сохранено');

    const saved=await (await page.request.get(`/api/screens/${sourceId}/editor`)).json();
    expect(saved.draft.settings.theme.preset_id).toBe('premium');
    expect(saved.draft.settings.theme.brand.name_font_size_px).toBe(79);
    expect(saved.draft.settings.theme.utility_slot.temperature_font_size_pt).toBe(61);
    expect(saved.draft.settings.theme.utility_slot.icon_scale_percent).toBe(146);
    expect(saved.draft.settings.theme.legal.text).toBe('ТЕСТОВОЕ ПРЕДУПРЕЖДЕНИЕ');
    expect(saved.draft.settings.theme.utility_slot.weather_element_id).toBe('');
    expect(saved.draft.scene.elements.some((item)=>item.type==='weather')).toBe(false);

    const apply=await page.request.put(`/api/screens/${sourceId}/scene/apply`,{
      data:{
        kind:'theme',
        target_screen_ids:[targetId],
        theme:saved.draft.settings.theme,
        override_settings:{},
        bound_elements:{logo:null,weather:null}
      }
    });
    expect(apply.ok()).toBeTruthy();

    const target=await (await page.request.get(`/api/screens/${targetId}/editor`)).json();
    expect(target.draft.settings.theme.preset_id).toBe('premium');
    expect(target.draft.settings.theme.utility_slot.temperature_font_size_pt).toBe(61);
    expect(target.draft.settings.theme.legal.text).toBe('ТЕСТОВОЕ ПРЕДУПРЕЖДЕНИЕ');
    expect(target.draft.scene.elements.some((item)=>item.type==='weather')).toBe(false);
  } finally {
    for(const id of screenIds) await page.request.delete(`/api/screens/${id}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});

test('approved preset decor assets decode in Chromium', async ({ page }) => {
  await page.goto('/signin');
  const assets=[
    '/brand/themes/premium-side.svg',
    '/brand/themes/chalk-side.svg',
    '/brand/themes/brand-premium-side.svg'
  ];
  for(const url of assets){
    const response=await page.request.get(url);
    expect(response.status(),url+' is not served').toBe(200);
    expect(response.headers()['content-type'] || '',url+' has the wrong content type').toContain('image/svg+xml');
  }
  const decoded=await page.evaluate(async (urls) => Promise.all(urls.map((url) => new Promise((resolve) => {
    const image=new Image();
    image.onload=()=>resolve({url,width:image.naturalWidth,height:image.naturalHeight});
    image.onerror=()=>resolve({url,width:0,height:0});
    image.src=url+'?decode-check=1';
  }))),assets);
  for(const item of decoded){
    expect(item.width, item.url+' failed to decode').toBeGreaterThan(0);
    expect(item.height, item.url+' failed to decode').toBeGreaterThan(0);
  }
});

test('approved weather informers render three distinct preset visual systems', async ({ page }, testInfo) => {
  await page.setViewportSize({width:1440,height:900});

  const snapshot={
    location_name:'Комсомольск-на-Амуре',
    latitude:50.55,
    longitude:137.01,
    timezone:'Asia/Vladivostok',
    updated_at:'2026-09-29T07:00',
    temperature:9,
    apparent_temperature:8,
    humidity:70,
    wind_speed:8,
    wind_direction:90,
    weather_code:2,
    is_day:true,
    condition:'Облачно',
    icon:'partly-cloudy',
    forecast:[
      {time:'2026-09-29T23:00',temperature:8,icon:'partly-cloudy'},
      {time:'2026-09-30T00:00',temperature:7,icon:'partly-cloudy'},
      {time:'2026-09-30T01:00',temperature:6,icon:'moon'}
    ]
  };
  await page.route('**/api/weather/locations**', async (route) => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify([{
        name:'Комсомольск-на-Амуре',
        admin1:'Хабаровский край',
        country:'Россия',
        latitude:50.55,
        longitude:137.01,
        timezone:'Asia/Vladivostok'
      }])
    });
  });
  await page.route('**/api/weather/preview**', async (route) => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify(snapshot)
    });
  });

  await login(page);
  const stamp=Date.now();
  let locationId=null;
  let screenId=null;
  try {
    const location=await (await page.request.post('/api/locations',{
      data:{name:`Weather informer CI ${stamp}`,address:'Weather visual regression',active:true}
    })).json();
    locationId=location.id;
    const screen=await (await page.request.post(`/api/locations/${location.id}/screens`,{data:{}})).json();
    screenId=screen.id;

    await page.goto(`/scene?screen=${screenId}`);
    const stage=page.locator('#scene-editor-stage');
    await page.locator('#scene-editor-theme-layer').click();
    const themeSelect=page.getByLabel('Тема меню');
    await themeSelect.selectOption('premium');

    const city=page.getByLabel('Город встроенной погоды');
    await city.fill('Комсомольск');
    const cityOption=page.locator('.weather-location-option').filter({hasText:'Комсомольск-на-Амуре'}).first();
    await expect(cityOption).toBeVisible();
    await cityOption.click();

    const premium=stage.locator('.theme-weather--premium');
    await expect(premium).toBeVisible();
    await expect(premium).toHaveAttribute('data-icon-style','premium-line');
    await expect(premium.locator('.theme-weather-location')).toHaveCSS('font-family',/MIRA Montserrat/);
    await expect(premium.locator('.theme-weather-temperature')).toHaveCSS('font-family',/MIRA Oswald/);
    await expect(premium.locator('.theme-weather-temperature')).toHaveCSS('color','rgb(248, 248, 245)');
    await expect(premium.locator('.theme-weather-current-icon svg')).toHaveAttribute('data-icon','partly-cloudy');
    await expect(premium.locator('.theme-weather-brand-mark')).toHaveCount(0);
    await expect(stage.locator('.menu-theme-utility[data-weather-variant="premium"]')).toHaveCSS('border-top-width','0px');
    await expect(premium.locator('.theme-weather-forecast')).toHaveCSS('border-bottom-width','2px');
    await testInfo.attach('premium-theme-audit',{body:await stage.screenshot({type:'png'}),contentType:'image/png'});

    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема меню').selectOption('chalk');
    const chalk=stage.locator('.theme-weather--chalk');
    await expect(chalk).toBeVisible();
    await expect(chalk).toHaveAttribute('data-icon-style','chalk-drawn');
    await expect(chalk.locator('.theme-weather-location')).toHaveCSS('font-family',/MIRA Montserrat/);
    await expect(chalk.locator('.theme-weather-temperature')).toHaveCSS('font-family',/MIRA Montserrat/);
    await expect(chalk.locator('.theme-weather-condition')).toHaveCSS('font-family',/MIRA Neucha/);
    await expect(chalk.locator('.theme-weather-forecast-item').first()).toHaveCSS('font-family',/MIRA Roboto Condensed/);
    await expect(chalk.locator('.theme-weather-condition')).toHaveCSS('text-transform','lowercase');
    await expect(chalk.locator('.theme-weather-brand-mark')).toHaveCount(0);
    await testInfo.attach('chalk-theme-audit',{body:await stage.screenshot({type:'png'}),contentType:'image/png'});

    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема меню').selectOption('brand-premium');
    const brand=stage.locator('.theme-weather--brand-premium');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('data-icon-style','brand-gold');
    await expect(brand.locator('.theme-weather-location')).toHaveCSS('font-family',/MIRA Russo One/);
    await expect(brand.locator('.theme-weather-temperature')).toHaveCSS('font-family',/MIRA Montserrat/);
    await expect(brand.locator('.theme-weather-temperature')).toHaveCSS('color','rgb(244, 182, 31)');
    await expect(brand.locator('.theme-weather-brand-mark')).toHaveCount(1);
    await expect(brand.locator('.theme-weather-forecast-item')).toHaveCount(3);
    await testInfo.attach('brand-premium-theme-audit',{body:await stage.screenshot({type:'png'}),contentType:'image/png'});
  } finally {
    if(screenId) await page.request.delete(`/api/screens/${screenId}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});

test('chalk preset uses approved brand hierarchy and recovers stale managed decor assets', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await login(page);

  const stamp=Date.now();
  let locationId=null;
  let screenId=null;
  try {
    const location=await (await page.request.post('/api/locations',{
      data:{name:`Chalk visual CI ${stamp}`,address:'Chalk preset regression',active:true}
    })).json();
    locationId=location.id;
    const screen=await (await page.request.post(`/api/locations/${location.id}/screens`,{data:{}})).json();
    screenId=screen.id;
    const editor=await (await page.request.get(`/api/screens/${screenId}/editor`)).json();

    const saved=await page.request.put(`/api/screens/${screenId}/draft`,{data:{
      revision:editor.draft.revision,
      rows:editor.draft.rows,
      settings:{
        ...editor.draft.settings,
        theme:{
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
            mode:'none',
            font_family:'yanone-kaffeesatz',
            font_weight:700,
            temperature_font_family:'yanone-kaffeesatz',
            location_font_size_pt:14
          },
          decor:{source_url:'/brand/themes/chalk-side.svg'}
        }
      },
      scene:editor.draft.scene,
      screen:{
        location_id:screen.location_id,
        name:screen.name,
        resolution:screen.resolution || '1920×1080',
        status:'draft',
        active:true
      }
    }});
    expect(saved.ok()).toBeTruthy();

    await page.goto(`/scene?screen=${screenId}`);
    const stage=page.locator('#scene-editor-stage');
    await expect(stage).toHaveAttribute('data-menu-theme','chalk');
    const brand=stage.locator('.menu-theme-brand-name');
    await expect(brand).toHaveCSS('font-family',/MIRA Montserrat/);
    await expect(brand).toHaveCSS('font-size','108px');
    const caption=stage.locator('.menu-theme-brand-caption');
    await expect(caption).toHaveCSS('font-family',/MIRA Neucha/);
    await expect(caption).toHaveCSS('top','280px');
    await expect(stage.locator('.menu-theme-brand')).toHaveCSS('z-index','2');
    await expect(stage.locator('.menu-theme-decor-image')).toHaveAttribute('src','/brand/themes/chalk-side.svg');
  } finally {
    if(screenId) await page.request.delete(`/api/screens/${screenId}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});

test('Theme Constructor owns generic scene elements and preset selection does not consume them', async ({ page }) => {
  await page.setViewportSize({width:1280,height:800});
  await login(page);

  const stamp=Date.now();
  let locationId=null;
  let screenId=null;
  try {
    const locationResponse=await page.request.post('/api/locations',{
      data:{name:`Constructor CI ${stamp}`,address:'Theme constructor',active:true}
    });
    const location=await locationResponse.json();
    locationId=location.id;
    const screenResponse=await page.request.post(`/api/locations/${location.id}/screens`,{data:{}});
    screenId=(await screenResponse.json()).id;

    await page.goto(`/scene?screen=${screenId}`);
    await page.locator('#scene-editor-theme-layer').click();
    await expect(page.locator('#scene-editor-properties .scene-theme-constructor .scene-theme-subsection-title')).toHaveText('Конструктор темы');

    await page.getByRole('button',{name:'+ Погода'}).click();
    const stage=page.locator('#scene-editor-stage');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(1);

    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема меню').selectOption('chalk');
    await expect(stage).toHaveAttribute('data-menu-theme','chalk');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(1);

    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема меню').selectOption('legacy');
    await expect(stage).toHaveAttribute('data-menu-theme','legacy');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(1);
  } finally {
    if(screenId) await page.request.delete(`/api/screens/${screenId}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});


test('Theme Constructor saves a named theme and reuses it on another TV', async ({ page }) => {
  await page.setViewportSize({width:1280,height:800});
  await login(page);
  const stamp=Date.now();
  const themeName=`Saved constructor ${stamp}`;
  let locationId=null;
  let templateId=null;
  const screenIds=[];
  try {
    const location=await (await page.request.post('/api/locations',{
      data:{name:`Saved constructor CI ${stamp}`,address:'Theme regression',active:true}
    })).json();
    locationId=location.id;
    for(let index=0;index<2;index+=1){
      const screen=await (await page.request.post(`/api/locations/${location.id}/screens`,{data:{}})).json();
      screenIds.push(screen.id);
    }

    await page.goto(`/scene?screen=${screenIds[0]}`);
    await page.locator('#scene-editor-theme-layer').click();
    await page.getByRole('button',{name:'+ Текстовое поле'}).click();
    await page.locator('#scene-editor-theme-layer').click();

    await page.getByLabel('Название пользовательской темы').fill(themeName);
    await page.getByRole('button',{name:'Сохранить как тему'}).click();
    await expect(page.locator('#scene-editor-message')).toContainText('сохранена');

    const catalog=await (await page.request.get('/api/screens/menu-themes/custom')).json();
    const saved=catalog.find((item)=>item.name===themeName);
    expect(saved).toBeTruthy();
    templateId=saved.id;

    const template=await (await page.request.get(`/api/screens/menu-themes/custom/${templateId}`)).json();
    expect(template.settings.theme.preset_id).toBe('legacy');
    expect(template.scene.elements.some((item)=>item.type==='text')).toBe(true);

    const apply=await page.request.post(`/api/screens/menu-themes/custom/${templateId}/apply`,{
      data:{target_screen_ids:[screenIds[1]]}
    });
    expect(apply.ok()).toBeTruthy();

    const target=await (await page.request.get(`/api/screens/${screenIds[1]}/editor`)).json();
    expect(target.draft.settings.theme.preset_id).toBe('legacy');
    expect(target.draft.scene.elements.some((item)=>item.type==='text')).toBe(true);
  } finally {
    if(templateId) await page.request.delete(`/api/screens/menu-themes/custom/${templateId}`).catch(()=>undefined);
    for(const id of screenIds) await page.request.delete(`/api/screens/${id}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});
