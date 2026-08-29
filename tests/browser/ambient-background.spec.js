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

test('premium ambient layer animates the workspace and respects reduced motion', async ({ page }) => {
  await login(page);
  await expect(page.locator('.app-content')).toBeVisible();

  const animated = await page.evaluate(() => {
    const content = document.querySelector('.app-content');
    const style = getComputedStyle(content, '::before');
    return {
      animationName: style.animationName,
      duration: style.animationDuration,
      pointerEvents: style.pointerEvents,
      position: style.position
    };
  });

  expect(animated.animationName).toBe('uiAmbientDrift');
  expect(animated.duration).toBe('32s');
  expect(animated.pointerEvents).toBe('none');
  expect(animated.position).toBe('fixed');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => getComputedStyle(document.querySelector('.app-content'), '::before').animationName);
  expect(reduced).toBe('none');
});

test('uploaded rail logo has no accent tile behind it', async ({ page }) => {
  await login(page);
  await expect(page.locator('.ui-rail-brand .brand-mark')).toBeVisible();

  const result = await page.evaluate(() => {
    const mark = document.querySelector('.ui-rail-brand .brand-mark');
    const image = document.createElement('img');
    image.alt = '';
    image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="%23f4c915"/></svg>';
    mark.replaceChildren(image);
    const markStyle = getComputedStyle(mark);
    const imageStyle = getComputedStyle(image);
    return {
      backgroundColor: markStyle.backgroundColor,
      boxShadow: markStyle.boxShadow,
      padding: imageStyle.padding
    };
  });

  expect(result.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(result.boxShadow).toBe('none');
  expect(result.padding).toBe('0px');
});
