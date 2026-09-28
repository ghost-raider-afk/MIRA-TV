import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('Scene Editor uses the shared Player renderer for an approved theme and can apply it to another TV', async ({ page }) => {
  await page.setViewportSize({ width:1440,height:900 });
  await login(page);

  const stamp=Date.now();
  let locationId=null;
  const screenIds=[];
  try {
    const locationResponse=await page.request.post('/api/locations',{
      data:{ name:`Theme CI ${stamp}`,address:'Theme regression',active:true }
    });
    expect(locationResponse.status()).toBe(201);
    const location=await locationResponse.json();
    locationId=location.id;

    for(let index=0;index<2;index+=1){
      const response=await page.request.post(`/api/locations/${location.id}/screens`,{ data:{} });
      expect(response.status()).toBe(201);
      const screen=await response.json();
      screenIds.push(screen.id);
    }

    const [sourceId,targetId]=screenIds;
    await page.goto(`/scene?screen=${sourceId}`);
    await expect(page.locator('#scene-editor-stage')).toHaveAttribute('data-menu-theme','legacy');

    await page.locator('#scene-editor-theme-layer').click();
    const preset=page.getByLabel('Тема меню');
    await expect(preset).toBeVisible();
    await preset.selectOption('premium');

    const stage=page.locator('#scene-editor-stage');
    await expect(stage).toHaveAttribute('data-menu-theme','premium');
    await expect(stage.locator('.menu-theme-brand-name')).toHaveText('БИР ФИШ');
    await expect(stage.locator('.menu-theme-decor-image')).toHaveAttribute('src','/brand/themes/premium-side.jpg');
    await expect(page.getByLabel('Содержимое полезного слота')).toHaveValue('clock');

    await page.locator('#scene-editor-save').click();
    await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Сохранено');

    const savedResponse=await page.request.get(`/api/screens/${sourceId}/editor`);
    expect(savedResponse.ok()).toBeTruthy();
    const saved=await savedResponse.json();
    expect(saved.draft.settings.theme.preset_id).toBe('premium');
    expect(saved.draft.settings.theme.utility_slot.mode).toBe('clock');

    const applyResponse=await page.request.put(`/api/screens/${sourceId}/scene/apply`,{
      data:{
        kind:'theme',
        target_screen_ids:[targetId],
        theme:saved.draft.settings.theme,
        override_settings:{},
        bound_elements:{ logo:null,weather:null }
      }
    });
    expect(applyResponse.ok()).toBeTruthy();

    const targetResponse=await page.request.get(`/api/screens/${targetId}/editor`);
    const target=await targetResponse.json();
    expect(target.draft.settings.theme.preset_id).toBe('premium');
    expect(target.draft.settings.theme.utility_slot.mode).toBe('clock');
  } finally {
    for(const id of screenIds) await page.request.delete(`/api/screens/${id}`).catch(()=>undefined);
    if(locationId) await page.request.delete(`/api/locations/${locationId}`).catch(()=>undefined);
  }
});
