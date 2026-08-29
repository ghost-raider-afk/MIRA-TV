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

async function expectNoPageOverflow(page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(geometry.html).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
}

test.describe('mobile application shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses bottom navigation and an explicit section sheet', async ({ page }) => {
    await login(page);

    const rail = page.locator('.ui-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.ui-rail-button')).toHaveCount(5);
    await expect(rail.getByLabel('Обзор')).toBeVisible();
    await expect(rail.getByLabel('Мониторы')).toBeVisible();
    await expect(rail.getByLabel('Каталог')).toBeVisible();
    await expect(rail.getByLabel('Плейлист')).toBeVisible();
    await expect(rail.getByLabel('Настройки')).toBeVisible();

    const railBox = await rail.boundingBox();
    expect(railBox).not.toBeNull();
    expect(Math.abs((railBox.y + railBox.height) - 844)).toBeLessThanOrEqual(1);

    await rail.getByLabel('Настройки').click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);

    const trigger = page.locator('[data-mobile-context-trigger]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);
    await expect(page.locator('.ui-context-backdrop')).toHaveClass(/is-visible/);
    await expect(page.locator('body')).toHaveClass(/ui-context-open/);

    await page.getByRole('link', { name: /^Журнал событий/ }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
    await expect(page.locator('body')).not.toHaveClass(/ui-context-open/);

    await page.locator('.ui-rail').getByLabel('Плейлист').click();
    await expect(page).toHaveURL(/\/playlist$/);
    await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
    await expectNoPageOverflow(page);
  });

  test('keeps core pages inside the viewport and touch controls usable', async ({ page }, testInfo) => {
    await login(page);
    const routes = [
      '/screens',
      '/catalog',
      '/settings',
      '/events',
      '/connect-tv',
      '/playlist'
    ];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('.app-header')).toBeVisible();
      await expect(page.locator('.ui-rail')).toBeVisible();
      await expectNoPageOverflow(page);
      const image = await page.screenshot({ fullPage: true });
      await testInfo.attach(`mobile-${route.replace(/^\//, '') || 'overview'}`, { body: image, contentType: 'image/png' });
    }

    await page.goto('/settings');
    const input = page.locator('#site-app-name');
    await expect(input).toBeVisible();
    const inputMetrics = await input.evaluate((node) => {
      const style = getComputedStyle(node);
      return { height: node.getBoundingClientRect().height, fontSize: style.fontSize };
    });
    expect(inputMetrics.height).toBeGreaterThanOrEqual(44);
    expect(inputMetrics.fontSize).toBe('16px');

    const save = page.locator('#site-settings-submit');
    const saveHeight = await save.evaluate((node) => node.getBoundingClientRect().height);
    expect(saveHeight).toBeGreaterThanOrEqual(44);
  });
});

test('mobile shell remains usable at 360px width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  await expect(page.locator('.ui-rail-button')).toHaveCount(5);
  await expectNoPageOverflow(page);
  await page.locator('.ui-rail-button[aria-label="Каталог"]').click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expectNoPageOverflow(page);
});
