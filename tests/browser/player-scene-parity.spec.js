import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

function playerContext(version) {
  const second = version > 1;
  return {
    screen: { id: 1, name: 'ТВ 1', resolution: '1920x1080', location_id: 1, location_name: 'Точка 1', location_number: 1 },
    draft: { rows: [], settings: { background_color: '#123456' }, revision: 1 },
    products: [],
    packaging: [],
    animation: { enabled: false, profile: null },
    entity: null,
    announcement: null,
    brand: {
      enabled: true,
      text: second ? 'НОВЫЙ\nБРЕНД' : 'ПЕРВЫЙ\nБРЕНД',
      x: 960,
      y: 96,
      font_family: 'inter',
      font_size: 72,
      vertical_scale: 1,
      line_spacing: second ? -24 : -12,
      letter_spacing: 2,
      text_color: '#FFFFFF',
      glow_color: '#35D9FF',
      glow_strength: 18,
      entrance_effect: 'none',
      loop_effect: 'none',
      exit_effect: 'none',
      entrance_duration_ms: 900,
      exit_duration_ms: 550,
      letter_stagger_ms: 0,
      amplitude_px: 0,
      overshoot: 0,
      cycle_seconds: 5.5,
      effect: 'none'
    },
    environment: {
      enabled: true,
      effect: 'aquarium',
      parameters: {
        style: second ? 'neon' : 'premium',
        intro_fill: false,
        intensity: 45,
        fish_count: second ? 4 : 2,
        bubble_density: 0,
        plant_density: 0,
        caustics: 0,
        speed: 35
      }
    },
    refresh_interval_ms: 2000
  };
}

test('TV Player updates Brand and environment from the same live context owner', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  let requests = 0;
  try {
    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authorized: true,
        device_id: 1,
        device_key: 'device-key-scene-parity-123456',
        session_expires_at: new Date(Date.now() + 86400000).toISOString(),
        screen: { id: 1, name: 'ТВ 1', resolution: '1920x1080', location_id: 1, location_name: 'Точка 1', location_number: 1 }
      })
    }));
    await page.route('**/api/device/player-context', (route) => {
      requests += 1;
      const version = requests >= 2 ? 2 : 1;
      return route.fulfill({
        status: 200,
        headers: { ETag: `"scene-parity-${version}"` },
        contentType: 'application/json',
        body: JSON.stringify(playerContext(version))
      });
    });

    await page.goto('/player.html');

    const environment = page.locator('[data-player-environment-layer]');
    const brand = page.locator('[data-brand-layer] .scene-brand-title');
    await expect(environment).toHaveClass(/environment-effect-aquarium/);
    await expect(environment.locator('.aquarium-fish')).toHaveCount(2);
    await expect(brand.locator('.scene-brand-title-line')).toHaveCount(2);
    await expect(brand).toHaveAttribute('aria-label', 'ПЕРВЫЙ\nБРЕНД');
    expect(await brand.evaluate((node) => node.style.getPropertyValue('--brand-line-spacing'))).toBe('-0.625cqw');

    await expect.poll(() => requests, { timeout: 6000 }).toBeGreaterThanOrEqual(2);
    await expect(environment).toHaveClass(/aquarium-style-neon/);
    await expect(environment.locator('.aquarium-fish')).toHaveCount(4);
    await expect(brand).toHaveAttribute('aria-label', 'НОВЫЙ\nБРЕНД');
    expect(await brand.evaluate((node) => node.style.getPropertyValue('--brand-line-spacing'))).toBe('-1.25cqw');
  } finally {
    await context.close();
  }
});
