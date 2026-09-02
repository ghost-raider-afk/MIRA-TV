import { expect, test } from '@playwright/test';

const presets = ['menu-board', 'bistro', 'cafe', 'chalkboard'];

test('new menu presets render distinct layouts through the shared Scene renderer', async ({ page }) => {
  await page.goto('/signin.html');
  await page.evaluate(async (presetValues) => {
    const { createSceneElementNode } = await import('/js/scene-runtime/renderer.js');
    document.body.replaceChildren();
    document.body.style.cssText = 'margin:0;padding:24px;background:#20252d;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px';

    const scene = { canvas_width: 1920, canvas_height: 1080 };
    const catalogItems = [
      { id: 1, name: 'Стейк из лосося', class_code: 'main_dish', class_name: 'Горячее', pricing_model: 'fixed', base_price: 890, base_quantity: 1, unit: 'порц.', description: 'С овощами гриль', attributes: {}, active: true },
      { id: 2, name: 'Тирамису', class_code: 'dessert', class_name: 'Десерт', pricing_model: 'fixed', base_price: 390, base_quantity: 1, unit: 'шт.', description: 'Классический итальянский десерт', attributes: {}, active: true },
      { id: 3, name: 'Капучино', class_code: 'coffee', class_name: 'Кофе', pricing_model: 'fixed', base_price: 260, base_quantity: 1, unit: 'шт.', description: 'Двойной эспрессо и молочная пена', attributes: {}, active: true }
    ];

    for (const preset of presetValues) {
      const fixture = document.createElement('section');
      fixture.dataset.fixture = preset;
      fixture.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;overflow:hidden';
      const element = {
        id: `table-${preset}`,
        type: 'table',
        x: 80,
        y: 80,
        width: 1760,
        height: 920,
        z_index: 1,
        opacity: 1,
        content: preset === 'cafe' ? 'Кафе · Завтраки' : 'Основное меню',
        style: { color: '#ffffff', font_size: 58, font_weight: 600, background: 'rgba(0,0,0,.18)', radius: 12, border_width: 0, border_color: '#ffffff', text_align: 'left', vertical_align: 'top', line_height: 1.06, letter_spacing: 0 },
        effects: { shadow: false, glow: false, blur: 0 },
        animation: { entrance: 'none', loop: 'none', exit: 'none', duration_ms: 600 },
        table: {
          price_layout: 'single',
          show_description: true,
          show_metadata: true,
          active_only: true,
          row_limit: 12,
          appearance: { preset, density: 'comfortable', header_style: 'subtle', price_style: 'accent', accent_color: '#f4c915', show_title: true, row_dividers: true, zebra: false }
        }
      };
      fixture.append(createSceneElementNode(element, scene, { catalogStatus: 'ready', catalogItems, stageWidth: 960 }));
      document.body.append(fixture);
    }
  }, presets);

  for (const preset of presets) {
    const fixture = page.locator(`[data-fixture="${preset}"]`);
    await expect(fixture.locator(`table[data-preset="${preset}"]`)).toBeVisible();
    await expect(fixture.locator('.scene-catalog-product-name')).toHaveCount(3);
    await expect(fixture.locator('.scene-catalog-product-meta')).toHaveCount(3);
    await expect(fixture.locator('tbody .scene-catalog-price')).toHaveCount(3);
  }

  await expect(page.locator('[data-fixture="menu-board"] .scene-catalog-product-leader').first()).toHaveCSS('display', 'block');
  await expect(page.locator('[data-fixture="bistro"] table')).toHaveCSS('font-family', /Georgia/);
  await expect(page.locator('[data-fixture="cafe"] table')).toHaveCSS('background-color', 'rgb(75, 48, 36)');
  await expect(page.locator('[data-fixture="chalkboard"] table')).toHaveCSS('background-color', 'rgb(21, 27, 24)');
});
