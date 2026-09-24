import { test, expect } from '@playwright/test';

test('Player exposes an installable PWA and a downloadable desktop shortcut', async ({ page }) => {
  const manifestResponse = await page.request.get('/player.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('MIRA-TV Player');
  expect(manifest.start_url).toBe('/player');
  expect(manifest.scope).toBe('/player');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);

  for (const icon of ['/brand/player-icon-192.png', '/brand/player-icon-512.png']) {
    const response = await page.request.get(icon);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }

  const shortcutResponse = await page.request.get('/player-shortcut.url');
  expect(shortcutResponse.ok()).toBeTruthy();
  expect(shortcutResponse.headers()['content-disposition']).toContain('MIRA-TV-Player.url');
  expect(await shortcutResponse.text()).toMatch(/\[InternetShortcut\]\r?\nURL=https?:\/\/[^\r\n]+\/player\r?\n/);

  await page.route('**/api/device/session', (route) =>
    route.fulfill({ status:401, contentType:'application/json', body:'{}' })
  );
  await page.goto('/player');

  const install = page.getByRole('button', { name:'Добавить ярлык MIRA-TV Player' });
  await expect(install).toBeVisible();
  await expect(page.getByRole('link', { name:'Скачать ярлык для Windows' })).toHaveAttribute('href', '/player-shortcut.url');

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable:true });
    Object.defineProperty(event, 'prompt', {
      value: async () => { window.__miraInstallPromptCalled = true; }
    });
    Object.defineProperty(event, 'userChoice', {
      value: Promise.resolve({ outcome:'accepted', platform:'web' })
    });
    window.dispatchEvent(event);
  });

  await expect(page.getByRole('button', { name:'Установить MIRA-TV Player' })).toBeVisible();
  await page.getByRole('button', { name:'Установить MIRA-TV Player' }).click();
  await expect(page.locator('[data-install-player-hint]')).toContainText('Установка подтверждена');
  expect(await page.evaluate(() => window.__miraInstallPromptCalled === true)).toBe(true);
});
