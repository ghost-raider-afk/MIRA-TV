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
    const themeSelect=page.getByLabel('Тема');
    await expect(themeSelect).toBeVisible();
    await expect(themeSelect.locator('option')).toHaveText([
      'Конструктор темы',
      'Премиальная',
      'Меловая',
      'Брендовая премиальная'
    ]);

    await themeSelect.selectOption('premium');
    await expect(stage).toHaveAttribute('data-menu-theme','premium');
    await expect(stage.locator('.menu-theme-brand-name')).toHaveText('БИР ФИШ');
    await expect(stage.locator('.menu-theme-decor-image')).toHaveAttribute('src','/brand/themes/premium-side.svg');
    await expect(page.getByLabel('Содержимое полезного слота')).toHaveValue('weather');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(0);
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
    await expect(page.getByText('Конструктор темы',{exact:true}).first()).toBeVisible();

    await page.getByRole('button',{name:'+ Погода'}).click();
    const stage=page.locator('#scene-editor-stage');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(1);

    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема').selectOption('chalk');
    await expect(stage).toHaveAttribute('data-menu-theme','chalk');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(1);

    await page.locator('#scene-editor-theme-layer').click();
    await page.getByLabel('Тема').selectOption('legacy');
    await expect(stage).toHaveAttribute('data-menu-theme','legacy');
    await expect(stage.locator('[data-scene-element-type="weather"]')).toHaveCount(1);
  } finally {
    if(screenId) await page.request.delete(`/api/screens/${screenId}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});
