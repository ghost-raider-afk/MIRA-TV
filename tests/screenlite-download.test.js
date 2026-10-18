import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { siteSettingsInput } from '../src/contracts/input.js';
import { SCREENLITE_APK_FILENAME, SCREENLITE_APK_URL } from '../src/services/screenlite-distribution.js';
import { siteSettingsResponse } from '../src/services/site-assets-service.js';

const defaults = {
  application_name: 'MIRA-TV', accent_color: '#F4C915', timezone: 'Europe/Moscow',
  date_format: 'DD.MM.YYYY', dashboard_refresh_seconds: 45,
  default_screen_resolution: '1920×1080', signin_logo_size: 1, ui_scale_percent: 100
};
const config = {
  dashboardRefreshMinSeconds: 15, dashboardRefreshMaxSeconds: 300,
  screenMaxWidth: 1920, screenMaxHeight: 1080, appName: 'MIRA-TV'
};

test('Screenlite download visibility is explicitly enabled and validated', () => {
  assert.equal(siteSettingsInput(defaults, config).show_screenlite_download_link, null);
  assert.equal(siteSettingsInput({ ...defaults, show_screenlite_download_link:false }, config).show_screenlite_download_link, false);
  assert.equal(siteSettingsInput({ ...defaults, show_screenlite_download_link:true }, config).show_screenlite_download_link, true);
  assert.throws(() => siteSettingsInput({ ...defaults, show_screenlite_download_link:'true' }, config), /Screenlite/);
  assert.equal(siteSettingsResponse({ id:1, show_screenlite_download_link:true }, config).show_screenlite_download_link, true);
});

test('APK is pinned to a version and checksum and served only by MIRA-TV origin', async () => {
  assert.equal(SCREENLITE_APK_FILENAME, 'screenlite-web-kiosk-v0-0-11.apk');
  assert.equal(SCREENLITE_APK_URL, '/downloads/screenlite-web-kiosk-v0-0-11.apk');
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /ADD --checksum=sha256:462cc87ae09620dfce9d7a7ec1005fa6fffef7f4b72c14b51599e83a423e8559/);
  assert.match(dockerfile, /https:\/\/github\.com\/screenlite\/android-web-kiosk\/releases\/download\/v0\.0\.11\//);
  const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /response\.download\(path\.join\(publicDir, 'downloads', SCREENLITE_APK_FILENAME\)/);
});
