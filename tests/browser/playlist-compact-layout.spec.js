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

  const picker = inspector.locator('#animation-object-settings-select');
  await expect(picker).toBeVisible();
  for (const key of ['menu', 'promotion', 'weather', 'announcement', 'brand', 'aquarium', 'entity', 'playlist']) {
    await picker.selectOption(key);
    const panel = inspector.locator(`[data-animation-object-panel="${key}"]`);
    await expect(panel).toBeVisible();
    const geometry = await panel.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(900);
    expect(geometry.clientHeight).toBeGreaterThan(80);
  }
});
