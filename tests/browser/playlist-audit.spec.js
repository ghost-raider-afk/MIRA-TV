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

async function getSettings(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/animation', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`GET settings failed: ${response.status}`);
    return response.json();
  });
}

async function putSettings(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/settings/animation', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`PUT settings failed: ${response.status}`);
    return response.json();
  }, payload);
}

function fullPayload(settings, overrides = {}) {
  return {
    enabled: settings.enabled,
    preset_id: settings.preset_id,
    profile: settings.profile,
    scene_playlist: settings.scene_playlist,
    ...overrides
  };
}

test('legacy html URLs canonicalize to extensionless authenticated routes without losing query parameters', async ({ page }) => {
  await page.goto('/playlist.html');
  await expect(page).toHaveURL(/\/signin$/);

  await login(page);
  await page.goto('/playlist.html?audit=1');
  expect(new URL(page.url()).pathname).toBe('/playlist');
  expect(new URL(page.url()).search).toBe('?audit=1');
  await expect(page.getByRole('heading', { name: 'Плейлист', exact: true })).toBeVisible();

  await page.goto('/screens.html?audit=2');
  expect(new URL(page.url()).pathname).toBe('/screens');
  expect(new URL(page.url()).search).toBe('?audit=2');

  await page.goto('/animation.html?audit=3');
  expect(new URL(page.url()).pathname).toBe('/playlist');
  expect(new URL(page.url()).search).toBe('?audit=3');

  await page.goto('/player.html?audit=4');
  expect(new URL(page.url()).pathname).toBe('/player');
  expect(new URL(page.url()).search).toBe('?audit=4');
});

test('partial settings PUT without scene_playlist preserves the current Scene Playlist', async ({ page }) => {
  await login(page);
  const original = await getSettings(page);
  const sentinel = {
    enabled: true,
    animation_enabled: true,
    menu_duration_seconds: 17,
    scenes: [{ id: 'audit-promo', type: 'promo', enabled: true, mode: 'overlay', duration_seconds: 6, title: 'AUDIT PLAYLIST', body: '' }]
  };
  try {
    await putSettings(page, fullPayload(original, { scene_playlist: sentinel }));
    const saved = await getSettings(page);
    expect(saved.scene_playlist).toEqual(sentinel);

    const partialPayload = fullPayload(saved, {
      profile: { ...saved.profile, intensity: 37 },
      brand: { enabled: true, text: 'IGNORED LEGACY FIELD' }
    });
    delete partialPayload.scene_playlist;
    await putSettings(page, partialPayload);

    const afterLegacyPut = await getSettings(page);
    expect(afterLegacyPut.scene_playlist).toEqual(sentinel);
    expect(afterLegacyPut.profile.intensity).toBe(37);
    expect('brand' in afterLegacyPut).toBe(false);
  } finally {
    await putSettings(page, fullPayload(original));
  }
});

test('fullscreen Scene Playlist suppresses MenuScene and returns cleanly without legacy layer owners', async ({ page }) => {
  await login(page);
  await page.goto('/playlist');
  const result = await page.evaluate(async () => {
    const { ScenePlaylistRuntime } = await import('/js/motion/scene-playlist-runtime.js');
    const stage = document.createElement('div');
    stage.className = 'animation-stage';
    stage.style.width = '960px';
    stage.style.height = '540px';
    const menuLayer = document.createElement('div'); menuLayer.dataset.playerMenuLayer = '';
    const fxLayer = document.createElement('div'); fxLayer.dataset.playerFxLayer = '';
    const contentLayer = document.createElement('div'); contentLayer.dataset.playerContentLayer = '';
    stage.append(menuLayer, fxLayer, contentLayer);
    document.body.append(stage);

    const runtime = new ScenePlaylistRuntime();
    const scene = { id: 'full-1', type: 'promo', enabled: true, mode: 'fullscreen', duration_seconds: 8, title: 'Fullscreen', body: '' };
    runtime.render({ enabled: true, menu_duration_seconds: 40, scenes: [scene] }, { menuLayer, contentLayer, fxLayer, autoplay: false });
    runtime.preview(scene);
    await new Promise((resolve) => setTimeout(resolve, 320));
    const fullscreen = {
      state: stage.dataset.scenePlaylistFullscreen,
      menuSuppressed: menuLayer.classList.contains('scene-menu-suppressed'),
      contentChildren: contentLayer.childElementCount,
      legacyOwners: stage.querySelectorAll('.animation-screen-entity-layer,.animation-screen-brand-layer,.animation-screen-announcement-layer').length
    };
    runtime.resume();
    const menu = {
      state: stage.dataset.scenePlaylistFullscreen || '',
      menuSuppressed: menuLayer.classList.contains('scene-menu-suppressed'),
      contentChildren: contentLayer.childElementCount
    };
    runtime.destroy();
    stage.remove();
    return { fullscreen, menu };
  });

  expect(result.fullscreen.state).toBe('true');
  expect(result.fullscreen.menuSuppressed).toBe(true);
  expect(result.fullscreen.contentChildren).toBe(1);
  expect(result.fullscreen.legacyOwners).toBe(0);
  expect(result.menu.state).toBe('');
  expect(result.menu.menuSuppressed).toBe(false);
  expect(result.menu.contentChildren).toBe(0);
});
test('Playlist editor destroys its timer and DOM ownership on route disposal', async ({ page }) => {
  await login(page);
  await page.goto('/playlist');
  const result = await page.evaluate(async () => {
    const { ScenePlaylistEditor } = await import('/js/motion/scene-playlist-editor.js');
    const stage = document.createElement('div');
    const menuLayer = document.createElement('div'); menuLayer.dataset.playerMenuLayer = '';
    const fxLayer = document.createElement('div'); fxLayer.dataset.playerFxLayer = '';
    const contentLayer = document.createElement('div'); contentLayer.dataset.playerContentLayer = '';
    stage.append(menuLayer, fxLayer, contentLayer);
    const previewPane = document.createElement('div');
    previewPane.className = 'playlist-preview-pane';
    previewPane.append(stage);
    const mount = document.createElement('div');
    document.body.append(previewPane, mount);

    const editor = new ScenePlaylistEditor({ stage });
    editor.mount(mount);
    editor.set({ enabled: true, menu_duration_seconds: 40, scenes: [{ id: 'audit', type: 'promo', enabled: true, mode: 'overlay', duration_seconds: 8, title: 'Audit', body: '' }] });
    editor.rebindPreview();
    const timerBefore = editor.runtime.timer !== null;
    window.dispatchEvent(new CustomEvent('mira:route-dispose'));
    const snapshot = {
      timerBefore,
      timerAfter: editor.runtime.timer,
      runtimeLayers: editor.runtime.layers,
      root: editor.root,
      stage: editor.stage
    };
    previewPane.remove();
    mount.remove();
    return snapshot;
  });
  expect(result.timerBefore).toBe(true);
  expect(result.timerAfter).toBeNull();
  expect(result.runtimeLayers).toBeNull();
  expect(result.root).toBeNull();
  expect(result.stage).toBeNull();
});
