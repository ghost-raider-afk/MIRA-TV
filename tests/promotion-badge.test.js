import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDisplayLines, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);

test('promotion badge remains one SVG object and promo uses a full-row soft glow', () => {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { id: 'section', kind: 'section', name: 'Меню', enabled: true },
      {
        id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360',
        promotion: true, promotion_text: 'АКЦИЯ', promotion_animation: 'gloss', promotion_badge_animation: 'shine', enabled: true
      }
    ]
  }, { width: 1920, height: 1080 });

  const lines = buildDisplayLines(model);
  const svg = buildTableSvg(model, lines);
  const rowStart = svg.indexOf('<g class="table-item');
  const badgeStart = svg.indexOf('<g class="promotion-badge"', rowStart);
  const badgeEnd = svg.indexOf('<g class="table-item-content">', badgeStart);
  const pricesStart = svg.indexOf('<g class="table-item-prices">', rowStart);
  const rowEnd = svg.indexOf('</g>', pricesStart);
  const badge = badgeStart >= 0 && badgeEnd > badgeStart ? svg.slice(badgeStart, badgeEnd) : '';

  assert.ok(rowStart >= 0, 'whole item row must exist');
  assert.ok(badge, 'promotion-badge group must exist');
  assert.match(badge, /fill="url\(#mira-promo-badge-depth\)"/);
  assert.match(badge, /filter="url\(#mira-promo-badge-depth-shadow\)"/);
  assert.equal((badge.match(/<path\b/g) || []).length, 1, 'canonical promotion badge must keep one shape path');
  assert.match(badge, /data-promotion-badge-shape="base"/);
  assert.match(badge, /mira-promo-badge-bevel/);
  const promotionText = badge.match(/<text\b[^>]*class="promotion"[^>]*>/)?.[0] || '';
  assert.ok(promotionText, 'promotion text must exist');
  assert.ok(Number(promotionText.match(/font-size="([^"]+)"/)?.[1] || 0) >= 15);
  assert.ok(Number(promotionText.match(/font-weight="([^"]+)"/)?.[1] || 0) >= 900);
  assert.match(promotionText, /transform="[^"]*scale\(1 1[.]12\)[^"]*"/);
  const promoGlowStart = svg.indexOf('id="mira-promo-row-glow"');
  const promoGlowEnd = svg.indexOf('</linearGradient>', promoGlowStart);
  const promoGlowDefinition = promoGlowStart >= 0 && promoGlowEnd > promoGlowStart ? svg.slice(promoGlowStart, promoGlowEnd) : '';
  assert.ok(promoGlowDefinition.includes('stop-opacity="0.72"'));
  assert.match(badge, /<text\b[^>]*class="promotion"[^>]*>АКЦИЯ<\/text>/);
  assert.match(svg, /class="promotion-badge-glow" data-promotion-badge-animation="shine" opacity="0"/);
  assert.match(svg, /class="promotion-badge-effects-clip"[^>]*clip-path="url\(#mira-promo-badge-clip-/);
  assert.match(svg, /class="promotion-badge-shine" data-promotion-badge-animation="shine" data-promotion-travel=/);
  assert.match(svg, /class="promotion-badge-sparkle" data-promotion-badge-animation="shine" data-promotion-travel=/);
  assert.match(svg, /class="promotion-row-glow" data-promotion-row-animation="gloss"/);
  assert.match(svg, /id="mira-promo-row-glow"/);
  assert.match(svg, /id="mira-promo-badge-shine"/);
  assert.match(svg, /id="mira-promo-badge-sparkle"/);
  assert.match(svg, /clipPath id="mira-promo-badge-clip-/);
  assert.match(svg, /clipPath id="mira-promo-row-clip-[^"]+" clipPathUnits="userSpaceOnUse"/);
  assert.match(svg, /class="promotion-row-clip"[^>]*clip-path="url\(#mira-promo-row-clip-[^)]+\)"[^>]*><g class="promotion-row-glow"/);
  assert.doesNotMatch(svg, /class="promotion-row-glow"[^>]*clip-path=/);
  assert.match(svg, /mira-promo-row-clip-[^"]+"[^>]*><rect x="56"[^>]*width="1374"[^>]*height="/);
  assert.ok(badgeStart > rowStart && pricesStart > rowStart && rowEnd > pricesStart, 'badge, content and prices must stay inside the same table-item row');

  const metadataLines = lines.map((line) => line.kind === 'item' ? { ...line, metadata:'Производитель • 4,5% • светлое' } : line);
  const metadataSvg = buildTableSvg(model, metadataLines);
  const promotionY = Number(metadataSvg.match(/<text\b[^>]*y="([^"]+)"[^>]*class="promotion"/)?.[1] || NaN);
  const itemNameY = Number(metadataSvg.match(/<text\b[^>]*y="([^"]+)"[^>]*class="item-name"/)?.[1] || NaN);
  assert.ok(Number.isFinite(promotionY) && Number.isFinite(itemNameY), 'promotion and title baselines must be measurable');
  assert.ok(Math.abs(promotionY - itemNameY) < 0.001, 'promotion badge text must share the product title baseline');

  for (const shape of ['base','capsule','cut','chevron','tag']) {
    const shaped = buildRenderModel({
      settings:{ promotion_badge_shape:shape, promotion_font_family:'tahoma-bold', promotion_font_size_percent:125, promotion_font_weight:800, promotion_font_height_percent:124, promotion_letter_spacing_px:2 },
      rows:[
        { id:'section', kind:'section', name:'Меню', enabled:true },
        { id:'item', kind:'item', name:'Тест', promotion:true, promotion_text:'АКЦИЯ', enabled:true }
      ]
    }, { width:1920, height:1080 });
    const shapedSvg = buildTableSvg(shaped, buildDisplayLines(shaped));
    assert.match(shapedSvg, new RegExp(`data-promotion-badge-shape="${shape}"`));
    assert.match(shapedSvg, /font-family="Tahoma, Arial, sans-serif"/);
    assert.match(shapedSvg, /font-weight="800"/);
  }
});

test('DOM scene graph animates light surfaces while row text and prices remain static', async () => {
  const [adapter, plan, driver, renderer] = await Promise.all([
    readFile(new URL('js/motion/dom-scene-adapter.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/motion-plan.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/drivers/wasm-motion-driver.js', publicRoot), 'utf8'),
    readFile(new URL('js/editor/renderer-svg.js', publicRoot), 'utf8')
  ]);

  assert.match(adapter, /row-motion-surface-item/);
  assert.match(adapter, /transformOwner: 'surface'/);
  assert.match(adapter, /surfaceOnly: true/);
  assert.match(adapter, /g\.promotion-badge-glow/);
  assert.match(adapter, /g\.promotion-badge-shine/);
  assert.match(adapter, /g\.promotion-badge-sparkle/);
  assert.doesNotMatch(adapter, /querySelectorAll\('g\.promotion-badge'\)/);
  assert.match(adapter, /g\.promotion-row-glow/);
  assert.match(adapter, /promotionBadgeAnimation/);
  assert.match(adapter, /promotionRowAnimation/);
  assert.doesNotMatch(adapter, /querySelectorAll\('g\.table-item, g\.table-packaging'\)/);
  assert.doesNotMatch(adapter, /kind: 'price'/);
  assert.doesNotMatch(adapter, /menu\.price/);
  assert.match(plan, /menuTextStatic: true/);
  assert.match(plan, /procedural:/);
  assert.doesNotMatch(plan, /keyframes:/);
  assert.match(driver, /requestAnimationFrame/);
  assert.match(driver, /spec\.surfaceOnly/);
  assert.match(driver, /spec\.kind === 'promo-badge-glow'/);
  assert.match(driver, /spec\.kind === 'promo-badge-shine'/);
  assert.match(driver, /spec\.kind === 'promo-badge-sparkle'/);
  assert.match(driver, /spec\.kind === 'promo-glow'/);
  assert.match(driver, /spec\.animation === 'fill'/);
  assert.match(driver, /spec\.animation === 'gloss'/);
  assert.match(driver, /spec\.animation === 'pulse'/);
  assert.match(driver, /spec\.animation === 'runner'/);
  assert.doesNotMatch(driver, /spec\.kind === 'promo-badge'/);
  assert.doesNotMatch(driver, /_mira_promo_scale\(/);
  assert.doesNotMatch(driver, /_mira_promo_wave_progress/);
  assert.match(renderer, /row-motion-surface/);
  assert.match(renderer, /<g class="table-item tone-/);
  assert.match(renderer, /<g class="table-item-prices">/);
});
