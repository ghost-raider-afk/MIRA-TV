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

async function animationSettings(page, screenId = null) {
  const suffix = screenId ? `/screens/${screenId}` : '';
  const response = await page.request.get(`/api/settings/animation${suffix}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function restoreAnimationSettings(page, settings) {
  const response = await page.request.put('/api/settings/animation', {
    data: {
      enabled: settings.enabled,
      preset_id: settings.preset_id,
      profile: settings.profile,
      scene_playlist: settings.scene_playlist
    }
  });
  expect(response.ok()).toBeTruthy();
}

async function createPreviewFixture(page) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const productResponse = await page.request.post('/api/catalog/products', { data: {
    name: `Playlist product ${suffix}`, producer: '', characteristics: '', strength: '', price_primary: '240',
    alcoholic: false, beverage_color: 'none', filtration: 'none', active: true
  } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();

  const locationResponse = await page.request.post('/api/locations', { data: { name: `Playlist ${suffix}`, address: '', active: true } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();

  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data: {
    revision: editor.draft.revision,
    rows: [
      { id: 'real-preview-section', kind: 'section', name: 'НАСТОЯЩИЙ ЭКРАН PLAYLIST STUDIO', enabled: true },
      { id: 'real-preview-item', kind: 'item', product_id: product.id, promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
    ],
    settings: { background_color: '#123456', accent_color: '#F4C915', text_color: '#F8FAFC' },
    scene: {
      version: 1,
      elements: [{
        id: 'playlist-scene-text',
        type: 'text',
        enabled: true,
        x: 120,
        y: 120,
        width: 480,
        height: 160,
        z_index: 10,
        opacity: 1,
        rotation_deg: 0,
        text: {
          runs: [{ value: 'SCENE ELEMENT', font_family: 'system-sans', font_size_px: 64, font_weight: 700, italic: false, color: '#FFFFFF', opacity: 1, tracking_px: 0, leading_percent: 120, horizontal_scale_percent: 100, vertical_scale_percent: 100, baseline_shift_px: 0, text_transform: 'none' }],
          paragraph: { align: 'left', vertical_align: 'top', wrap: true },
          effects: { fill: { enabled: true, mode: 'solid', color: '#FFFFFF', opacity: 1 }, stroke: { enabled: false, width_px: 1, color: '#000000', opacity: 1 }, shadow: { enabled: false, offset_x_px: 0, offset_y_px: 4, blur_px: 12, color: '#000000', opacity: .5 }, glow: { enabled: false, blur_px: 18, spread_px: 0, color: '#FFFFFF', opacity: .5 } }
        }
      }]
    },
    screen: { location_id: location.id, name: screen.name, resolution: '1024×768', status: screen.status, active: screen.active }
  } });
  expect(saved.ok()).toBeTruthy();
  return { locationId: location.id, screenId: screen.id, productId: product.id };
}

async function removePreviewFixture(page, fixture) {
  await page.request.delete(`/api/screens/${fixture.screenId}`).catch(() => undefined);
  await page.request.delete(`/api/locations/${fixture.locationId}`).catch(() => undefined);
  await page.request.delete(`/api/catalog/products/${fixture.productId}`).catch(() => undefined);
}

test('Playlist Studio owns only Scene Playlist and preserves the screen motion profile', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);
  try {
    await page.goto(`/playlist?screen=${fixture.screenId}`);

    const previewPane = page.locator('.playlist-preview-pane');
    const inspector = page.locator('.playlist-inspector');
    await expect(previewPane).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('[data-animation-inspector-tab]')).toHaveCount(0);
    await expect(inspector.locator('[data-animation-inspector-panel="playlist"]')).toBeVisible();
    await expect(inspector.locator('.animation-object-manager')).toHaveCount(0);
    await expect(inspector.locator('#animation-item-effect')).toHaveCount(0);
    await expect(inspector.locator('#animation-intensity')).toHaveCount(0);
    await expect(inspector).not.toContainText('Аквариум');
    await expect(inspector).not.toContainText('Объявление');
    await expect(inspector).not.toContainText('Бренд');

    await expect(page.locator('#animation-screen-select')).toHaveValue(String(fixture.screenId));
    await expect(page.locator('#animation-stage [data-player-menu-layer] .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН PLAYLIST STUDIO');
    await expect(page.locator('#animation-stage')).toHaveClass(/player-scene-stage/);
    const stageGeometry = await page.locator('#animation-stage').evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        logicalWidth:node.clientWidth,
        logicalHeight:node.clientHeight,
        visualWidth:box.width,
        visualHeight:box.height,
        viewportWidth:Number(node.dataset.sceneViewportWidth),
        viewportHeight:Number(node.dataset.sceneViewportHeight),
        viewportScale:Number(node.dataset.sceneViewportScale)
      };
    });
    const svgBox = await page.locator('#animation-stage [data-player-menu-layer] svg.menu-table-svg').boundingBox();
    expect(svgBox).not.toBeNull();
    expect(stageGeometry.logicalWidth).toBe(1024);
    expect(stageGeometry.logicalHeight).toBe(768);
    expect(stageGeometry.viewportWidth).toBe(1024);
    expect(stageGeometry.viewportHeight).toBe(768);
    expect(stageGeometry.viewportScale).toBeGreaterThan(0);
    expect(stageGeometry.viewportScale).toBeLessThanOrEqual(1);
    expect(Math.abs(svgBox.width - stageGeometry.visualWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(svgBox.height - stageGeometry.visualHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(stageGeometry.visualWidth / stageGeometry.visualHeight - (1024 / 768))).toBeLessThan(0.01);
    const sceneElement = page.locator('#animation-stage [data-scene-element-id="playlist-scene-text"]');
    await expect(sceneElement).toBeVisible();
    await expect(inspector.locator('#animation-save')).toBeVisible();
    await expect(inspector.locator('#animation-apply-screens')).toBeVisible();
    await expect(inspector.locator('#animation-target-summary')).toContainText('1 монитор');

    const beforePlaylistEdit = await animationSettings(page, fixture.screenId);
    const playlistPanel = inspector.locator('[data-animation-inspector-panel="playlist"]');
    await expect(playlistPanel).toBeVisible();
    await expect(page.locator('.playlist-scene-strip')).toBeVisible();
    await expect(page.locator('.playlist-scene-card-menu')).toContainText('MenuScene');

    await playlistPanel.getByRole('button', { name: '+ PromoScene', exact: true }).click();
    await expect(page.locator('.playlist-scene-card-promo').last()).toBeVisible();
    await playlistPanel.getByLabel('Заголовок').fill('Пятничная акция');
    await playlistPanel.getByLabel('Текст').fill('Скидка 15% до закрытия');
    await playlistPanel.getByLabel('Режим показа').selectOption('fullscreen');
    await playlistPanel.getByRole('button', { name: '▶ Preview', exact: true }).click();

    const menuLayer = page.locator('#animation-stage [data-player-menu-layer]');
    await expect(menuLayer).toHaveClass(/scene-menu-suppressed/);
    await expect(page.locator('#animation-stage [data-player-content-layer] .scene-playlist-title')).toHaveText('Пятничная акция');
    await expect(sceneElement).toBeHidden();
    await page.locator('.playlist-scene-card-menu').click();
    await expect(menuLayer).not.toHaveClass(/scene-menu-suppressed/);
    await expect(sceneElement).toBeVisible();

    const saveResponse = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation/playlist') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await saveResponse).ok()).toBeTruthy();

    const saved = await animationSettings(page);
    expect(saved.profile).toEqual(original.profile);
    expect(saved.scene_playlist.enabled).toBe(true);
    expect(saved.scene_playlist.scenes.some((scene) =>
      scene.type === 'promo' && scene.title === 'Пятничная акция' && scene.mode === 'fullscreen'
    )).toBe(true);
    for (const legacy of ['entity','announcement','brand','environment','weather']) expect(legacy in saved).toBe(false);

    const applyResponse = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation/playlist/apply') && response.request().method() === 'PUT');
    await page.locator('#animation-apply-screens').click();
    const appliedResponse = await applyResponse;
    expect(appliedResponse.ok()).toBeTruthy();
    expect(appliedResponse.request().postDataJSON().screen_ids).toEqual([fixture.screenId]);

    const applied = await animationSettings(page, fixture.screenId);
    expect(applied.profile).toEqual(beforePlaylistEdit.profile);
    expect(applied.scene_playlist.scenes.some((scene) => scene.title === 'Пятничная акция')).toBe(true);
  } finally {
    if (!page.isClosed()) {
      await restoreAnimationSettings(page, original);
      await removePreviewFixture(page, fixture);
    }
  }
});

test('Scene Playlist preview rebinds to canonical Player layers after screen rerender', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  try {
    await page.goto(`/playlist?screen=${fixture.screenId}`);
    const panel = page.locator('[data-animation-inspector-panel="playlist"]');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '+ ContentScene', exact: true }).click();
    await panel.getByLabel('Заголовок').fill('Информация');
    await panel.getByLabel('Режим показа').selectOption('split');
    await panel.getByRole('button', { name: '▶ Preview', exact: true }).click();

    await expect(page.locator('#animation-stage [data-player-menu-layer]')).toHaveCount(1);
    await expect(page.locator('#animation-stage [data-player-content-layer] .scene-playlist-title')).toHaveText('Информация');

    const select = page.locator('#animation-screen-select');
    await select.selectOption(String(fixture.screenId));
    await expect(page.locator('#animation-stage [data-player-menu-layer]')).toHaveCount(1);
    await expect(page.locator('#animation-stage [data-player-content-layer]')).toHaveCount(1);
    await expect(page.locator('#animation-stage [data-player-fx-layer]')).toHaveCount(1);
  } finally {
    if (!page.isClosed()) await removePreviewFixture(page, fixture);
  }
});
