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

  await page.locator('.app-header-nav-link[data-header-section="monitors"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await page.locator('.app-header-home').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.dashboard-commandbar')).toBeVisible();
  await expect(page.locator('.ui-context')).toBeHidden();
});


test('Dashboard collapses four empty graphs into one telemetry state and restores charts when data arrives', async ({ page }) => {
  let withTelemetry = false;
  const tv = {
    screen_id:77,
    screen_name:'Тестовый TV',
    label:'TV 1',
    location_id:7,
    location_name:'Тестовая точка',
    location_number:1,
    bound:true,
    device_id:700,
    online:true,
    problem_code:'telemetry_missing',
    problem_label:'Телеметрия ещё не получена',
    last_seen_at:new Date().toISOString(),
    last_metric_at:null,
    latest_metric:null
  };

  await page.route('**/api/overview**', async (route) => {
    const now = Date.now();
    const points = withTelemetry ? [
      { at:new Date(now - 60000).toISOString(), fps_avg:59.4, player_load_percent:4.2, memory_mb:96, uptime_hours:1.2 },
      { at:new Date(now).toISOString(), fps_avg:60, player_load_percent:3.8, memory_mb:98, uptime_hours:1.22 }
    ] : [];
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        generated_at:new Date(now).toISOString(),
        range:'1h',
        summary:{ locations:1, screens:1, published:0, bound:1, online:1, offline:0, unbound:0, problems:withTelemetry ? 0 : 1 },
        telemetry:{ sample_interval_seconds:60, expected_first_sample_seconds:10, retention_days:31, stale_after_seconds:150 },
        tvs:[{ ...tv, problem_code:withTelemetry ? null : tv.problem_code, problem_label:withTelemetry ? null : tv.problem_label, last_metric_at:withTelemetry ? new Date(now).toISOString() : null }],
        problems:withTelemetry ? [] : [tv],
        selected_tv:{ ...tv, problem_code:withTelemetry ? null : tv.problem_code, problem_label:withTelemetry ? null : tv.problem_label, last_metric_at:withTelemetry ? new Date(now).toISOString() : null },
        player_metrics:{ screen_id:77, points }
      })
    });
  });

  await login(page);
  const empty = page.locator('[data-dashboard-charts-empty]');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('Первый замер обычно появляется примерно через 10 секунд');
  await expect(page.locator('[data-dashboard-card]:visible')).toHaveCount(0);
  const emptyBox = await empty.boundingBox();
  expect(emptyBox?.height).toBeLessThanOrEqual(100);

  withTelemetry = true;
  await page.locator('[data-dashboard-range="24h"]').click();
  await expect(empty).toBeHidden();
  await expect(page.locator('[data-dashboard-card]:visible')).toHaveCount(4);
  await expect(page.locator('.dashboard-sparkline')).toHaveCount(4);
});
