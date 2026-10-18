import { test, expect } from '@playwright/test';

test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36' });

for (const enabled of [false, true]) {
  test(`TV activation ${enabled ? 'shows' : 'hides'} self-hosted Screenlite APK link`, async ({ page }) => {
    await page.route('**/api/device/session', (route) =>
      route.fulfill({ status:401, contentType:'application/json', body:'{}' })
    );
    await page.route('**/api/public/config', (route) =>
      route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({
        screenlite_download_url: enabled ? '/downloads/screenlite-web-kiosk-v0-0-11.apk' : ''
      }) })
    );
    await page.goto('/player');
    const download = page.locator('[data-screenlite-download]');
    if (enabled) {
      await expect(download).toBeVisible();
      await expect(download.locator('a')).toHaveAttribute('href', '/downloads/screenlite-web-kiosk-v0-0-11.apk');
      await expect(download.locator('a')).toHaveAttribute('download', '');
    } else {
      await expect(download).toHaveClass(/is-hidden/);
    }
    await expect(page.getByRole('button', { name:'Показать QR-код' })).toBeVisible();
  });
}

test('TV activation ignores an unexpected external APK link', async ({ page }) => {
  await page.route('**/api/device/session', (route) => route.fulfill({ status:401, body:'{}' }));
  await page.route('**/api/public/config', (route) => route.fulfill({
    status:200, contentType:'application/json',
    body:JSON.stringify({ screenlite_download_url:'https://example.com/fake.apk' })
  }));
  await page.goto('/player');
  await expect(page.locator('[data-screenlite-download]')).toHaveClass(/is-hidden/);
});
