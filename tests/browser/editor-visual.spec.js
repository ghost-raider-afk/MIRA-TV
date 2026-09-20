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
  test(`monitor settings stay compact and preview-only at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const { screen } = await createEditorFixture(page, { rows: 4 });
    await page.goto(`/screen-editor?id=${screen.id}`);

    const commandbar = page.locator('.editor-commandbar');
    await expect(commandbar).toBeVisible();
    expect((await commandbar.boundingBox())?.height).toBeLessThanOrEqual(60);
    await expect(page.locator('.editor-settings-panel')).toBeVisible();
    await expect(page.locator('.editor-main-column')).toBeVisible();
    await expect(page.locator('.editor-settings-section').filter({ hasText:'Монитор' })).toHaveCount(1);
    await expect(page.locator('.editor-settings-section').filter({ hasText:'Таблица' })).toHaveCount(0);
    await expect(page.locator('.editor-settings-section').filter({ hasText:'Оформление' })).toHaveCount(0);
    await expect(page.locator('#editor-background-file')).toHaveCount(0);
    await expect(page.locator('#editor-table-x')).toHaveCount(0);

    const preview = page.locator('#editor-menu-preview');
    await expect(preview.locator('[data-editor-preview-row-control]')).toHaveCount(0);
    await expect(preview.locator('svg.menu-table-svg')).toBeVisible();
    await expect(preview.locator('svg.menu-table-svg')).toHaveAttribute('viewBox', '0 0 1920 1080');
    await expect(page.locator('#editor-preview-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
  });
}

test('monitor settings reflow without page-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor?id=${screen.id}`);

  const overflow = await page.evaluate(() => ({
    client:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
  await expect(page.locator('.editor-settings-panel')).toBeVisible();
  await expect(page.locator('#editor-menu-preview [data-editor-preview-row-control]')).toHaveCount(0);
});

test('reference density keeps MIRA-TV 1 two-line typography without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const { screen } = await createReferenceDensityFixture(page);
  await page.goto(`/screen-editor?id=${screen.id}`);
  const preview = page.locator('#editor-menu-preview');
  const svg = preview.locator('svg.menu-table-svg');
  await expect(svg.locator('.table-section')).toHaveCount(3);
  await expect(svg.locator('.table-item')).toHaveCount(16);
  const effective = Number(await preview.getAttribute('data-font-scale-effective'));
  expect(effective).toBeGreaterThan(90);
  expect(effective).toBeLessThanOrEqual(100);
  const overlaps = await svg.locator('.table-item').evaluateAll((items) => items.map((item) => {
    const title = item.querySelector('.item-name')?.getBBox();
    const meta = item.querySelector('.item-meta')?.getBBox();
    return title && meta ? title.y + title.height > meta.y + 1 : false;
  }));
  expect(overlaps.some(Boolean)).toBe(false);
});

test('monitor settings do not own visual Scene controls', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor?id=${screen.id}`);

  await expect(page.locator('#editor-table-x')).toHaveCount(0);
  await expect(page.locator('#editor-font-family')).toHaveCount(0);
  await expect(page.locator('#editor-background-file')).toHaveCount(0);
  await expect(page.locator('#editor-add-section')).toHaveCount(0);
  await expect(page.locator('#editor-menu-preview [data-editor-preview-row-control]')).toHaveCount(0);
  await expect(page.locator('#editor-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
});

test('screen properties update preview and keep the editor dirty until save', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor?id=${screen.id}`);
  await openSettings(page, 'Монитор');
  const resolution = page.locator('#editor-resolution');
  await resolution.fill('1024×768');
  await expect(page.locator('#editor-dirty-state')).toHaveText('Не сохранено');
  await expect(page.locator('#editor-publish')).toHaveCount(0);
  const aspect = await page.locator('#editor-menu-preview').evaluate((node) => getComputedStyle(node).aspectRatio);
  expect(aspect.replace(/\s+/g, '')).toBe('1024/768');
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

test('monitor editor stays table-only and links to the dedicated Scene editor', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 2 });
  await page.goto(`/screen-editor?id=${screen.id}`);

  const preview = page.locator('#editor-menu-preview');
  await expect(page.locator('#editor-elements-stack')).toHaveCount(0);
  await expect(page.locator('#editor-add-element')).toHaveCount(0);
  await expect(page.locator('.editor-settings-section').filter({ hasText: 'Элементы' })).toHaveCount(0);
  await expect(preview.locator('[data-scene-elements-layer]')).toHaveCount(0);
  await expect(preview.locator('[data-scene-element-type]')).toHaveCount(0);
  await expect(page.locator('#editor-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
});
