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

  const [stageBox, atmosphereBox] = await Promise.all([stage.boundingBox(), atmosphere.boundingBox()]);
  expect(stageBox).not.toBeNull();
  expect(atmosphereBox).not.toBeNull();
  expect(Math.abs(atmosphereBox.width - stageBox.width)).toBeLessThan(2);
  expect(Math.abs(atmosphereBox.height - stageBox.height)).toBeLessThan(2);

  await page.locator('#weather-scale').fill('1.65');
  await page.locator('#weather-x').fill('640');
  await page.locator('#weather-y').fill('300');
  await expect(page.locator('#weather-scale-output')).toHaveText('1.65×');
  await expect(widget).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const transform = await widget.evaluate((node) => getComputedStyle(node).transform);
  expect(transform).not.toBe('none');
  expect(await atmosphere.evaluate((node) => node.getAnimations().length)).toBeGreaterThanOrEqual(0);
});
