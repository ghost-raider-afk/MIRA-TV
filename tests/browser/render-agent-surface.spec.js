import { test, expect } from '@playwright/test';

test('Render Agent surface uses the shared PlayerSceneRenderer and supports deterministic seek', async ({ page }) => {
  const renderPackage = {
    protocol_version: 1,
    renderer_version: 'test',
    render_revision: 7,
    input_hash: 'a'.repeat(64),
    bake_supported: true,
    unsupported_reason: '',
    screen: {
      id: 42,
      name: 'Render Agent test',
      resolution: '1920x1080',
      width: 1920,
      height: 1080
    },
    draft: {
      revision: 3,
      rows: [],
      settings: {
        background_color: '#123456',
        accent_color: '#f4c915',
        text_color: '#ffffff'
      }
    },
    products: [],
    packaging: [],
    scene: {
      version: 1,
      elements: [{
        id: 'render-agent-title',
        type: 'text',
        enabled: true,
        x: 200,
        y: 120,
        width: 900,
        height: 220,
        z_index: 5,
        opacity: 1,
        rotation_deg: 0,
        text: {
          runs: [{
            value: 'RENDER AGENT',
            font_family: 'system-sans',
            font_size_px: 86,
            font_weight: 800,
            color: '#ffffff'
          }],
          paragraph: { align: 'left', vertical_align: 'center', wrap: true },
          effects: { fill: { enabled: true, mode: 'solid', color: '#ffffff', opacity: 1 } }
        }
      }]
    },
    animation: { enabled: false, profile: null },
    scene_playlist: null,
    target: {
      container: 'mp4',
      codec: 'h264',
      pixel_format: 'yuv420p',
      fps: 25,
      loop_duration_ms: 12000,
      audio: false
    },
    live_overlays: {
      weather: [{
        id: 'excluded-weather',
        type: 'weather',
        enabled: true,
        x: 1400,
        y: 80,
        width: 420,
        height: 300
      }]
    },
    source_assets: []
  };

  await page.route('**/api/render-agent/context?token=surface-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(renderPackage)
    })
  );

  await page.goto('/render-agent.html?token=surface-test', { waitUntil: 'domcontentloaded' });

  await expect.poll(() => page.evaluate(() => window.__miraRenderSurface?.ready === true)).toBe(true);
  await expect(page.locator('[data-scene-element-id="render-agent-title"]')).toContainText('RENDER AGENT');
  await expect(page.locator('[data-scene-element-type="weather"]')).toHaveCount(0);

  const surface = await page.evaluate(async () => {
    await window.__miraRenderSurface.seek(3000);
    return {
      width: window.__miraRenderSurface.width,
      height: window.__miraRenderSurface.height,
      fps: window.__miraRenderSurface.fps,
      durationMs: window.__miraRenderSurface.durationMs,
      inputHash: window.__miraRenderSurface.inputHash
    };
  });
  expect(surface).toEqual({
    width: 1920,
    height: 1080,
    fps: 25,
    durationMs: 12000,
    inputHash: 'a'.repeat(64)
  });

  const stage = page.locator('[data-render-agent-stage]');
  await expect(stage).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  const geometry = await stage.evaluate((node) => ({
    width: node.style.width,
    height: node.style.height,
    scale: node.dataset.sceneViewportScale
  }));
  expect(geometry.width).toBe('1920px');
  expect(geometry.height).toBe('1080px');
  expect(Number(geometry.scale)).toBeCloseTo(1, 5);
});
