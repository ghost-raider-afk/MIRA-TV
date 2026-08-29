import { test, expect } from '@playwright/test';

const PROMO_PROFILE = {
  motion_version: 3,
  pattern: 'cinematic', flow_direction: 'alternate', easing: 'cinematic', cycle_seconds: 8,
  event_duration_ms: 6500, wave_stagger_ms: 160, travel_px: 24, scale_amount: 0.04,
  brightness_amount: 0.24, section_effect: 'cinematic', item_effect: 'cinematic', price_effect: 'none', intensity: 80,
  promotion_effect: 'cinematic', promotion_intensity: 100, promotion_cycle_seconds: 4.5,
  promotion_event_duration_ms: 1800, promotion_travel_px: 0, promotion_scale_amount: 0.06,
  promotion_brightness_amount: 0.35, promotion_glow_radius: 28, promotion_easing: 'smooth'
};

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function animationSettings(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/animation', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`playlist settings GET failed: ${response.status}`);
    return response.json();
  });
}

async function restoreAnimationSettings(page, settings) {
  await page.evaluate(async (payload) => {
    const response = await fetch('/api/settings/animation', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`playlist settings restore failed: ${response.status}`);
  }, {
    enabled: settings.enabled, preset_id: settings.preset_id, profile: settings.profile,
    entity: settings.entity, announcement: settings.announcement, brand: settings.brand, environment: settings.environment,
    scene_playlist: settings.scene_playlist
  });
}

async function createPreviewFixture(page) {
  return page.evaluate(async () => {
    async function request(url, init = {}) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        ...init
      });
      if (!response.ok) throw new Error(`${init.method || 'GET'} ${url} failed: ${response.status}`);
      return response.status === 204 ? null : response.json();
    }
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const product = await request('/api/catalog/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Playlist product ${suffix}`, producer: '', characteristics: '', strength: '', price_primary: '240',
        alcoholic: false, beverage_color: 'none', filtration: 'none', active: true
      })
    });
    const location = await request('/api/locations', { method: 'POST', body: JSON.stringify({ name: `Playlist ${suffix}`, address: '', active: true }) });
    const screen = await request(`/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
    const editor = await request(`/api/screens/${screen.id}/editor`);
    await request(`/api/screens/${screen.id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        revision: editor.draft.revision,
        rows: [
          { id: 'real-preview-section', kind: 'section', name: 'НАСТОЯЩИЙ ЭКРАН PLAYLIST STUDIO', enabled: true },
          { id: 'real-preview-item', kind: 'item', product_id: product.id, promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
        ],
        settings: { background_color: '#123456', accent_color: '#F4C915', text_color: '#F8FAFC' }
      })
    });
    return { locationId: location.id, screenId: screen.id, productId: product.id };
  });
}

async function removePreviewFixture(page, fixture) {
  await page.evaluate(async ({ screenId, locationId, productId }) => {
    await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/catalog/products/${productId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
  }, fixture);
}

test('Playlist Studio keeps MenuScene stable and edits temporary scenes through one workspace', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);
  try {
    await page.goto(`/playlist.html?screen=${fixture.screenId}`);
    const previewPane = page.locator('.playlist-preview-pane');
    const inspector = page.locator('.playlist-inspector');
    const [previewBox, inspectorBox] = await Promise.all([previewPane.boundingBox(), inspector.boundingBox()]);
    expect(previewBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(previewBox.x).toBeLessThan(inspectorBox.x);
    await expect(inspector.locator('.animation-inspector-tabs')).toContainText('Меню');
    await expect(inspector.locator('.animation-inspector-tabs')).toContainText('Текст');
    await expect(inspector.locator('.animation-inspector-tabs')).toContainText('Сцена');
    await expect(inspector.locator('.animation-inspector-tabs')).toContainText('Плейлист');
    await expect(inspector.locator('.animation-inspector-actions #animation-save')).toBeVisible();
    await expect(inspector.locator('.animation-inspector-actions #animation-apply-screens')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Плейлист', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '«Акция»' })).toBeVisible();
    await expect(page.getByText('ФОН · БЕЗ ИЗМЕНЕНИЙ')).toBeVisible();
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН PLAYLIST STUDIO');

    if (!(await page.locator('#animation-enabled').isChecked())) await page.locator('#animation-enabled').check();
    await page.locator('#animation-item-effect').selectOption('cinematic');
    await page.locator('#animation-promotion-effect').selectOption('cinematic');
    await page.locator('#animation-intensity').fill('82');
    await expect(page.locator('#animation-intensity-output')).toHaveText('82%');
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-motion-mode', 'wasm-continuous');

    const row = page.locator('#animation-stage g.table-item').first();
    const surface = row.locator(':scope > .row-motion-surface-item');
    const content = row.locator(':scope > g.table-item-content');
    const prices = row.locator(':scope > g.table-item-prices');
    const badge = row.locator(':scope > g.promotion-badge');
    const glow = row.locator(':scope > g.promotion-row-glow');
    await expect(row).not.toHaveAttribute('data-motion', /.+/);
    await expect(surface).toHaveAttribute('data-motion', 'item');
    await expect(surface).toHaveAttribute('data-motion-transform-owner', 'surface');
    await expect(badge).toHaveAttribute('data-motion', 'promotion');
    await expect(glow).toHaveAttribute('data-motion', 'promotion-glow');
    await expect(content).not.toHaveAttribute('data-motion', /.+/);
    await expect(prices).not.toHaveAttribute('data-motion', /.+/);
    await expect.poll(() => surface.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
    await expect.poll(() => glow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0);
    await expect(row).toHaveCSS('transform', 'none');
    expect(await surface.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await badge.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await page.locator('#animation-stage .animation-screen-background').evaluate((node) => node.getAnimations().length)).toBe(0);

    const before = await content.boundingBox();
    await page.waitForTimeout(450);
    const after = await content.boundingBox();
    expect(Math.abs((after?.x || 0) - (before?.x || 0))).toBeLessThan(0.1);
    expect(Math.abs((after?.y || 0) - (before?.y || 0))).toBeLessThan(0.1);

    const textTab = inspector.locator('[data-animation-inspector-tab="text"]');
    await textTab.click();
    await expect(textTab).toHaveClass(/active/);
    await page.locator('#animation-announcement-enabled').check();
    await page.locator('#animation-announcement-text').fill('Сегодня специальное предложение до 22:00');
    await page.locator('#animation-announcement-font-family').selectOption('oswald');
    await page.locator('#animation-announcement-vertical-scale').fill('1.35');
    await page.locator('#animation-announcement-glow-enabled').check();
    await expect(page.locator('#animation-stage .scene-announcement-text')).toHaveText('Сегодня специальное предложение до 22:00');
    await expect(page.locator('#animation-stage .scene-announcement')).toHaveClass(/has-glow/);

    await page.locator('#animation-brand-enabled').check();
    await page.locator('#animation-brand-text').fill('БАР\nМАЯК');
    await page.locator('#animation-brand-x').fill('300');
    await page.locator('#animation-brand-y').fill('120');
    await page.locator('#animation-brand-line-spacing').fill('-18');
    await page.locator('#animation-brand-effect').selectOption('neon-pulse');
    await expect(page.locator('#animation-stage .scene-brand-title-line')).toHaveCount(2);
    await expect(page.locator('#animation-brand-line-spacing-output')).toHaveText('-18 px');

    const sceneTab = inspector.locator('[data-animation-inspector-tab="scene"]');
    await sceneTab.click();
    await expect(sceneTab).toHaveClass(/active/);
    await page.locator('#animation-aquarium-enabled').check();
    await page.locator('#animation-aquarium-style').selectOption('neon');
    await page.locator('#animation-aquarium-fish-count').fill('4');
    const environmentLayer = page.locator('#animation-stage [data-environment-layer]');
    await expect(environmentLayer).toHaveClass(/animation-screen-environment-layer/);
    await expect(environmentLayer).toHaveClass(/environment-effect-aquarium/);
    await expect(page.locator('#animation-stage .aquarium-fish')).toHaveCount(4);
    await expect(page.locator('#animation-stage .animation-screen-background')).toHaveCSS('background-color', 'rgb(18, 52, 86)');

    const playlistTab = inspector.locator('[data-animation-inspector-tab="playlist"]');
    await playlistTab.click();
    await expect(playlistTab).toHaveClass(/active/);
    const playlistPanel = inspector.locator('[data-animation-inspector-panel="playlist"]');
    await expect(page.locator('.playlist-scene-strip')).toBeVisible();
    await expect(page.locator('.playlist-scene-card-menu')).toContainText('MenuScene');
    await playlistPanel.getByRole('button', { name: '+ PromoScene', exact: true }).click();
    await expect(page.locator('.playlist-scene-card-promo').last()).toBeVisible();
    await playlistPanel.getByLabel('Заголовок').fill('Пятничная акция');
    await playlistPanel.getByLabel('Текст').fill('Скидка 15% до закрытия');
    await playlistPanel.getByLabel('Режим показа').selectOption('fullscreen');
    await playlistPanel.getByRole('button', { name: '▶ Preview', exact: true }).click();
    await expect(page.locator('#animation-stage [data-scene-menu-layer]')).toHaveClass(/scene-menu-suppressed/);
    await page.locator('.playlist-scene-card-menu').click();
    await expect(page.locator('#animation-stage [data-scene-menu-layer]')).not.toHaveClass(/scene-menu-suppressed/);

    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await responsePromise).ok()).toBeTruthy();
    const saved = await animationSettings(page);
    expect(saved.preset_id).toBe('cinematic-live-menu');
    expect(saved.profile.price_effect).toBe('none');
    expect(saved.profile.promotion_effect).toBe('cinematic');
    expect(saved.profile.promotion_easing).toBe('smooth');
    expect(saved.profile.intensity).toBe(82);
    expect(saved.announcement.font_family).toBe('oswald');
    expect(saved.announcement.vertical_scale).toBe(1.35);
    expect(saved.announcement.glow_enabled).toBe(true);
    expect(saved.brand.text).toBe('БАР\nМАЯК');
    expect(saved.brand.x).toBe(300);
    expect(saved.brand.line_spacing).toBe(-18);
    expect(saved.environment.enabled).toBe(true);
    expect(saved.environment.effect).toBe('aquarium');
    expect(saved.environment.parameters.style).toBe('neon');
    expect(saved.environment.parameters.fish_count).toBe(4);
    expect(saved.scene_playlist.enabled).toBe(true);
    expect(saved.scene_playlist.scenes.some((scene) => scene.type === 'promo' && scene.title === 'Пятничная акция' && scene.mode === 'fullscreen')).toBe(true);
  } finally {
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});

test('promotion badge and soft row glow are isolated from static row content', async ({ page }) => {
  await login(page);
  await page.goto('/playlist.html');
  const result = await page.evaluate(async (profile) => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }] = await Promise.all([
      import('/js/motion/screen-preview.js'), import('/js/motion/preview-player.js')
    ]);
    const stage = document.createElement('div');
    stage.className = 'animation-stage'; stage.style.width = '960px'; document.body.append(stage);
    renderAnimationScreenPreview(stage, {
      screen: { id: 999999, resolution: '1920x1080' },
      draft: { rows: [
        { id: 'section', kind: 'section', name: 'ПРОВЕРКА АКЦИИ', enabled: true },
        { id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360', promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
      ], settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' } }, products: [], packaging: []
    });
    const player = new AnimationPreviewPlayer({ stage });
    player.restart(profile);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const row = stage.querySelector('g.table-item');
    const surface = row?.querySelector(':scope > .row-motion-surface-item');
    const content = row?.querySelector(':scope > g.table-item-content');
    const prices = row?.querySelector(':scope > g.table-item-prices');
    const badge = row?.querySelector(':scope > g.promotion-badge');
    const glow = row?.querySelector(':scope > g.promotion-row-glow');
    const snapshot = {
      rowMotion: row?.dataset.motion || '', surfaceMotion: surface?.dataset.motion || '',
      contentMotion: content?.dataset.motion || '', pricesMotion: prices?.dataset.motion || '',
      badgeMotion: badge?.dataset.motion || '', glowMotion: glow?.dataset.motion || '',
      rowTransform: row ? getComputedStyle(row).transform : 'none', surfaceTransform: surface ? getComputedStyle(surface).transform : 'none',
      badgeTransform: badge ? getComputedStyle(badge).transform : 'none', glowOpacity: glow ? Number.parseFloat(getComputedStyle(glow).opacity) : 0,
      surfaceAnimations: surface?.getAnimations().length ?? -1, badgeAnimations: badge?.getAnimations().length ?? -1
    };
    player.destroy(); stage.remove(); return snapshot;
  }, PROMO_PROFILE);
  expect(result.rowMotion).toBe('');
  expect(result.surfaceMotion).toBe('item');
  expect(result.contentMotion).toBe('');
  expect(result.pricesMotion).toBe('');
  expect(result.badgeMotion).toBe('promotion');
  expect(result.glowMotion).toBe('promotion-glow');
  expect(result.rowTransform).toBe('none');
  expect(result.surfaceTransform).not.toBe('none');
  expect(result.badgeTransform).not.toBe('none');
  expect(result.glowOpacity).toBeGreaterThanOrEqual(0);
  expect(result.surfaceAnimations).toBe(0);
  expect(result.badgeAnimations).toBe(0);
});

test('preview player rebinds scene targets after preview DOM replacement', async ({ page }) => {
  await login(page);
  await page.goto('/playlist.html');
  const result = await page.evaluate(async (profile) => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }] = await Promise.all([
      import('/js/motion/screen-preview.js'), import('/js/motion/preview-player.js')
    ]);
    const stage = document.createElement('div'); stage.className = 'animation-stage'; stage.style.width = '960px'; document.body.append(stage);
    const player = new AnimationPreviewPlayer({ stage });
    const bundle = (name) => ({
      screen: { id: 999998, resolution: '1920x1080' },
      draft: { rows: [
        { id: `section-${name}`, kind: 'section', name: 'ПРОВЕРКА REBIND', enabled: true },
        { id: `item-${name}`, kind: 'item', name, price_primary: '240', price_secondary: '360', promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
      ], settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' } }, products: [], packaging: []
    });
    renderAnimationScreenPreview(stage, bundle('ПЕРВАЯ ПОЗИЦИЯ')); player.restart(profile);
    const firstTarget = player.scene.node('menu.promotion.0')?.target;
    renderAnimationScreenPreview(stage, bundle('ВТОРАЯ ПОЗИЦИЯ'));
    const currentBadge = stage.querySelector('g.promotion-badge');
    player.restart(profile);
    const reboundTarget = player.scene.node('menu.promotion.0')?.target;
    const snapshot = { oldInStage: stage.contains(firstTarget), targetChanged: firstTarget !== reboundTarget, reboundIsCurrent: reboundTarget === currentBadge, reboundMotion: reboundTarget?.dataset.motion || '' };
    player.destroy(); stage.remove(); return snapshot;
  }, PROMO_PROFILE);
  expect(result.oldInStage).toBe(false);
  expect(result.targetChanged).toBe(true);
  expect(result.reboundIsCurrent).toBe(true);
  expect(result.reboundMotion).toBe('promotion');
});
