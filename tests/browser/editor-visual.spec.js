import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([page.waitForURL((url) => url.pathname === '/'), page.getByRole('button', { name: /войти/i }).click()]);
}

async function createEditorFixture(page, { rows = 1 } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', { data: { name: `Browser ${suffix}`, address: 'Visual CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();
  const productResponse = await page.request.post('/api/catalog/products', { data: {
    name: `БАВАРИЯ ПШЕНИЧНОЕ ${suffix}`, producer: 'ООО «Портал», п. Солнечный', characteristics: 'Светлое нефильтрованное', strength: '4,6°',
    price_primary: '179', alcoholic: true, beverage_color: 'light', filtration: 'unfiltered', active: true
  } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const draftRows = [{ id: `section-${suffix}`, kind: 'section', name: 'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled: true }];
  for (let index = 0; index < rows; index += 1) draftRows.push({ id: `item-${suffix}-${index}`, kind: 'item', product_id: product.id, enabled: true });
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data: {
    revision: editor.draft.revision,
    rows: draftRows,
    settings: {
      background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow',
      table_x: 56, table_y: 15, table_width_px: 1374, table_height_px: 925
    },
    screen: { location_id: screen.location_id, name: screen.name, resolution: '1920×1080', status: 'draft', active: true }
  } });
  expect(saved.status()).toBe(200);
  return { screen, product };
}

async function createReferenceDensityFixture(page) {
  const { screen, product } = await createEditorFixture(page, { rows: 0 });
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const sections = [['ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', 4], ['ПИВО ТЕМНОЕ ФИЛЬТРОВАННОЕ', 5], ['АЛКОГОЛЬНЫЕ НАПИТКИ', 7]];
  const rows = [];
  let itemIndex = 0;
  sections.forEach(([name, count], sectionIndex) => {
    rows.push({ id: `reference-section-${sectionIndex}`, kind: 'section', name, enabled: true });
    for (let index = 0; index < count; index += 1) rows.push({ id: `reference-item-${itemIndex++}`, kind: 'item', product_id: product.id, enabled: true });
  });
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data: {
    revision: editor.draft.revision, rows,
    settings: { background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow', table_x: 56, table_y: 15, table_width_px: 1374, table_height_px: 925 },
    screen: { location_id: screen.location_id, name: screen.name, resolution: '1920×1080', status: 'draft', active: true }
  } });
  expect(saved.status()).toBe(200);
  return { screen };
}

async function openSettings(page, name) {
  const details = page.locator('.editor-settings-section').filter({ has: page.getByText(name, { exact: true }) });
  await expect(details).toBeVisible();
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  return details;
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`TV management stays compact at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const { screen } = await createEditorFixture(page, { rows: 4 });
    await page.goto(`/screen-editor?id=${screen.id}`);

    await expect(page).toHaveURL(new RegExp(`/screens\\?manage=${screen.id}$`));
    const dialog = page.locator('.screen-tv-management-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.screen-tv-management-section')).toHaveCount(2);
    await expect(dialog.locator('[data-tv-management-device]')).toContainText('IP-адрес');
    await expect(dialog.locator('[data-tv-management-scene]')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
    await expect(page.locator('.editor-commandbar,#editor-menu-preview,#editor-table-x,#editor-background-file')).toHaveCount(0);

    const box = await dialog.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(viewport.width * .95);
    expect(box?.height).toBeLessThanOrEqual(viewport.height * .9);
  });
}

test('TV management reflows without page-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor?id=${screen.id}`);

  await expect(page.locator('.screen-tv-management-dialog')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    client:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
});

test('reference density keeps MIRA-TV 1 two-line typography without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const { screen } = await createReferenceDensityFixture(page);
  await page.goto(`/scene?screen=${screen.id}`);
  const preview = page.locator('#scene-editor-stage');
  const svg = preview.locator('svg.menu-table-svg');
  await expect(svg.locator('.table-section')).toHaveCount(3);
  await expect(svg.locator('.table-item')).toHaveCount(16);
  const effective = Number(await page.locator('#scene-editor-stage').getAttribute('data-font-scale-effective'));
  expect(effective).toBeGreaterThan(90);
  expect(effective).toBeLessThanOrEqual(100);
  const overlaps = await svg.locator('.table-item').evaluateAll((items) => items.map((item) => {
    const title = item.querySelector('.item-name')?.getBBox();
    const meta = item.querySelector('.item-meta')?.getBBox();
    return title && meta ? title.y + title.height > meta.y + 1 : false;
  }));
  expect(overlaps.some(Boolean)).toBe(false);
});

test('TV management does not own visual Scene controls', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor?id=${screen.id}`);

  const dialog = page.locator('.screen-tv-management-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#editor-table-x,#editor-font-family,#editor-background-file,#editor-add-section,#editor-menu-preview')).toHaveCount(0);
  await expect(dialog.locator('[data-tv-management-scene]')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
});

test('screen properties save from TV management without transferring the scene draft', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor?id=${screen.id}`);

  const dialog = page.locator('.screen-tv-management-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-tv-management-resolution]').fill('1024×768');
  await dialog.locator('[data-tv-management-content-status]').selectOption('ready');

  const metadataSave = page.waitForRequest((request) =>
    request.url().endsWith(`/api/screens/${screen.id}`)
      && request.method() === 'PUT'
      && !request.url().endsWith('/draft')
  );
  await dialog.locator('[data-tv-management-save]').click();
  await metadataSave;
  await expect(dialog).not.toBeVisible();

  const saved = await (await page.request.get(`/api/screens/${screen.id}`)).json();
  expect(saved.resolution).toBe('1024×768');
  expect(saved.status).toBe('ready');
});

test('login composition follows MIRA-TV 1 and size 7 is the reference logo scale without flash', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.goto('/settings');
  const size = page.locator('#site-signin-logo-size');
  await expect(size.locator('option')).toHaveCount(7);
  await size.selectOption('7');
  await page.locator('#site-settings-submit').click();
  await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  const logout = await page.request.post('/api/auth/logout');
  expect(logout.status()).toBe(204);
  await page.context().clearCookies();

  await page.route('**/api/public/config', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.locator('html')).toHaveAttribute('data-signin-presentation', 'pending');
  await expect(page.locator('.signin-brand')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('html')).toHaveAttribute('data-signin-presentation', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-signin-logo-size', '7');
  await expect(page.getByText('ПАНЕЛЬ УПРАВЛЕНИЯ', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Введите данные администратора.', { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Логин')).toBeVisible();
  await expect(page.getByPlaceholder('Пароль')).toBeVisible();
  await expect(page.getByText(/Забыли логин или пароль/)).toBeVisible();
  const mark = page.locator('.signin-brand .brand-mark');
  await expect(mark).toHaveCSS('visibility', 'visible');
  const box = await mark.boundingBox();
  expect(Math.round(box.width)).toBe(170);
  expect(Math.round(box.height)).toBe(170);
  expect(await mark.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  const card = await page.locator('.signin-card').boundingBox();
  expect(card.width).toBeLessThanOrEqual(375);
});

test('TV network separates technical management from the read-only TV snapshot', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 2 });
  await page.goto('/screens');

  const unit = page.locator(`[data-tv-unit][data-screen-id="${screen.id}"]`);
  await expect(unit).toBeVisible();
  await expect(unit.locator('[data-tv-meta]')).not.toContainText('IP-адрес');
  await unit.getByRole('button', { name:/Управление/ }).click();
  const management = page.locator('.screen-tv-management-dialog');
  await expect(management.locator('[data-tv-management-device]')).toContainText('IP-адрес');
  await management.locator('[data-tv-management-cancel]').click();

  await unit.locator('.screen-tv-card').click();
  const snapshot = page.locator('.screen-tv-preview-dialog');
  await expect(snapshot).toBeVisible();
  await expect(snapshot).not.toContainText('IP-адрес');
  await expect(page.locator('#editor-background-file,#editor-table-x,#editor-menu-preview')).toHaveCount(0);
});


test('Scene preview keeps one canonical stage inside its responsive shell without ResizeObserver loops', async ({ page }) => {
  await page.addInitScript(() => {
    window.__miraResizeObserverErrors = [];
    window.addEventListener('error', (event) => {
      const message = String(event.message || '');
      if (/ResizeObserver loop/i.test(message)) window.__miraResizeObserverErrors.push(message);
    });
  });
  await page.setViewportSize({ width:1024, height:768 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows:4 });
  await page.goto(`/scene?screen=${screen.id}`);

  const shell = page.locator('#scene-editor-stage-shell');
  const stage = page.locator('#scene-editor-stage');
  await expect(stage).toHaveAttribute('data-scene-viewport-width', '1920');
  await expect(stage).toHaveAttribute('data-scene-viewport-height', '1080');

  const readGeometry = () => page.evaluate(() => {
    const shell = document.querySelector('#scene-editor-stage-shell');
    const stage = document.querySelector('#scene-editor-stage');
    if (!(shell instanceof HTMLElement) || !(stage instanceof HTMLElement)) return null;
    const shellBox = shell.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    return {
      inlineWidth:stage.style.width,
      inlineHeight:stage.style.height,
      scale:Number(stage.dataset.sceneViewportScale),
      shellWidth:shellBox.width,
      shellHeight:shellBox.height,
      stageWidth:stageBox.width,
      stageHeight:stageBox.height
    };
  });

  const geometryIsReady = async () => {
    const geometry = await readGeometry();
    return Boolean(geometry
      && geometry.stageWidth <= geometry.shellWidth + 1
      && geometry.stageHeight <= geometry.shellHeight + 1);
  };

  const assertGeometry = async () => {
    const geometry = await readGeometry();
    expect(geometry).not.toBeNull();
    expect(geometry.inlineWidth).toBe('1920px');
    expect(geometry.inlineHeight).toBe('1080px');
    expect(geometry.scale).toBeGreaterThan(0);
    expect(geometry.scale).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.stageWidth / geometry.stageHeight - (1920 / 1080))).toBeLessThan(.01);
    expect(geometry.stageWidth).toBeLessThanOrEqual(geometry.shellWidth + 1);
    expect(geometry.stageHeight).toBeLessThanOrEqual(geometry.shellHeight + 1);
  };

  await expect.poll(geometryIsReady).toBe(true);
  await assertGeometry();

  await page.setViewportSize({ width:390, height:844 });
  await expect.poll(geometryIsReady).toBe(true);
  await assertGeometry();

  await page.waitForTimeout(250);
  const resizeErrors = await page.evaluate(() => window.__miraResizeObserverErrors || []);
  expect(resizeErrors).toEqual([]);
});
