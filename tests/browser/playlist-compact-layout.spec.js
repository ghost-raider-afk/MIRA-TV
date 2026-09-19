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

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 }
]) {
  test(`Playlist keeps canonical five-row inspector inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.goto('/playlist');

    const inspector = page.locator('.animation-inspector');
    const preview = page.locator('.animation-preview-pane');
    const tabs = inspector.locator('.animation-inspector-tabs');
    const panels = inspector.locator('.animation-inspector-panels');
    const targets = inspector.locator('.animation-targets');
    const actions = inspector.locator('.animation-inspector-actions');

    await expect(inspector).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(tabs).toBeVisible();
    await expect(panels).toBeVisible();
    await expect(targets).toBeVisible();
    await expect(actions).toBeVisible();
    await expect(inspector.locator('.animation-object-manager')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector('.animation-studio-workspace');
      const inspector = document.querySelector('.animation-inspector');
      const preview = document.querySelector('.animation-preview-pane');
      const panels = document.querySelector('.animation-inspector-panels');
      const actions = document.querySelector('.animation-inspector-actions');
      const activePanel = panels?.querySelector('[data-animation-inspector-panel]:not([hidden])');
      if (![workspace, inspector, preview, panels, actions].every((node) => node instanceof HTMLElement)) return null;
      const direct = [...inspector.children].filter((node) => node instanceof HTMLElement);
      const rect = (node) => {
        const value = node.getBoundingClientRect();
        return { top:value.top, bottom:value.bottom, height:value.height };
      };
      return {
        pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
        bodyOverflow: document.body.scrollHeight - window.innerHeight,
        inspectorOverflow: inspector.scrollHeight - inspector.clientHeight,
        previewOverflow: preview.scrollHeight - preview.clientHeight,
        directClasses: direct.map((node) => node.id || node.className),
        workspace: rect(workspace),
        actions: rect(actions),
        panels: rect(panels),
        inspectorOverflowY: getComputedStyle(inspector).overflowY,
        panelsOverflowY: getComputedStyle(panels).overflowY,
        activePanelOverflowY: activePanel instanceof HTMLElement ? getComputedStyle(activePanel).overflowY : ''
      };
    });

    expect(layout).not.toBeNull();
    expect(layout.pageOverflow).toBeLessThanOrEqual(2);
    expect(layout.bodyOverflow).toBeLessThanOrEqual(2);
    expect(layout.inspectorOverflow).toBeLessThanOrEqual(2);
    expect(layout.previewOverflow).toBeLessThanOrEqual(2);
    expect(layout.directClasses).toHaveLength(5);
    expect(layout.workspace.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.actions.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.actions.height).toBeGreaterThan(30);
    expect(layout.panels.height).toBeGreaterThan(80);
    expect(layout.inspectorOverflowY).toBe('hidden');
    expect(layout.panelsOverflowY).toBe('hidden');
    expect(['auto','scroll']).toContain(layout.activePanelOverflowY);

    await inspector.locator('[data-animation-inspector-tab="playlist"]').click();
    const playlistPanel = inspector.locator('[data-animation-inspector-panel="playlist"]');
    await expect(playlistPanel).toBeVisible();
    await expect(playlistPanel.locator('.playlist-scene-editor')).toBeVisible();
    expect(['auto','scroll']).toContain(await playlistPanel.evaluate((node) => getComputedStyle(node).overflowY));

    await inspector.locator('[data-animation-inspector-tab="menu"]').click();
    await expect(inspector.locator('[data-animation-inspector-panel="menu"]')).toBeVisible();
  });
}
