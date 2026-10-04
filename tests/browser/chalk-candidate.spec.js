import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || '');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('chalk candidate renders through the real Scene Editor runtime', async ({ page }, testInfo) => {
  await page.setViewportSize({width:1440,height:900});
  const weather={
    location_name:'Комсомольск-на-Амуре',
    latitude:50.55,
    longitude:137.01,
    timezone:'Asia/Vladivostok',
    updated_at:'2026-10-04T10:00',
    temperature:9,
    apparent_temperature:8,
    humidity:62,
    wind_speed:3,
    wind_direction:90,
    weather_code:2,
    is_day:true,
    condition:'Облачно',
    icon:'partly-cloudy',
    forecast:[
      {time:'2026-10-04T12:00',temperature:8,icon:'partly-cloudy'},
      {time:'2026-10-04T18:00',temperature:7,icon:'cloud'},
      {time:'2026-10-05T00:00',temperature:6,icon:'moon'}
    ]
  };
  await page.route('**/api/weather/locations**', async (route) => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify([{name:'Комсомольск-на-Амуре',admin1:'Хабаровский край',country:'Россия',latitude:50.55,longitude:137.01,timezone:'Asia/Vladivostok'}])
  }));
  await page.route('**/api/weather/preview**', async (route) => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify(weather)
  }));

  await login(page);
  const stamp=Date.now();
  let locationId=null;
  let screenId=null;
  try {
    const location=await (await page.request.post('/api/locations',{data:{name:`Chalk candidate ${stamp}`,address:'Visual candidate',active:true}})).json();
    locationId=location.id;
    const screen=await (await page.request.post(`/api/locations/${location.id}/screens`,{data:{}})).json();
    screenId=screen.id;

    await page.goto(`/scene?screen=${screenId}`);
    const stage=page.locator('#scene-editor-stage');
    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема меню').selectOption('chalk');
    await expect(stage).toHaveAttribute('data-menu-theme','chalk');

    const city=page.getByLabel('Город встроенной погоды');
    await city.fill('Комсомольск');
    const option=page.locator('.weather-location-option').filter({hasText:'Комсомольск-на-Амуре'}).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(stage.locator('.theme-weather--chalk')).toBeVisible();
    await expect(stage.locator('.theme-weather--chalk')).toHaveAttribute('data-icon-style','chalk-sketch');
    await expect(stage.locator('.menu-theme-decor-image')).toHaveAttribute('src','/brand/themes/chalk-side.svg');
    await page.evaluate(() => document.fonts.ready);
    await testInfo.attach('chalk-candidate-render',{body:await stage.screenshot({type:'png'}),contentType:'image/png'});
  } finally {
    if(screenId) await page.request.delete(`/api/screens/${screenId}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});
