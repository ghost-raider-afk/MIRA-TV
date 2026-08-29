import { test, expect } from '@playwright/test';

test('unchanged Player Context does not restart an active Scene Playlist timeline', async ({ page }) => {
  await page.goto('/signin.html');
  const result = await page.evaluate(async () => {
    const { ScenePlaylistRuntime } = await import('/js/motion/scene-playlist-runtime.js');
    const host = document.createElement('div');
    const menuLayer = document.createElement('div');
    const fxLayer = document.createElement('div');
    const contentLayer = document.createElement('div');
    host.append(menuLayer, fxLayer, contentLayer);
    document.body.append(host);

    const runtime = new ScenePlaylistRuntime();
    const playlist = {
      enabled: true,
      menu_duration_seconds: 40,
      scenes: [{ id: 'promo-1', type: 'promo', enabled: true, mode: 'overlay', duration_seconds: 8, title: 'Акция', body: '' }]
    };

    runtime.render(playlist, { menuLayer, contentLayer, fxLayer, autoplay: true });
    const firstTimer = runtime.timer;
    const firstGeneration = runtime.generation;

    runtime.render(structuredClone(playlist), { menuLayer, contentLayer, fxLayer, autoplay: true });
    const unchanged = {
      sameTimer: runtime.timer === firstTimer,
      sameGeneration: runtime.generation === firstGeneration,
      playbackActive: runtime.playbackActive
    };

    runtime.render({ ...playlist, menu_duration_seconds: 45 }, { menuLayer, contentLayer, fxLayer, autoplay: true });
    const changed = {
      timerChanged: runtime.timer !== firstTimer,
      generationAdvanced: runtime.generation > firstGeneration
    };

    runtime.destroy();
    host.remove();
    return { unchanged, changed };
  });

  expect(result.unchanged.sameTimer).toBe(true);
  expect(result.unchanged.sameGeneration).toBe(true);
  expect(result.unchanged.playbackActive).toBe(true);
  expect(result.changed.timerChanged).toBe(true);
  expect(result.changed.generationAdvanced).toBe(true);
});
