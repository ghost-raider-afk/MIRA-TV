import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || '');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

test('weather studio keeps atmosphere full-scene while widget remains movable and transparent', async ({ page }) => {
  await login(page);
  await page.goto('/playlist');

  const sceneTab = page.locator('[data-animation-inspector-tab="scene"]');
  await expect(sceneTab).toBeVisible();
  await sceneTab.click();

  await expect(page.getByRole('heading', { name: 'Погода', exact: true })).toBeVisible();
  await expect(page.locator('#weather-scale')).toBeVisible();
  await expect(page.locator('#weather-x')).toBeVisible();
  await expect(page.locator('#weather-y')).toBeVisible();

  const enabled = page.locator('#weather-enabled');
  if (!(await enabled.isChecked())) await enabled.check();

  const stage = page.locator('#animation-stage');
  const layer = stage.locator('[data-weather-layer]');
  const atmosphere = layer.locator(':scope > .weather-atmosphere');
  const widget = layer.locator(':scope > .weather-widget');

  await expect(atmosphere).toBeVisible();
  await expect(widget).toBeVisible();
  await expect(widget.locator('.weather-atmosphere')).toHaveCount(0);
  await expect(layer).toHaveAttribute('data-weather-state', /rain|drizzle|storm|snow|fog|cloudy|partly-cloudy|clear/);

  const [stageClient, atmosphereBox] = await Promise.all([
    stage.evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight })),
    atmosphere.boundingBox()
  ]);
  expect(atmosphereBox).not.toBeNull();
  expect(Math.abs(atmosphereBox.width - stageClient.width)).toBeLessThan(1);
  expect(Math.abs(atmosphereBox.height - stageClient.height)).toBeLessThan(1);

  await page.locator('#weather-scale').fill('1.65');
  await page.locator('#weather-x').fill('640');
  await page.locator('#weather-y').fill('300');
  await expect(page.locator('#weather-scale-output')).toHaveText('1.65×');
  await expect(widget).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const transform = await widget.evaluate((node) => getComputedStyle(node).transform);
  expect(transform).not.toBe('none');
  expect(await atmosphere.evaluate((node) => node.getAnimations().length)).toBeGreaterThanOrEqual(0);
});

test('weather assignment changes only the selected monitor', async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  let locationId = null;

  try {
    const locationResponse = await page.request.post('/api/locations', {
      data: { name: `Weather target ${stamp}`, address: '', active: true }
    });
    expect(locationResponse.ok()).toBeTruthy();
    const location = await locationResponse.json();
    locationId = location.id;

    const firstResponse = await page.request.post(`/api/locations/${locationId}/screens`, { data: {} });
    const secondResponse = await page.request.post(`/api/locations/${locationId}/screens`, { data: {} });
    expect(firstResponse.ok()).toBeTruthy();
    expect(secondResponse.ok()).toBeTruthy();
    const first = await firstResponse.json();
    const second = await secondResponse.json();

    const applyResponse = await page.request.put('/api/weather/apply', {
      data: {
        screen_ids: [first.id],
        settings: {
          enabled: true,
          location_name: 'Test City',
          latitude: 0,
          longitude: 0,
          timezone: 'UTC',
          x: 640,
          y: 310,
          scale: 1.35
        }
      }
    });
    expect(applyResponse.ok()).toBeTruthy();

    const firstStored = await (await page.request.get(`/api/weather/screens/${first.id}`)).json();
    const secondStored = await (await page.request.get(`/api/weather/screens/${second.id}`)).json();
    expect(firstStored.enabled).toBe(true);
    expect(firstStored.x).toBe(640);
    expect(secondStored.enabled).toBe(false);

    await page.goto(`/playlist?screen=${first.id}`);
    const sceneTab = page.locator('[data-animation-inspector-tab="scene"]');
    await expect(sceneTab).toBeVisible();
    await sceneTab.click();

    const firstTarget = page.locator(`#weather-target-list input[value="${first.id}"]`);
    const secondTarget = page.locator(`#weather-target-list input[value="${second.id}"]`);
    await expect(firstTarget).toBeChecked();
    await expect(secondTarget).not.toBeChecked();

    await page.locator('#weather-load-target').click();
    await expect(page.locator('#weather-enabled')).toBeChecked();
    await expect(page.locator('#weather-x')).toHaveValue('640');
    await expect(page.locator('#weather-y')).toHaveValue('310');
    await expect(page.locator('#weather-scale')).toHaveValue('1.35');

    await page.locator('#weather-x').fill('700');
    await page.locator('#weather-apply').click();

    await expect.poll(async () => {
      const response = await page.request.get(`/api/weather/screens/${first.id}`);
      return (await response.json()).x;
    }).toBe(700);
    const untouched = await (await page.request.get(`/api/weather/screens/${second.id}`)).json();
    expect(untouched.enabled).toBe(false);
    expect(untouched.x).not.toBe(700);
  } finally {
    if (locationId) await page.request.delete(`/api/locations/${locationId}`);
  }
});
