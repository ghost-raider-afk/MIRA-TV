import { expect, test } from '@playwright/test';

async function mountApplyUi(page, { dirty = false, ready = false } = {}) {
  await page.goto('/signin');
  await page.evaluate(async ({ dirty, ready }) => {
    document.body.innerHTML = `
      <form id="scene-editor-form">
        <div class="scene-editor-command-actions">
          <select id="scene-editor-screen" ${ready ? '' : 'disabled'}>${ready ? '<option value="2" selected>Хетагуровская 12 — TV 2</option>' : ''}</select>
          <span id="scene-editor-dirty-state" class="${dirty ? 'is-dirty' : ''}">${dirty ? 'Не сохранено' : 'Сохранено'}</span>
          <button id="scene-editor-save" type="submit">Сохранить</button>
        </div>
        <div id="scene-editor-message"></div>
      </form>
    `;
    window.__sceneSubmitCount = 0;
    document.getElementById('scene-editor-form').addEventListener('submit', (event) => {
      event.preventDefault();
      window.__sceneSubmitCount += 1;
    });
    const { initialiseSceneTvApply } = await import('/js/pages/scene-tv-apply.js');
    window.__disposeSceneTvApply = initialiseSceneTvApply();
  }, { dirty, ready });
}

test('Scene Editor enables Apply to TV after its monitor list loads asynchronously', async ({ page }) => {
  await mountApplyUi(page);

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

test('Apply to TV refuses to force an unsaved Scene Editor draft', async ({ page }) => {
  await mountApplyUi(page, { dirty:true, ready:true });

  const apply = page.locator('#scene-editor-apply-tv');
  await expect(apply).toBeEnabled();
  await apply.click();

  await expect.poll(() => page.evaluate(() => window.__sceneSubmitCount)).toBe(0);
  await expect(page.locator('#scene-editor-message')).toContainText('Сначала сохраните изменения сцены');
});
