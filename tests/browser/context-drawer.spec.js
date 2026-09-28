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

test('desktop context navigation uses full width and stays persistent inside its section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const context = page.locator('.ui-context');

  await expect(page).toHaveTitle(/ — Дашборд$/);
  await expect(context).toBeHidden();
  await expect(context).toHaveAttribute('aria-hidden', 'true');
  await expect(context).toHaveAttribute('inert', '');
  await expect(page.locator('.ui-rail')).toBeHidden();
  await expect(page.locator('.app-header-nav')).toBeVisible();

  const hydratedGeometry = await page.evaluate(() => {
    const content = document.querySelector('.app-content')?.getBoundingClientRect();
    return content ? { x:content.x, width:content.width, viewport:window.innerWidth } : null;
  });
  expect(hydratedGeometry).not.toBeNull();
  expect(hydratedGeometry.x).toBeLessThanOrEqual(1);
  expect(Math.abs(hydratedGeometry.width - hydratedGeometry.viewport)).toBeLessThanOrEqual(1);

  await page.locator('.app-header-nav-link[data-header-section="monitors"]').click();
  await expect(page).toHaveURL(/\/screens$/);
  await expect(context).toBeVisible();
  await expect(context).toHaveAttribute('aria-hidden', 'false');
  await expect(context).not.toHaveAttribute('inert', '');
  await expect(context.getByRole('link', { name:/^Мониторы/ })).toBeVisible();
  await expect(context.getByRole('link', { name:/^Торговые точки/ })).toBeVisible();
  await expect(context.getByRole('link', { name:/^Подключить ТВ/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(context).toBeVisible();
  await expect(context).toHaveAttribute('aria-hidden', 'false');

  await page.locator('.app-header-nav-link[data-header-section="settings"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(context).toBeVisible();
  await expect(context.getByRole('link', { name:/^Журнал событий/ })).toBeVisible();

  await page.locator('.app-header-home').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(context).toBeHidden();
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
