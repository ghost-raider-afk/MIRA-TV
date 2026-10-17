import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

async function createProduct(page, name, primary, secondary) {
  const response = await page.request.post('/api/catalog/products', {
    data:{
      name,
      producer:'Browser E2E',
      characteristics:'светлое',
      strength:'4,5',
      price_primary:primary,
      price_secondary:secondary,
      alcoholic:true,
      beverage_color:'light',
      filtration:'filtered',
      active:true
    }
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test('readable table style renders two section columns and can switch back to legacy', async ({ page }) => {
  await login(page);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const locationResponse = await page.request.post('/api/locations', {
    data:{ name:`Readable menu ${stamp}`, address:'Browser regression' }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const [leftProduct, rightProduct] = await Promise.all([
    createProduct(page, `АЛТУНИН ${stamp}`, '268', '402'),
    createProduct(page, `БАВАРИЯ ${stamp}`, '187', '280')
  ]);

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const initial = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  expect(initial.draft.settings.table_style).toBe('readable');

  const save = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data:{
      revision:initial.draft.revision,
      rows:[
        { id:`section-a-${stamp}`, kind:'section', name:'ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ', enabled:true },
        { id:`item-a-${stamp}`, kind:'item', product_id:leftProduct.id, enabled:true },
        { id:`section-b-${stamp}`, kind:'section', name:'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled:true },
        { id:`item-b-${stamp}`, kind:'item', product_id:rightProduct.id, enabled:true }
      ],
      settings:{
        ...initial.draft.settings,
        table_style:'readable',
        table_x:40,
        table_y:30,
        table_width_px:1500,
        table_height_px:900
      },
      scene:initial.draft.scene
    }
  });
  expect(save.status()).toBe(200);

  await page.goto(`/scene?screen=${screen.id}`);
  const stage = page.locator('#scene-editor-stage');
  await expect(stage.locator('.readable-table-surfaces rect')).toHaveCount(2);
  await expect(stage.locator('.section-title')).toHaveCount(2);
  await expect(stage.locator('.price-label', { hasText:'1 л' })).toHaveCount(2);
  await expect(stage.locator('.price-label', { hasText:'1,5 л' })).toHaveCount(0);

  const sectionXs = await stage.locator('.section-title').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('x'))));
  expect(sectionXs[1]).toBeGreaterThan(sectionXs[0] + 500);

  const firstItem = stage.locator('.table-item').first();
  const itemName = firstItem.locator('.item-name');
  const itemMeta = firstItem.locator('.item-meta');
  const prices = firstItem.locator('.table-item-prices .price');
  expect(Number(await itemName.getAttribute('font-size'))).toBeGreaterThan(27);
  const itemNameFill = (await itemName.getAttribute('fill'))?.toUpperCase();
  expect(itemNameFill).toBe('#F8FAFC');
  expect((await itemMeta.getAttribute('fill'))?.toUpperCase()).toBe('#C5CBD2');
  expect((await prices.nth(0).getAttribute('fill'))?.toUpperCase()).toBe(itemNameFill);
  await expect(prices).toHaveCount(1);

  await page.locator('#scene-editor-table-layer').click();
  await page.getByRole('button', { name:'Редактировать содержимое', exact:true }).click();
  const styleSelect = page.getByLabel('Стиль таблицы');
  await expect(styleSelect).toHaveValue('readable');

  await styleSelect.selectOption('legacy');
  await expect(stage.locator('.readable-table-surfaces')).toHaveCount(0);
  await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Не сохранено');

  await styleSelect.selectOption('readable');
  await expect(stage.locator('.readable-table-surfaces rect')).toHaveCount(2);
});

test('authorized TV Player fits the visual viewport and makes one automatic legacy-compatible fullscreen request', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const tvContext = await browser.newContext({
    baseURL,
    viewport:{ width:1280, height:720 },
    serviceWorkers:'block'
  });
  const adminPage = await adminContext.newPage();
  const tvPage = await tvContext.newPage();

  await tvPage.addInitScript(() => {
    window.__miraFullscreenCalls = [];
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable:true,
      value(...args) {
        window.__miraFullscreenCalls.push(args.length);
        return Promise.resolve();
      }
    });
  });

  try {
    await login(adminPage);
    const stamp = Date.now();
    const locationResponse = await adminPage.request.post('/api/locations', {
      data:{ name:`Fullscreen ${stamp}`, address:'Browser regression' }
    });
    expect(locationResponse.status()).toBe(201);
    const location = await locationResponse.json();

    const screenResponse = await adminPage.request.post(`/api/locations/${location.id}/screens`, { data:{} });
    expect(screenResponse.status()).toBe(201);
    const screen = await screenResponse.json();

    const activationResponse = await tvPage.request.post('/api/device/activations', {
      data:{ device_key:`mira-fullscreen-e2e-${stamp}` }
    });
    expect(activationResponse.ok()).toBeTruthy();
    const activation = await activationResponse.json();

    const authorizeResponse = await adminPage.request.post('/api/device-admin/authorize', {
      data:{ activation_id:activation.activation_id, screen_id:screen.id }
    });
    expect(authorizeResponse.ok()).toBeTruthy();

    const pollResponse = await tvPage.request.get(`/api/device/activations/${activation.activation_id}/status`, {
      headers:{ 'x-device-activation-secret':activation.poll_secret }
    });
    expect(pollResponse.ok()).toBeTruthy();
    expect((await pollResponse.json()).status).toBe('authorized');

    await tvPage.goto('/player');
    const player = tvPage.locator('[data-tv-player]');
    await expect(player).toBeVisible({ timeout:5000 });
    await expect(tvPage.locator('[data-player-boot]')).toBeHidden({ timeout:5000 });

    const rootBox = await tvPage.locator('.player-root').boundingBox();
    expect(rootBox).not.toBeNull();
    expect(Math.abs(rootBox.width - 1280)).toBeLessThanOrEqual(1);
    expect(Math.abs(rootBox.height - 720)).toBeLessThanOrEqual(1);

    await expect.poll(() => tvPage.evaluate(() => window.__miraFullscreenCalls.length)).toBe(1);
    expect(await tvPage.evaluate(() => window.__miraFullscreenCalls[0])).toBe(0);
    await tvPage.waitForTimeout(250);
    expect(await tvPage.evaluate(() => window.__miraFullscreenCalls.length)).toBe(1);
  } finally {
    await Promise.allSettled([adminContext.close(), tvContext.close()]);
  }
});
