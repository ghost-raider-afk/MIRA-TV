import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
}

test('mobile TV pairing is styled after SPA navigation and keeps one active step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.locator('.ui-rail-button[aria-label="Мониторы"]').click();
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  const sectionTrigger = page.locator('[data-mobile-context-trigger]');
  await expect(sectionTrigger).toBeVisible();
  await sectionTrigger.click();
  await expect(sectionTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);
  await page.locator('.ui-context-body .app-route-link', { hasText: 'Подключить ТВ' }).click();
  await expect(page).toHaveURL(/\/connect-tv$/);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
  await expect.poll(() => page.evaluate(() => typeof window.jsQR)).toBe('function');
  await expect(page.locator('script[data-mira-jsqr="1"]')).toHaveCount(1);

  const scanStep = page.locator('[data-connect-step="scan"]');
  const locationStep = page.locator('[data-connect-step="location"]');
  const screenStep = page.locator('[data-connect-step="screen"]');
  await expect(scanStep).toBeVisible();
  await expect(locationStep).toBeHidden();
  await expect(screenStep).toBeHidden();
  await expect(page.getByRole('button', { name: 'Сканировать QR-код' })).toBeVisible();
  await expect(scanStep).toHaveCSS('background-color', /rgb\(/);
  expect(await scanStep.evaluate((node) => getComputedStyle(node).borderRadius)).not.toBe('0px');
  expect(await page.locator('.connect-tv-progress').evaluate((node) => getComputedStyle(node).display)).toBe('grid');

  await page.getByRole('button', { name: /ввести код/i }).first().click();
  await expect(page.getByLabel('6-значный резервный код')).toBeVisible();

  const decoder = await page.request.get('/vendor/jsQR.js');
  expect(decoder.ok()).toBeTruthy();

  await sectionTrigger.click();
  await expect(sectionTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.ui-context-body .app-route-link[href="/screens"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  const returnTrigger = page.locator('[data-mobile-context-trigger]');
  await returnTrigger.click();
  await expect(returnTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.ui-context-body .app-route-link[href="/connect-tv"]').click();
  await expect(page).toHaveURL(/\/connect-tv$/);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await page.getByRole('button', { name: /ввести код/i }).first().click();
  await expect(page.getByLabel('6-значный резервный код')).toBeVisible();

  const scanner = page.locator('[data-scanner]');
  await scanner.evaluate((element) => element.classList.remove('is-hidden'));
  await expect(scanner).toBeVisible();
  const box = await scanner.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(385);
  expect(box?.height).toBeGreaterThanOrEqual(835);
  await expect(page.getByRole('button', { name: 'Закрыть сканер' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ввести 6-значный код' })).toBeVisible();
});
