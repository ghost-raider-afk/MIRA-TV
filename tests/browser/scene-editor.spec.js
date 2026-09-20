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
  return { screen, product };
}

test('Scene editor keeps layers, shared Player preview and contextual properties on one desktop page', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen, product } = await fixture(page);

  await page.route('**/api/weather/locations**', async (route) => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify([{
        name:'Комсомольск-на-Амуре',
        admin1:'Хабаровский край',
        country:'Россия',
        latitude:50.5503,
        longitude:137.0079,
        timezone:'Asia/Vladivostok'
      }])
    });
  });
  await page.route('**/api/weather/preview**', async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('name')).toBe('Комсомольск-на-Амуре');
    expect(Number(url.searchParams.get('latitude'))).toBeCloseTo(50.5503, 3);
    expect(Number(url.searchParams.get('longitude'))).toBeCloseTo(137.0079, 3);
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        location_name:'Комсомольск-на-Амуре',
        temperature:-7,
        apparent_temperature:-11,
        humidity:71,
        wind_speed:9,
        weather_code:3,
        is_day:true,
        condition:'Облачно',
        icon:'cloud',
        updated_at:new Date().toISOString(),
        forecast:[
          { time:'2026-09-20T12:00', temperature:-6, icon:'cloud', precipitation_probability:10 },
          { time:'2026-09-20T15:00', temperature:-5, icon:'cloud', precipitation_probability:10 },
          { time:'2026-09-20T18:00', temperature:-8, icon:'cloud', precipitation_probability:20 }
        ]
      })
    });
  });

  await page.goto(`/scene?screen=${screen.id}`);

  await expect(page.locator('#scene-editor-layers')).toBeVisible();
  await expect(page.locator('#scene-editor-stage')).toBeVisible();
  await expect(page.locator('#scene-editor-properties')).toBeVisible();
  await expect(page.locator('#scene-editor-screen')).toHaveValue(String(screen.id));
  await expect(page.locator('#scene-editor-resolution')).toHaveText('1920×1080');
  const backgroundLayer = page.locator('#scene-editor-background-layer');
  const tableLayer = page.locator('#scene-editor-table-layer');
  await expect(backgroundLayer).toBeVisible();
  await expect(tableLayer).toBeVisible();
  await expect(backgroundLayer.locator('svg')).toHaveCount(1);
  await expect(tableLayer.locator('svg')).toHaveCount(1);
  expect((await backgroundLayer.boundingBox())?.height).toBeLessThanOrEqual(28);
  expect((await tableLayer.boundingBox())?.height).toBeLessThanOrEqual(28);
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Элемент не выбран');
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeHidden();
  await expect(page.locator('#scene-editor-undo')).toBeDisabled();
  await expect(page.locator('#scene-editor-redo')).toBeDisabled();

  await page.locator('#scene-editor-table-layer').click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Таблица меню');
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeVisible();
  await expect(page.locator('#scene-editor-table-edit-layer [data-editor-preview-row-control]')).toHaveCount(2);
  const tableProductSelect = page.locator('#scene-editor-table-edit-layer [data-preview-product-select]').first();
  await expect(tableProductSelect).toBeVisible();
  await expect(tableProductSelect).toHaveAttribute('role', 'combobox');
  expect(parseFloat(await tableProductSelect.evaluate((node) => getComputedStyle(node).fontSize))).toBeLessThanOrEqual(10);
  await expect(page.locator('#scene-editor-table-edit-layer select[data-preview-product-select]')).toHaveCount(0);
  await tableProductSelect.click();
  await expect(page.locator('#scene-editor-table-edit-layer .editor-preview-choice-popup')).toBeVisible();
  const productSearch = page.locator('#scene-editor-table-edit-layer .editor-preview-choice-search');
  await expect(productSearch).toBeFocused();
  await productSearch.fill(product.name);
  await expect(page.locator('#scene-editor-table-edit-layer [role="option"]')).toHaveCount(1);
  await expect(page.locator('#scene-editor-table-edit-layer [role="option"]').first()).toContainText(product.name);
  await productSearch.press('Escape');
  await expect(page.locator('#scene-editor-table-edit-layer .editor-preview-choice-popup')).toBeHidden();

  await page.locator('#scene-editor-background-layer').click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Фон');
  await expect(page.locator('#scene-editor-properties').getByLabel('Цвет фона')).toHaveValue('#101828');
  await expect(page.locator('#scene-editor-properties').getByLabel('Фоновое изображение')).toBeVisible();

  await page.locator('#scene-editor-table-layer').click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Таблица меню');
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeVisible();

  const geometry = await page.evaluate(() => ({
    documentClient:document.documentElement.clientHeight,
    documentScroll:document.documentElement.scrollHeight,
    layersClient:document.querySelector('.scene-editor-layers-panel')?.clientHeight || 0,
    layersScroll:document.querySelector('.scene-editor-layers-panel')?.scrollHeight || 0,
    propertiesClient:document.querySelector('.scene-editor-properties-panel')?.clientHeight || 0,
    propertiesScroll:document.querySelector('.scene-editor-properties-panel')?.scrollHeight || 0,
    propertiesWidth:document.querySelector('.scene-editor-properties-panel')?.getBoundingClientRect().width || 0
  }));
  expect(geometry.documentScroll).toBeLessThanOrEqual(geometry.documentClient + 2);
  expect(geometry.layersScroll).toBeLessThanOrEqual(geometry.layersClient + 2);
  expect(geometry.propertiesScroll).toBeLessThanOrEqual(geometry.propertiesClient + 2);
  expect(geometry.propertiesWidth).toBeGreaterThanOrEqual(275);
  expect(geometry.propertiesWidth).toBeLessThanOrEqual(300);

  const shellBox = await page.locator('#scene-editor-stage-shell').boundingBox();
  expect(shellBox).not.toBeNull();
  const areaShare = (shellBox.width * shellBox.height) / (1600 * 900);
  expect(areaShare).toBeGreaterThan(.25);
  expect(areaShare).toBeLessThan(.55);

  await page.locator('#scene-editor-add').click();
  const addMenu = page.locator('#scene-editor-add-menu');
  await expect(addMenu).toBeVisible();
  await expect(addMenu.getByRole('menuitem')).toHaveCount(5);
  await addMenu.getByRole('menuitem', { name:/Текстовое поле/ }).click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(1);
  await expect(page.locator('.scene-editor-selection-box')).toHaveCount(1);
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Элемент 1');
  await expect(page.locator('#scene-editor-properties-kind')).toHaveText('T');
  await expect(page.locator('#scene-editor-properties-kind')).toHaveAttribute('aria-label', 'Текстовое поле');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="text"]')).toHaveCount(1);

  const inspector = page.locator('#scene-editor-properties');
  await inspector.getByLabel('Текст', { exact:true }).fill('бар маяк');
  await inspector.getByLabel('X', { exact:true }).fill('300');
  await inspector.getByLabel('Y', { exact:true }).fill('160');
  await inspector.getByText('Шрифт и абзац', { exact:true }).click();
  await inspector.getByLabel('Размер, px', { exact:true }).fill('96');
  await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Не сохранено');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="text"]')).toContainText('бар маяк');
  await expect(page.locator('#scene-editor-undo')).toBeEnabled();

  const seHandle = page.locator('.scene-editor-resize-handle[data-direction="se"]');
  await expect(seHandle).toBeVisible();
  await expect(page.locator('.scene-editor-resize-handle')).toHaveCount(8);
  const handleBox = await seHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 34, handleBox.y + 20);
  await page.mouse.up();
  expect(Number(await inspector.getByLabel('Ширина', { exact:true }).inputValue())).toBeGreaterThan(720);
  expect(Number(await inspector.getByLabel('Высота', { exact:true }).inputValue())).toBeGreaterThan(220);

  await page.locator('#scene-editor-add').click();
  await addMenu.getByRole('menuitem', { name:/Погода/ }).click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(2);
  const weatherElement = page.locator('#scene-editor-stage [data-scene-element-type="weather"]');
  const weatherContent = weatherElement.locator('[data-scene-weather-mount]');
  await expect(weatherElement).toHaveCount(1);
  await expect(weatherContent).toHaveCount(1);
  await expect(inspector.locator('summary[aria-label^="Погода:"]')).toBeVisible();
  await expect(inspector.getByLabel('Автомасштаб при resize')).toBeChecked();
  await expect(inspector.getByLabel('Масштаб внутри, %')).toHaveValue('100');

  const city = inspector.getByLabel('Населённый пункт');
  await city.fill('Комсомольск');
  const cityOption = inspector.locator('.editor-weather-location-option', { hasText:'Комсомольск-на-Амуре' });
  await expect(cityOption).toBeVisible();
  await cityOption.click();
  await expect(city).toHaveValue('Комсомольск-на-Амуре');
  await expect(inspector.getByLabel('Широта')).toHaveValue('50.5503');
  await expect(inspector.getByLabel('Долгота')).toHaveValue('137.0079');
  await expect(inspector.getByLabel('Часовой пояс')).toHaveValue('Asia/Vladivostok');
  await expect(weatherContent.locator('.weather-widget-location')).toHaveText('Комсомольск-на-Амуре');
  await expect(weatherContent.locator('.weather-widget-temperature')).toHaveText('-7°');

  await inspector.getByLabel('Ширина', { exact:true }).fill('260');
  await inspector.getByLabel('Высота', { exact:true }).fill('180');

  const resizeScale = await expect.poll(async () => Number(await weatherContent.getAttribute('data-scene-content-scale'))).toBeGreaterThan(0);
  const scaleAt100 = Number(await weatherContent.getAttribute('data-scene-content-scale'));
  const intrinsicFit = Number(await weatherContent.getAttribute('data-scene-intrinsic-fit'));
  expect(intrinsicFit).toBeGreaterThan(0);
  expect(intrinsicFit).toBeLessThanOrEqual(1);
  expect(scaleAt100).toBeLessThanOrEqual(.5);

  const weatherBounds = await weatherElement.boundingBox();
  const widgetBounds = await weatherContent.locator('.weather-widget-content').boundingBox();
  expect(weatherBounds).not.toBeNull();
  expect(widgetBounds).not.toBeNull();
  expect(widgetBounds.left).toBeGreaterThanOrEqual(weatherBounds.left - 2);
  expect(widgetBounds.top).toBeGreaterThanOrEqual(weatherBounds.top - 2);
  expect(widgetBounds.right).toBeLessThanOrEqual(weatherBounds.right + 2);
  expect(widgetBounds.bottom).toBeLessThanOrEqual(weatherBounds.bottom + 2);

  await inspector.getByLabel('Масштаб внутри, %').fill('80');
  await expect.poll(async () => Number(await weatherContent.getAttribute('data-scene-content-scale'))).toBeLessThan(scaleAt100);
  const scaleAt80 = Number(await weatherContent.getAttribute('data-scene-content-scale'));
  expect(scaleAt80 / scaleAt100).toBeCloseTo(.8, 1);

  await inspector.getByLabel('Автомасштаб при resize').uncheck();
  await expect.poll(async () => Number(await weatherContent.getAttribute('data-scene-content-scale'))).toBeGreaterThan(scaleAt80);

  await page.locator('#scene-editor-add').click();
  await expect(addMenu.getByRole('menuitem', { name:/Погода/ })).toBeDisabled();
  await addMenu.getByRole('menuitem', { name:/Логотип/ }).click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(3);
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="logo"]')).toHaveCount(1);

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
  await expect(page.locator('#editor-background-file')).toHaveCount(0);
  await expect(page.locator('#editor-table-x')).toHaveCount(0);
  await expect(page.locator('#editor-menu-preview [data-editor-preview-row-control]')).toHaveCount(0);
  await expect(page.locator('#editor-menu-preview [data-scene-elements-layer]')).toHaveCount(1);
  await expect(page.locator('#editor-menu-preview [data-scene-element-type]')).toHaveCount(3);
  await expect(page.locator('#editor-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
  await expect(page.locator('#editor-preview-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
});

test('Scene editor stays a single-page touch workspace on mobile', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await login(page);
  const { screen } = await fixture(page);
  await page.goto(`/scene?screen=${screen.id}`);

  await expect(page.locator('.scene-editor-mobile-toolbar')).toBeVisible();
  const size = await page.evaluate(() => ({
    clientHeight:document.documentElement.clientHeight,
    scrollHeight:document.documentElement.scrollHeight,
    clientWidth:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth
  }));
  expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight + 2);
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 2);

  await page.getByRole('button', { name:/Слои/ }).click();
  await expect(page.locator('.scene-editor-layers-panel')).toBeVisible();
  await page.locator('#scene-editor-table-layer').click();
  await expect(page.locator('.scene-editor-properties-panel')).toBeVisible();

  await page.locator('.scene-editor-mobile-toolbar').getByRole('button', { name:/Элемент/ }).click();
  await expect(page.locator('#scene-editor-add-menu')).toBeVisible();
  await page.locator('#scene-editor-add-menu').getByRole('menuitem', { name:/Текстовое поле/ }).click();
  await expect(page.locator('.scene-editor-selection-box')).toHaveCount(1);
  await expect(page.locator('.scene-editor-resize-handle')).toHaveCount(8);
});
