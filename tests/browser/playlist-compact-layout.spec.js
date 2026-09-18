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

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 }
]) {
  test(`Playlist keeps the inspector footer visible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.goto('/playlist');

    const inspector = page.locator('.animation-inspector');
    const preview = page.locator('.animation-preview-pane');
    const manager = page.locator('.animation-object-manager');
    const panels = page.locator('.animation-object-panels');
    const status = page.locator('#animation-apply-status');
    const actions = page.locator('#animation-inspector-actions');

    await expect(inspector).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(manager).toBeVisible();
    await expect(status).toBeVisible();
    await expect(actions).toBeVisible();

    const layout = await page.evaluate(() => {
      const appContentNode = document.querySelector('.app-content');
      const headerNode = document.querySelector('.app-header');
      const workspaceNode = document.querySelector('.animation-studio-workspace');
      const inspectorNode = document.querySelector('.animation-inspector');
      const previewNode = document.querySelector('.animation-preview-pane');
      const panelsNode = document.querySelector('.animation-object-panels');
      const actionsNode = document.querySelector('#animation-inspector-actions');
      const statusNode = document.querySelector('#animation-apply-status');
      if (!(appContentNode instanceof HTMLElement) || !(headerNode instanceof HTMLElement) ||
          !(workspaceNode instanceof HTMLElement) || !(inspectorNode instanceof HTMLElement) || !(previewNode instanceof HTMLElement) ||
          !(panelsNode instanceof HTMLElement) || !(actionsNode instanceof HTMLElement) ||
          !(statusNode instanceof HTMLElement)) return null;
      const direct = [...inspectorNode.children].filter((node) => node instanceof HTMLElement);
      const activePanel = panelsNode.querySelector('[data-animation-object-panel]:not([hidden])');
      const rect = (node) => {
        const value = node.getBoundingClientRect();
        return { top: value.top, bottom: value.bottom, height: value.height };
      };
      return {
        pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
        bodyOverflow: document.body.scrollHeight - window.innerHeight,
        inspectorOverflow: inspectorNode.scrollHeight - inspectorNode.clientHeight,
        previewOverflow: previewNode.scrollHeight - previewNode.clientHeight,
        directClasses: direct.map((node) => node.id || node.className),
        appContent: rect(appContentNode),
        header: rect(headerNode),
        workspace: rect(workspaceNode),
        actions: rect(actionsNode),
        status: rect(statusNode),
        panels: rect(panelsNode),
        activePanelOverflowY: activePanel instanceof HTMLElement ? getComputedStyle(activePanel).overflowY : '',
        inspectorOverflowY: getComputedStyle(inspectorNode).overflowY,
        panelsOverflowY: getComputedStyle(panelsNode).overflowY,
        previewOverflowY: getComputedStyle(previewNode).overflowY
      };
    });

    expect(layout).not.toBeNull();
    expect(layout.pageOverflow).toBeLessThanOrEqual(2);
    expect(layout.bodyOverflow).toBeLessThanOrEqual(2);
    expect(layout.inspectorOverflow).toBeLessThanOrEqual(2);
    expect(layout.previewOverflow).toBeLessThanOrEqual(2);
    expect(layout.directClasses).toHaveLength(6);
    expect(layout.appContent.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.header.bottom).toBeLessThanOrEqual(layout.workspace.top + 1);
    expect(layout.workspace.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.actions.bottom).toBeLessThanOrEqual(layout.workspace.bottom + 1);
    expect(layout.actions.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.actions.height).toBeGreaterThan(30);
    expect(layout.status.bottom).toBeLessThanOrEqual(layout.actions.top + 1);
    expect(layout.panels.height).toBeGreaterThan(80);
    expect(layout.inspectorOverflowY).toBe('hidden');
    expect(layout.panelsOverflowY).toBe('hidden');
    expect(layout.previewOverflowY).toBe('hidden');
    expect(['auto', 'scroll']).toContain(layout.activePanelOverflowY);

    const picker = page.locator('#animation-object-settings-select');
    await expect(picker).toBeVisible();
    for (const key of ['menu', 'promotion', 'weather', 'announcement', 'brand', 'aquarium', 'entity', 'playlist']) {
      await picker.selectOption(key);
      const activePanel = panels.locator(`[data-animation-object-panel="${key}"]`);
      await expect(activePanel).toBeVisible();
      const geometry = await activePanel.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          overflowY: getComputedStyle(node).overflowY
        };
      });
      expect(geometry.bottom).toBeLessThanOrEqual(layout.actions.top + 1);
      expect(geometry.clientHeight).toBeGreaterThan(80);
      expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);
      expect(['auto', 'scroll']).toContain(geometry.overflowY);
    }
  });
}
