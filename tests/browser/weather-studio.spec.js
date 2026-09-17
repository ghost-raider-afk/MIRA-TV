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

test('weather studio controls atmosphere motion while keeping the informer visible', async ({ page }) => {
  await login(page);
  await page.goto('/playlist');

  const sceneTab = page.locator('[data-animation-inspector-tab="scene"]');
  await expect(sceneTab).toBeVisible();
  await sceneTab.click();

  await expect(page.getByRole('heading', { name: 'Погода', exact: true })).toBeVisible();
  await expect(page.locator('#weather-animation-enabled')).toBeVisible();
  await expect(page.locator('#weather-animation-speed')).toBeVisible();
  await expect(page.locator('#weather-animation-intensity')).toBeVisible();
  await expect(page.locator('#weather-widget-motion-enabled')).toBeVisible();
  await expect(page.locator('#weather-target-list')).toHaveCount(0);
  await expect(page.locator('#weather-apply')).toHaveCount(0);

  const enabled = page.locator('#weather-enabled');
  if (!(await enabled.isChecked())) await enabled.check();
  const animationEnabled = page.locator('#weather-animation-enabled');
  if (!(await animationEnabled.isChecked())) await animationEnabled.check();

  const stage = page.locator('#animation-stage');
  const layer = stage.locator('[data-weather-layer]');
  const atmosphere = layer.locator(':scope > .weather-atmosphere');
  const widget = layer.locator(':scope > .weather-widget');

  await expect(atmosphere).toBeVisible();
  await expect(widget).toBeVisible();
  await expect(layer).toHaveAttribute('data-weather-animation', 'on');

  await page.locator('#weather-animation-speed').fill('1.60');
  await page.locator('#weather-animation-intensity').fill('1.40');
  await expect(page.locator('#weather-animation-speed-output')).toHaveText('1.60×');
  await expect(page.locator('#weather-animation-intensity-output')).toHaveText('140%');
  await expect(layer).toHaveAttribute('data-weather-animation-speed', '1.6');
  await expect(layer).toHaveAttribute('data-weather-animation-intensity', '1.4');

  await animationEnabled.uncheck();
  await expect(layer).toHaveAttribute('data-weather-animation', 'off');
  await expect(widget).toBeVisible();
  await expect(atmosphere.locator('.weather-rain, .weather-snow, .weather-clouds, .weather-fog, .weather-stars')).toHaveCount(0);
});

test('one apply action publishes weather and other animations only to selected monitors', async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  let locationId = null;

  try {
    const locationResponse = await page.request.post('/api/locations', {
      data: { name: `Unified animation ${stamp}`, address: '', active: true }
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

    await page.goto(`/playlist?screen=${first.id}`);
    const firstTarget = page.locator(`#animation-target-list input[value="${first.id}"]`);
    const secondTarget = page.locator(`#animation-target-list input[value="${second.id}"]`);
    await expect(firstTarget).toBeChecked();
    await expect(secondTarget).not.toBeChecked();
    await expect(page.locator('#animation-apply-screens')).toHaveText('Применить все анимации');
    await expect(page.locator('#animation-apply-status')).toBeVisible();

    const sceneTab = page.locator('[data-animation-inspector-tab="scene"]');
    await sceneTab.click();
    await expect(page.locator('#weather-enabled')).toBeVisible();
    await page.evaluate(() => {
      const values = {
        'weather-location-name': 'Test City',
        'weather-latitude': '60.17',
        'weather-longitude': '24.94',
        'weather-timezone': 'UTC'
      };
      for (const [id, value] of Object.entries(values)) {
        const input = document.getElementById(id);
        if (input instanceof HTMLInputElement) input.value = value;
      }
    });
    const weatherEnabled = page.locator('#weather-enabled');
    if (!(await weatherEnabled.isChecked())) await weatherEnabled.check();
    const weatherAnimation = page.locator('#weather-animation-enabled');
    if (!(await weatherAnimation.isChecked())) await weatherAnimation.check();
    await page.locator('#weather-animation-speed').fill('1.55');
    await page.locator('#weather-animation-intensity').fill('1.25');
    await page.locator('#weather-x').fill('700');
    await page.locator('#weather-y').fill('315');

    const textTab = page.locator('[data-animation-inspector-tab="text"]');
    await textTab.click();
    const brandEnabled = page.locator('#animation-brand-enabled');
    if (!(await brandEnabled.isChecked())) await brandEnabled.check();
    const brandText = `ЕДИНЫЙ-${stamp}`;
    await page.locator('#animation-brand-text').fill(brandText);

    await expect(page.locator('#animation-apply-status')).toContainText('неприменённые изменения');
    await page.locator('#animation-apply-screens').click();
    await expect(page.locator('#animation-message')).toContainText('Все анимации, включая погоду, применены');
    await expect(page.locator('#animation-apply-status')).toContainText('Применено на сервере: 1/1');

    const firstWeather = await (await page.request.get(`/api/weather/screens/${first.id}`)).json();
    const secondWeather = await (await page.request.get(`/api/weather/screens/${second.id}`)).json();
    expect(firstWeather.enabled).toBe(true);
    expect(firstWeather.x).toBe(700);
    expect(firstWeather.y).toBe(315);
    expect(firstWeather.animation_enabled).toBe(true);
    expect(firstWeather.animation_speed).toBe(1.55);
    expect(firstWeather.animation_intensity).toBe(1.25);
    expect(secondWeather.enabled).toBe(false);

    const firstAnimationResponse = await page.request.get(`/api/settings/animation/screens/${first.id}`);
    const secondAnimationResponse = await page.request.get(`/api/settings/animation/screens/${second.id}`);
    expect(firstAnimationResponse.ok()).toBeTruthy();
    expect(secondAnimationResponse.ok()).toBeTruthy();
    const firstAnimation = await firstAnimationResponse.json();
    const secondAnimation = await secondAnimationResponse.json();
    expect(firstAnimation.brand.enabled).toBe(true);
    expect(firstAnimation.brand.text).toBe(brandText);
    expect(secondAnimation.brand.text).not.toBe(brandText);
  } finally {
    if (locationId) await page.request.delete(`/api/locations/${locationId}`);
  }
});
