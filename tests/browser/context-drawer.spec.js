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

test('Dashboard static first paint never reserves rail or submenu columns before app boot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await page.route('**/app.js', async (route) => {
    await route.fulfill({ status:200, contentType:'application/javascript; charset=utf-8', body:'' });
  });
  await page.reload({ waitUntil:'domcontentloaded' });

  await expect(page.locator('.ui-rail')).toHaveCount(0);
  await expect(page.locator('.ui-context')).toHaveCount(0);

  const geometry = await page.locator('.app-content').evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x:box.x, width:box.width, viewport:window.innerWidth };
  });
  expect(geometry.x).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.width - geometry.viewport)).toBeLessThanOrEqual(1);
});

test('context drawer never occupies Dashboard and has deterministic desktop lifecycle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const context = page.locator('.ui-context');
  const shell = page.locator('.app-shell');

  await expect(page).toHaveTitle(/ — Дашборд$/);
  await expect(context).toBeHidden();
  await expect(context).toHaveClass(/is-collapsed/);
  await expect(context).toHaveAttribute('aria-hidden', 'true');
  await expect(context).toHaveAttribute('inert', '');
  await expect(shell).toHaveClass(/ui-context-collapsed/);

  await page.reload();
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await expect(context).toBeHidden();
  await expect(shell).toHaveClass(/ui-context-collapsed/);
  await expect(shell).toHaveClass(/ui-shell-ready/);
  const hydratedGeometry = await page.evaluate(() => {
    const rail = document.querySelector('.ui-rail')?.getBoundingClientRect();
    const content = document.querySelector('.app-content')?.getBoundingClientRect();
    return rail && content ? { railWidth:rail.width, contentX:content.x } : null;
  });
  expect(hydratedGeometry).not.toBeNull();
  expect(Math.abs(hydratedGeometry.contentX - hydratedGeometry.railWidth)).toBeLessThanOrEqual(1);

  await page.locator('.ui-rail-button[aria-label="TV-сеть"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await expect(context).toBeVisible();
  await expect(context).not.toHaveClass(/is-collapsed/);
  await expect(context).toHaveAttribute('aria-hidden', 'false');
  await expect(context).not.toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(context).toHaveClass(/is-collapsed/);
  await expect(context).toHaveAttribute('inert', '');

  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(context).toBeVisible();
  await page.locator('.main-content').dispatchEvent('pointerdown');
  await expect(context).toHaveClass(/is-collapsed/);

  await page.locator('.ui-rail-brand').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(context).toBeHidden();
  await expect(shell).toHaveClass(/ui-context-collapsed/);
  await expect(page.locator('body')).not.toHaveClass(/ui-context-open/);
});

test('mobile drawer closes completely when returning to Dashboard by logo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const context = page.locator('.ui-context');
  const trigger = page.locator('[data-mobile-context-trigger]');
  const backdrop = page.locator('.ui-context-backdrop');
  const home = page.locator('.app-header-home');

  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('href', '/');
  await expect(context).toBeHidden();
  await expect(trigger).toBeHidden();

  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(trigger).toBeVisible();
  await expect(context).toHaveClass(/is-collapsed/);

  await trigger.click();
  await expect(context).toBeVisible();
  await expect(backdrop).toHaveClass(/is-visible/);
  await expect(page.locator('body')).toHaveClass(/ui-context-open/);

  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(context).toBeHidden();
  await expect(trigger).toBeHidden();
  await expect(backdrop).not.toHaveClass(/is-visible/);
  await expect(page.locator('body')).not.toHaveClass(/ui-context-open/);
});
