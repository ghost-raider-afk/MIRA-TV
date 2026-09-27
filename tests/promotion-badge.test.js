import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisplayLines, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

test('promotion badge is static SVG geometry without motion layers or filters', () => {
  const model = buildRenderModel({
    settings:{ promotion_badge_shape:'base', promotion_font_weight:900 },
    rows:[
      { id:'section', kind:'section', name:'Меню', enabled:true },
      { id:'item', kind:'item', name:'Тест', price_primary:'240', price_secondary:'360', promotion:true, promotion_text:'АКЦИЯ', enabled:true }
    ]
  }, { width:1920, height:1080 });
  const svg = buildTableSvg(model, buildDisplayLines(model));
  assert.match(svg, /class="promotion-badge"/);
  assert.match(svg, /fill="url\(#mira-promo-badge-depth\)"/);
  assert.match(svg, /mira-promo-badge-bevel/);
  assert.match(svg, /class="promotion"[^>]*>АКЦИЯ<\/text>/);
  assert.doesNotMatch(svg, /promotion-badge-shine|promotion-badge-sparkle|promotion-row-glow|data-promotion-.*animation/);
  assert.doesNotMatch(svg, /<filter|feGaussianBlur|feDropShadow/);
});

test('approved promotion badge shapes remain available as static geometry', () => {
  for (const shape of ['base','capsule','cut','chevron','tag']) {
    const model = buildRenderModel({
      settings:{ promotion_badge_shape:shape },
      rows:[{id:'section',kind:'section',name:'Меню',enabled:true},{id:'item',kind:'item',name:'Тест',promotion:true,promotion_text:'АКЦИЯ',enabled:true}]
    }, { width:1920,height:1080 });
    assert.ok(buildTableSvg(model, buildDisplayLines(model)).includes('data-promotion-badge-shape="' + shape + '"'));
  }
});
