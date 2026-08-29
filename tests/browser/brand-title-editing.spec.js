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

async function getSettings(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/animation', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`GET playlist settings failed: ${response.status}`);
    return response.json();
  });
}

async function putSettings(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/settings/animation', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`PUT playlist settings failed: ${response.status}`);
    return response.json();
  }, payload);
}

async function createPreviewScreen(page) {
  return page.evaluate(async () => {
    async function request(url, init = {}) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        ...init
      });
      if (!response.ok) throw new Error(`${init.method || 'GET'} ${url} failed: ${response.status}`);
      return response.status === 204 ? null : response.json();
    }
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const location = await request('/api/locations', {
      method: 'POST', body: JSON.stringify({ name: `Brand multiline ${suffix}`, address: '', active: true })
    });
    const screen = await request(`/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
    return { locationId: location.id, screenId: screen.id };
  });
}

async function removePreviewScreen(page, fixture) {
  await page.evaluate(async ({ screenId, locationId }) => {
    await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
  }, fixture);
}

test('Brand Entity is user-owned inside Playlist Studio and persists independently of MIRA-TV branding', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewScreen(page);
  const original = await getSettings(page);
  try {
    await page.goto(`/playlist.html?screen=${fixture.screenId}`);
    const textTab = page.locator('[data-animation-inspector-tab="text"]');
    await textTab.click();
    await expect(textTab).toHaveClass(/active/);
    const input = page.locator('#animation-brand-text');
    await expect(input).toBeVisible();
    await expect(input).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));

    await input.fill('');
    await expect(input).toHaveValue('');
    await input.fill('БАР\nСЕВЕР');
    await expect(input).toHaveValue('БАР\nСЕВЕР');
    if (!(await page.locator('#animation-brand-enabled').isChecked())) await page.locator('#animation-brand-enabled').check();
    const lines = page.locator('#animation-stage .scene-brand-title-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText('БАР');
    await expect(lines.nth(1)).toHaveText('СЕВЕР');

    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await responsePromise).ok()).toBeTruthy();

    const saved = await getSettings(page);
    expect(saved.brand.text).toBe('БАР\nСЕВЕР');
    expect(saved.brand.enabled).toBe(true);
    await expect(page).toHaveTitle('MIRA-TV — Плейлист');
  } finally {
    await putSettings(page, {
      enabled: original.enabled,
      preset_id: original.preset_id,
      profile: original.profile,
      entity: original.entity,
      announcement: original.announcement,
      brand: original.brand,
      environment: original.environment,
      scene_playlist: original.scene_playlist
    });
    await removePreviewScreen(page, fixture);
  }
});
