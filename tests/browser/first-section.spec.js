import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

test('first section is a real editable row and never inherits the monitor name', async ({ page }) => {
  await login(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const monitorName = `МОНИТОР ${suffix}`;

  const locationResponse = await page.request.post('/api/locations', {
    data: { name: `Точка ${suffix}`, address: 'Browser regression' }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const productResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: `СНЕЖНЫЙ ЭЛЬ ${suffix}`,
      producer: 'ООО «Тест»',
      characteristics: 'светлое фильтрованное',
      strength: '4,5',
      price_primary: '500',
      price_secondary: '750',
      alcoholic: true,
      beverage_color: 'light',
      filtration: 'filtered',
      active: true
    }
  });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editorResponse = await page.request.get(`/api/screens/${screen.id}/editor`);
  expect(editorResponse.status()).toBe(200);
  const editor = await editorResponse.json();

  const saveLegacyShape = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: [{ id: `item-${suffix}`, kind: 'item', product_id: product.id, enabled: true }],
      settings: {
        background_color: '#101828',
        accent_color: '#F6C90E',
        text_color: '#F8FAFC',
        font_scale_percent: 100,
        font_family: 'arial-narrow',
        table_x: 56,
        table_y: 15,
        table_width_px: 1374,
        table_height_px: 925
      },
      screen: {
        location_id: screen.location_id,
        name: monitorName,
        resolution: '1920×1080',
        status: 'draft',
        active: true
      }
    }
  });
  expect(saveLegacyShape.status()).toBe(200);

  await page.goto(`/screen-editor.html?id=${screen.id}`);

  const firstRow = page.locator('.editor-menu-editor-table tbody tr').first();
  await expect(firstRow).toHaveClass(/editor-menu-table-section/);
  await expect(firstRow).toHaveClass(/is-pinned-section/);
  const sectionName = firstRow.locator('input.editor-section-name');
  await expect(sectionName).toHaveValue('Новый раздел');
  await expect(firstRow).toContainText('1 л');
  await expect(firstRow).toContainText('1,5 л');
  await expect(firstRow.getByRole('button', { name: 'Переместить выше' })).toBeDisabled();
  await expect(firstRow.getByRole('button', { name: 'Удалить строку' })).toBeDisabled();
  await expect(page.locator('#editor-dirty-state')).toHaveText('Не сохранено');

  const preview = page.locator('#editor-menu-preview');
  await expect(preview.locator('.section-title').first()).toHaveText('Новый раздел');
  await expect(preview.locator('.section-title', { hasText: monitorName })).toHaveCount(0);

  await sectionName.fill('ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ');
  await expect(preview.locator('.section-title').first()).toHaveText('ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ');
  await expect(preview.locator('.price-label')).toHaveCount(2);

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#screen-editor-message')).toContainText('Сохранено');

  const persisted = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  expect(persisted.draft.rows[0]).toMatchObject({ kind: 'section', name: 'ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ', enabled: true });
});
