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
    await expect(rail.getByLabel('Мониторинг')).toHaveCount(0);
    await expect(page.locator('.app-header-home')).toBeVisible();
    await expect(page.locator('.app-header-home')).toHaveAttribute('aria-label', /Мониторинг/);
    await expect(rail.locator('.ui-rail-brand')).toHaveAttribute('href', '/');
    await expect(rail.getByLabel('TV-сеть')).toBeVisible();
    await expect(rail.getByLabel('Редактор сцены')).toBeVisible();
    await expect(rail.getByLabel('Каталог')).toBeVisible();
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

    await page.locator('.ui-rail').getByLabel('TV-сеть').click();
    await expect(page).toHaveURL(/\/screens$/);
    await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
    await trigger.click();
    await expect(page.locator('.ui-context')).not.toHaveClass(/is-collapsed/);
    await expect(page.getByRole('link', { name: /^Плейлист/ })).toHaveCount(0);
    await expect(page.locator('.ui-context').getByRole('link', { name: /^Сцена/ })).toHaveCount(0);
    await page.getByRole('link', { name: /^Торговые точки/ }).click();
    await expect(page).toHaveURL(/\/locations$/);
    await expect(page.locator('.ui-context')).toHaveClass(/is-collapsed/);
    await expectNoPageOverflow(page);

    await page.goto('/playlist');
    await expect(page).toHaveURL(/\/scene$/);
  });

  test('keeps core pages inside the viewport and touch controls usable', async ({ page }, testInfo) => {
    await login(page);
    const routes = [
      '/screens',
      '/catalog',
      '/settings',
      '/events',
      '/connect-tv'
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

test('mobile navigation outline icons remain visible in light and dark themes', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await login(page);

  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((html, value) => { html.dataset.theme = value; }, theme);
    const inspected = await page.locator('.ui-rail-button').evaluateAll((buttons) => {
      const rail = document.querySelector('.ui-rail');
      const railColor = getComputedStyle(rail).getPropertyValue('--ui-rail').trim();
      return buttons.map((button) => {
        const svg = button.querySelector('.ui-rail-icon svg');
        const style = getComputedStyle(svg);
        return {
          label:button.getAttribute('aria-label'),
          fill:style.fill,
          stroke:style.stroke,
          color:getComputedStyle(button).color,
          railColor
        };
      });
    });
    expect(inspected).toHaveLength(5);
    for (const icon of inspected) {
      expect(icon.fill, icon.label + ' should not be a solid black silhouette').toBe('none');
      expect(icon.stroke, icon.label + ' stroke must follow theme text color').toBe(icon.color);
      // Use real computed colors (not a screenshot-only check) for both themes.
      const rgb = (value) => {
        const hex = String(value).match(/^#([0-9a-f]{6})$/i);
        if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
        const parts = String(value).match(/[0-9]+(?:[.][0-9]+)?/g);
        return parts?.slice(0, 3).map(Number) || [];
      };
      const luminance = (value) => {
        const channels = rgb(value).map((x) => {
          const s = x / 255;
          return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        expect(channels).toHaveLength(3);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const a = luminance(icon.color), b = luminance(icon.railColor);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      expect(ratio, icon.label + ' icon contrast in ' + theme + ' theme').toBeGreaterThanOrEqual(3);
    }
  }
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
