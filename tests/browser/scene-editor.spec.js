import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function fixture(page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', { data:{ name:`Scene ${suffix}`, address:'Visual CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const productResponse = await page.request.post('/api/catalog/products', { data:{
    name:`Scene product ${suffix}`, producer:'MIRA', characteristics:'', strength:'', price_primary:'250',
    alcoholic:false, beverage_color:'none', filtration:'none', active:true
  } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:editor.draft.revision,
    rows:[
      { id:`scene-section-${suffix}`, kind:'section', name:'СЦЕНА', enabled:true },
      { id:`scene-item-${suffix}`, kind:'item', product_id:product.id, enabled:true }
    ],
    settings:{ background_color:'#101828', accent_color:'#F4C915', text_color:'#F8FAFC' },
    screen:{ location_id:screen.location_id, name:screen.name, resolution:'1920×1080', status:'draft', active:true }
  } });
  expect(saved.ok()).toBeTruthy();
  return { screen };
}

test('Scene editor keeps layers, shared Player preview and contextual properties on one desktop page', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen } = await fixture(page);
  await page.goto(`/scene?screen=${screen.id}`);

  await expect(page.locator('#scene-editor-layers')).toBeVisible();
  await expect(page.locator('#scene-editor-stage')).toBeVisible();
  await expect(page.locator('#scene-editor-properties')).toBeVisible();
  await expect(page.locator('#scene-editor-screen')).toHaveValue(String(screen.id));
  await expect(page.locator('#scene-editor-resolution')).toHaveText('1920×1080');

  const geometry = await page.evaluate(() => ({
    documentClient:document.documentElement.clientHeight,
    documentScroll:document.documentElement.scrollHeight,
    layersClient:document.querySelector('.scene-editor-layers-panel')?.clientHeight || 0,
    layersScroll:document.querySelector('.scene-editor-layers-panel')?.scrollHeight || 0,
    propertiesClient:document.querySelector('.scene-editor-properties-panel')?.clientHeight || 0,
    propertiesScroll:document.querySelector('.scene-editor-properties-panel')?.scrollHeight || 0
  }));
  expect(geometry.documentScroll).toBeLessThanOrEqual(geometry.documentClient + 2);
  expect(geometry.layersScroll).toBeLessThanOrEqual(geometry.layersClient + 2);
  expect(geometry.propertiesScroll).toBeLessThanOrEqual(geometry.propertiesClient + 2);

  const shellBox = await page.locator('#scene-editor-stage-shell').boundingBox();
  expect(shellBox).not.toBeNull();
  const areaShare = (shellBox.width * shellBox.height) / (1600 * 900);
  expect(areaShare).toBeGreaterThan(.12);
  expect(areaShare).toBeLessThan(.34);

  await page.locator('#scene-editor-add').click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(1);
  await expect(page.locator('.scene-editor-selection-box')).toHaveCount(1);
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Элемент 1');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="text"]')).toHaveCount(1);

  const inspector = page.locator('#scene-editor-properties');
  await inspector.getByLabel('Текст', { exact:true }).fill('бар маяк');
  await inspector.getByLabel('X', { exact:true }).fill('300');
  await inspector.getByLabel('Y', { exact:true }).fill('160');
  await inspector.getByRole('button', { name:'Шрифт', exact:true }).click();
  await inspector.getByLabel('Размер, px', { exact:true }).fill('96');
  await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Не сохранено');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="text"]')).toContainText('бар маяк');

  await page.locator('#scene-editor-add').click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(2);
  await inspector.getByLabel('Тип элемента 2').selectOption('weather');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="weather"]')).toHaveCount(1);
  await expect(inspector.getByRole('button', { name:'Погода', exact:true })).toBeVisible();

  await page.locator('#scene-editor-add').click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(3);
  await expect(inspector.getByLabel('Тип элемента 3').locator('option[value="weather"]')).toHaveCount(0);
  await expect(inspector).toContainText('Погода уже добавлена в сцену.');

  const saveResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/screens/${screen.id}/draft`) && response.request().method() === 'PUT'
  );
  await page.locator('#scene-editor-save').click();
  expect((await saveResponse).ok()).toBeTruthy();
  await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Сохранено');

  const stored = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  expect(stored.draft.scene.elements).toHaveLength(3);
  expect(stored.draft.scene.elements[0].text.runs[0].value).toBe('бар маяк');
  expect(stored.draft.scene.elements[0].x).toBe(300);
  expect(stored.draft.scene.elements[1].type).toBe('weather');

  await page.goto(`/screen-editor?id=${screen.id}`);
  await expect(page.locator('#editor-elements-stack')).toHaveCount(0);
  await expect(page.locator('#editor-add-element')).toHaveCount(0);
  await expect(page.locator('#editor-menu-preview [data-scene-elements-layer]')).toHaveCount(0);
  await expect(page.locator('#editor-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
});
