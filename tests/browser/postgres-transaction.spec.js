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

test('stale editor write rolls back screen metadata in real PostgreSQL', async ({ page }) => {
  await login(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', {
    data: { name: `Transaction ${suffix}`, address: 'Browser CI' }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`);
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const originalName = screen.name;

  const firstSave = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: [{ id: 'section-1', kind: 'section', name: 'РАЗДЕЛ', enabled: true }],
      settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: 100 },
      screen: {
        location_id: screen.location_id,
        name: originalName,
        resolution: screen.resolution,
        status: 'draft',
        active: true,
        template_id: null
      }
    }
  });
  expect(firstSave.status()).toBe(200);

  const staleSave = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: [{ id: 'section-1', kind: 'section', name: 'РАЗДЕЛ', enabled: true }],
      settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: 100 },
      screen: {
        location_id: screen.location_id,
        name: 'ЭТО ИМЯ ДОЛЖНО ОТКАТИТЬСЯ',
        resolution: screen.resolution,
        status: 'draft',
        active: true,
        template_id: null
      }
    }
  });
  expect(staleSave.status()).toBe(409);

  const after = await (await page.request.get(`/api/screens/${screen.id}`)).json();
  expect(after.name).toBe(originalName);
});
