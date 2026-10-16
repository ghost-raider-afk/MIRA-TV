import { expect, test } from '@playwright/test';

test('Scene Editor enables Apply to TV after its monitor list loads asynchronously', async ({ page }) => {
  await page.goto('/signin');
  await page.evaluate(async () => {
    document.body.innerHTML = `
      <div class="scene-editor-command-actions">
        <select id="scene-editor-screen" disabled></select>
        <span id="scene-editor-dirty-state">Сохранено</span>
        <button id="scene-editor-save" type="button">Сохранить</button>
      </div>
      <div id="scene-editor-message"></div>
    `;
    const { initialiseSceneTvApply } = await import('/js/pages/scene-tv-apply.js');
    window.__disposeSceneTvApply = initialiseSceneTvApply();
  });

  const apply = page.locator('#scene-editor-apply-tv');
  await expect(apply).toBeDisabled();

  await page.evaluate(() => {
    const select = document.getElementById('scene-editor-screen');
    select.add(new Option('Хетагуровская 12 — TV 2', '2'));
    select.value = '2';
    select.disabled = false;
  });

  await expect(apply).toBeEnabled();
});
