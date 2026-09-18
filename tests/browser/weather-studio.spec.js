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

  const weatherObject = page.locator('[data-animation-object="weather"]');
  await expect(weatherObject).toBeVisible();
  await weatherObject.locator('.animation-object-configure').click();

  await expect(page.getByRole('heading', { name: 'Погода', exact: true })).toBeVisible();
  await expect(page.locator('#weather-animation-speed')).toBeVisible();
  await expect(page.locator('#weather-animation-intensity')).toBeVisible();
  await expect(page.locator('#weather-widget-motion-enabled')).toBeVisible();
  await expect(page.locator('#weather-target-list')).toHaveCount(0);
  await expect(page.locator('#weather-apply')).toHaveCount(0);

  const weatherToggle = weatherObject.locator('[data-animation-object-toggle="visible"]');
  const motionToggle = weatherObject.locator('[data-animation-object-toggle="motion"]');
  await expect(weatherToggle).toBeVisible();
  await expect(motionToggle).toBeVisible();
  if (!(await weatherToggle.isChecked())) await weatherToggle.check();
  if (!(await motionToggle.isChecked())) await motionToggle.check();
  await expect(page.locator('#weather-enabled')).toBeChecked();
  await expect(page.locator('#weather-animation-enabled')).toBeChecked();

  const stage = page.locator('#animation-stage');
  const layer = stage.locator('[data-weather-layer]');
  const atmosphere = layer.locator(':scope > .weather-atmosphere');
  const widget = layer.locator(':scope > .weather-widget');

  await expect(atmosphere).toBeVisible();
  await expect(widget).toBeVisible();
  await expect(layer).toHaveAttribute('data-weather-animation', 'on');

  await page.locator('#weather-animation-speed').fill('1.6');
  await page.locator('#weather-animation-intensity').fill('1.4');
  await expect(page.locator('#weather-animation-speed-output')).toHaveText('1.60×');
  await expect(page.locator('#weather-animation-intensity-output')).toHaveText('140%');
  await expect(layer).toHaveAttribute('data-weather-animation-speed', '1.6');
  await expect(layer).toHaveAttribute('data-weather-animation-intensity', '1.4');

  await motionToggle.uncheck();
  await expect(page.locator('#weather-animation-enabled')).not.toBeChecked();
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
    await expect(page.locator('#animation-apply-screens')).toHaveText('Применить сцену');
    await expect(page.locator('#animation-apply-status')).toBeVisible();

    const weatherObject = page.locator('[data-animation-object="weather"]');
    await expect(weatherObject).toBeVisible();
    await weatherObject.locator('.animation-object-configure').click();
    await expect(page.locator('#weather-animation-speed')).toBeVisible();
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
    const weatherToggle = weatherObject.locator('[data-animation-object-toggle="visible"]');
    const weatherMotionToggle = weatherObject.locator('[data-animation-object-toggle="motion"]');
    if (!(await weatherToggle.isChecked())) await weatherToggle.check();
    if (!(await weatherMotionToggle.isChecked())) await weatherMotionToggle.check();
    await expect(page.locator('#weather-enabled')).toBeChecked();
    await expect(page.locator('#weather-animation-enabled')).toBeChecked();
    await page.locator('#weather-animation-speed').fill('1.55');
    await page.locator('#weather-animation-intensity').fill('1.25');
    await page.locator('#weather-x').fill('700');
    await page.locator('#weather-y').fill('315');

    const brandObject = page.locator('[data-animation-object="brand"]');
    await expect(brandObject).toBeVisible();
    await brandObject.locator('.animation-object-configure').click();
    const brandToggle = brandObject.locator('[data-animation-object-toggle="visible"]');
    if (!(await brandToggle.isChecked())) await brandToggle.check();
    await expect(page.locator('#animation-brand-enabled')).toBeChecked();
    const brandText = `ЕДИНЫЙ-${stamp}`;
    await page.locator('#animation-brand-text').fill(brandText);

    await expect(page.locator('#animation-apply-status')).toContainText('неприменённые изменения');
    const applyRequests = [];
    const captureApply = (request) => {
      if (request.method() === 'PUT' && (request.url().endsWith('/api/settings/animation/apply') || request.url().endsWith('/api/weather/settings'))) {
        applyRequests.push(request);
      }
    };
    page.on('request', captureApply);
    const applyRequestPromise = page.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/api/settings/animation/apply'));
    await page.locator('#animation-apply-screens').click();
    const applyRequest = await applyRequestPromise;
    const applyPayload = applyRequest.postDataJSON();
    await expect(page.locator('#animation-message')).toContainText('Плейлист применён к мониторам: 1');
    await expect(page.locator('#animation-apply-status')).toContainText('Сцена атомарно применена: 1');
    page.off('request', captureApply);
    expect(applyPayload.screen_ids).toEqual([first.id]);
    expect(applyPayload.weather.enabled).toBe(true);
    expect(applyPayload.weather.animation_enabled).toBe(true);
    expect(applyPayload.settings.brand.text).toBe(brandText);
    expect(applyRequests.filter((request) => request.url().endsWith('/api/settings/animation/apply'))).toHaveLength(1);
    expect(applyRequests.filter((request) => request.url().endsWith('/api/weather/settings'))).toHaveLength(0);

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
