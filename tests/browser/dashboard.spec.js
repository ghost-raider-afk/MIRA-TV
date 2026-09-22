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

test('Dashboard is reached from the logo and switches per-TV reporting periods', async ({ page }) => {
  await login(page);

  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await expect(page).toHaveTitle(/ — Дашборд$/);
  await expect(page.locator('.dashboard-commandbar h1')).toHaveText('Дашборд');
  await expect(page.locator('[data-dashboard-card]')).toHaveCount(4);
  await expect(page.locator('[data-dashboard-tv-select]')).toBeVisible();
  await expect(page.locator('.ui-context')).toBeHidden();
  await expect(page.locator('.ui-rail-button[aria-label="Дашборд"]')).toHaveCount(0);

  const requestedRanges = [];
  const requestedScreens = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/overview')) return;
    const url = new URL(request.url());
    requestedRanges.push(url.searchParams.get('range'));
    requestedScreens.push(url.searchParams.get('screen_id'));
  });

  for (const range of ['24h','7d','30d','1h']) {
    await page.locator(`[data-dashboard-range="${range}"]`).click();
    await expect(page.locator(`[data-dashboard-range="${range}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => requestedRanges.includes(range)).toBe(true);
  }

  const snapshot = await page.evaluate(async () => {
    const response = await fetch('/api/overview?range=1h', { credentials:'same-origin', cache:'no-store' });
    if (!response.ok) throw new Error(`overview HTTP ${response.status}`);
    return response.json();
  });

  expect(Array.isArray(snapshot.tvs)).toBe(true);
  expect(Array.isArray(snapshot.problems)).toBe(true);
  expect(snapshot.problems.every((item) => Boolean(item.problem_code))).toBe(true);
  expect(snapshot.telemetry.expected_first_sample_seconds).toBe(10);

  if (snapshot.tvs.length) {
    const target = snapshot.tvs.at(-1);
    await page.locator('[data-dashboard-tv-select]').selectOption(String(target.screen_id));
    await expect.poll(() => requestedScreens.includes(String(target.screen_id))).toBe(true);
  }

  await page.locator('.ui-rail-button[aria-label="TV-сеть"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await page.locator('.ui-rail-brand').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.dashboard-commandbar')).toBeVisible();
  await expect(page.locator('.ui-context')).toBeHidden();
});
