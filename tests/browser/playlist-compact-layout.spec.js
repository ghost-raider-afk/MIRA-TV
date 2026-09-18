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

test('desktop playlist studio fits preview, state matrix and active settings into one window', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await page.goto('/playlist.html');
  const inspector = page.locator('.animation-inspector');
  const preview = page.locator('.animation-preview-pane');
  const manager = page.locator('.animation-object-manager');
  await expect(inspector).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(manager).toBeVisible();

  const layout = await page.evaluate(() => {
    const root = document.scrollingElement;
    const inspectorNode = document.querySelector('.animation-inspector');
    const previewNode = document.querySelector('.animation-preview-pane');
    return {
      pageOverflow: root ? root.scrollHeight - window.innerHeight : 0,
      inspectorOverflow: inspectorNode ? inspectorNode.scrollHeight - inspectorNode.clientHeight : 0,
      previewWidth: previewNode?.getBoundingClientRect().width || 0,
      inspectorWidth: inspectorNode?.getBoundingClientRect().width || 0
    };
  });
  expect(layout.pageOverflow).toBeLessThanOrEqual(2);
  expect(layout.inspectorOverflow).toBeLessThanOrEqual(2);
  expect(layout.previewWidth).toBeLessThan(layout.inspectorWidth * 1.45);

  for (const key of ['menu', 'promotion', 'weather', 'announcement', 'brand', 'aquarium', 'entity', 'playlist']) {
    await inspector.locator(`[data-animation-object="${key}"] .animation-object-configure`).click();
    const panel = inspector.locator(`[data-animation-object-panel="${key}"]`);
    await expect(panel).toBeVisible();
    const overflow = await panel.evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(overflow, `${key} settings must remain fully laid out inside the one-page inspector at 1600x900`).toBeLessThanOrEqual(4);
  }
});
