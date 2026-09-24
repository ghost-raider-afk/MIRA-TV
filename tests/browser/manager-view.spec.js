import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!';

async function login(page, username, password, expectedPath) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === expectedPath),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function createScreen(adminPage, locationId) {
  const response = await adminPage.request.post(`/api/locations/${locationId}/screens`, { data: {} });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function publishScreen(adminPage, screen) {
  const editorResponse = await adminPage.request.get(`/api/screens/${screen.id}/editor`);
  expect(editorResponse.ok()).toBeTruthy();
  const editor = await editorResponse.json();
  const response = await adminPage.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: editor.draft.rows,
      settings: editor.draft.settings,
      screen: {
        location_id: screen.location_id,
        name: screen.name,
        resolution: screen.resolution,
        status: 'published',
        active: true
      }
    }
  });
  expect(response.ok()).toBeTruthy();
  const saved = await response.json();
  expect(saved.screen.status).toBe('published');
  return saved.screen;
}

test('manager uses the common sign-in and can inspect every saved active screen without edit access', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL });
  const managerContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const adminPage = await adminContext.newPage();
  const managerPage = await managerContext.newPage();

  const stamp = Date.now();
  const managerUsername = `manager-${stamp}`;
  const initialPassword = 'Manager-Create1!';
  const managerPassword = 'Manager-View2!';
  let locationId = null;
  const screenIds = [];

  try {
    await login(adminPage, 'admin', adminPassword, '/');

    const locationResponse = await adminPage.request.post('/api/locations', {
      data: { name: `Manager View ${stamp}`, address: 'Контрольная точка', active: true }
    });
    expect(locationResponse.ok()).toBeTruthy();
    const location = await locationResponse.json();
    locationId = location.id;

    const published = await createScreen(adminPage, locationId);
    screenIds.push(published.id);
    const draft = await createScreen(adminPage, locationId);
    screenIds.push(draft.id);
    await publishScreen(adminPage, published);

    await adminPage.goto('/settings');
    await expect(adminPage.locator('#manager-create-form')).toBeVisible();
    await adminPage.locator('#manager-create-username').fill(managerUsername);
    await adminPage.locator('#manager-create-password').fill(initialPassword);
    await adminPage.locator('#manager-create-submit').click();

    const managerRow = adminPage.locator(`[data-manager-username="${managerUsername}"]`);
    await expect(managerRow).toBeVisible();
    await managerRow.getByLabel(`Новый пароль менеджера ${managerUsername}`).fill(managerPassword);
    await managerRow.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(adminPage.locator('#manager-settings-message')).toContainText('Активные сессии завершены');

    await login(managerPage, managerUsername, managerPassword, '/manager');

    await expect(managerPage.locator('.ui-rail')).toHaveCount(0);
    await expect(managerPage.locator('.ui-context')).toHaveCount(0);
    await expect(managerPage.locator('#manager-locations')).toContainText(location.name);

    const cards = managerPage.locator('[data-manager-screen-id]');
    await expect(cards).toHaveCount(2);
    await expect(managerPage.locator(`[data-manager-screen-id="${published.id}"]`)).toContainText(published.name);
    await expect(managerPage.locator(`[data-manager-screen-id="${draft.id}"]`)).toContainText(draft.name);
    await expect(managerPage.locator(`[data-manager-screen-id="${published.id}"] svg.menu-table-svg`)).toHaveCount(1, { timeout: 5000 });
    await expect(managerPage.locator(`[data-manager-screen-id="${draft.id}"] svg.menu-table-svg`)).toHaveCount(1, { timeout: 5000 });

    const forbiddenScreens = await managerPage.request.get('/api/screens');
    expect(forbiddenScreens.status()).toBe(403);
    const forbiddenWrite = await managerPage.request.post('/api/locations', {
      data: { name: 'Forbidden manager write', address: '', active: true }
    });
    expect(forbiddenWrite.status()).toBe(403);
    const savedDraft = await managerPage.request.get(`/api/manager/screens/${draft.id}/context`);
    expect(savedDraft.status()).toBe(200);
    const draftContext = await savedDraft.json();
    expect(draftContext.screen.id).toBe(draft.id);
    expect(draftContext.screen.status).toBe('draft');

    await managerPage.goto('/settings');
    await expect(managerPage).toHaveURL(/\/manager$/);
    await expect(managerPage.locator('#manager-create-form')).toHaveCount(0);

    await managerPage.locator(`[data-manager-screen-id="${draft.id}"]`).click();
    const fullscreen = managerPage.locator('#manager-fullscreen');
    await expect(fullscreen).not.toHaveClass(/is-hidden/);
    await expect(managerPage.locator('#manager-fullscreen-stage svg.menu-table-svg')).toHaveCount(1, { timeout: 5000 });
    await expect(managerPage.locator('#manager-fullscreen-title')).toHaveText(draft.name);
  } finally {
    await managerContext.close();
    if (adminPage.isClosed() === false) {
      await adminPage.request.delete(`/api/admin/managers/${encodeURIComponent(managerUsername)}`).catch(() => undefined);
      for (const id of screenIds) await adminPage.request.delete(`/api/screens/${id}`).catch(() => undefined);
      if (locationId) await adminPage.request.delete(`/api/locations/${locationId}`).catch(() => undefined);
    }
    await adminContext.close();
  }
});
