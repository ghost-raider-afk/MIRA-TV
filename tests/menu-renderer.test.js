import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg,
  formatProductMetadata,
  formatStrength,
  MENU_REFERENCE
} from '../src/web/admin-ui/public/js/editor/renderer.js';

const product = Object.freeze({
  id: 1,
  name: 'БАВАРИЯ ПШЕНИЧНОЕ',
  producer: 'ООО «Портал», п. Солнечный',
  strength: '4,6°',
  beverage_color: 'light',
  filtration: 'unfiltered',
  price_primary: '179',
  price_secondary: '268.50',
  active: true
});

function state(count = 4, scale = 100, fontFamily = 'arial-narrow') {
  return {
    settings: {
      background_color: '#101828',
      accent_color: '#F6C90E',
      text_color: '#F8FAFC',
      font_scale_percent: scale,
      font_family: fontFamily
    },
    rows: [
      { id: 'section', kind: 'section', name: 'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled: true },
      ...Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, kind: 'item', product_id: 1, enabled: true }))
    ]
  };
}

function rendered(count = 4, scale = 100, fontFamily = 'arial-narrow') {
  const model = buildRenderModel(state(count, scale, fontFamily), { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, { products: [product] });
  const layout = buildRenderLayout(model, lines);
  return { model, lines, layout, svg: buildTableSvg(model, lines, layout) };
}

test('canonical coordinates are the supplied TV Menu 1 1920x1080 reference', () => {
  assert.deepEqual({
    width: MENU_REFERENCE.width,
    height: MENU_REFERENCE.height,
    left: MENU_REFERENCE.tableX,
    right: MENU_REFERENCE.tableRight,
    widthTable: MENU_REFERENCE.tableWidth,
    top: MENU_REFERENCE.tableTop,
    bottom: MENU_REFERENCE.tableBottom,
    row: MENU_REFERENCE.rowHeight,
    secondaryPriceX: MENU_REFERENCE.secondaryPriceX
  }, {
    width: 1920,
    height: 1080,
    left: 56,
    right: 1430,
    widthTable: 1374,
    top: 15,
    bottom: 940,
    row: 53.5,
    secondaryPriceX: 1405
  });
});

test('second line is built from catalog producer, strength, color and filtration', () => {
  assert.equal(formatStrength('4,6°'), '4,6%');
  assert.equal(formatStrength('5.0'), '5.0%');
  assert.equal(formatStrength('4,2%'), '4,2%');
  assert.equal(formatProductMetadata(product), 'ООО «Портал», п. Солнечный · 4,6% · светлое · нефильтрованное');

  const { lines } = rendered();
  assert.equal(lines[1].metadata, 'ООО «Портал», п. Солнечный · 4,6% · светлое · нефильтрованное');
});

test('canonical SVG mirrors TV Menu 1 structure without vertical price separators', () => {
  const { svg, layout } = rendered();
  assert.match(svg, /viewBox="0 0 1920 1080"/);
  assert.equal(layout.horizontal.primaryPriceX, 1258);
  assert.equal(layout.horizontal.secondaryPriceX, 1405);
  assert.match(svg, /x1="65"[^>]*x2="1430"[^>]*class="separator"/);
  assert.doesNotMatch(svg, /<line[^>]*x1="1258"[^>]*y2=/);
  assert.doesNotMatch(svg, /<line[^>]*x1="1405"[^>]*y2=/);
  assert.match(svg, />1 л<\/text>/);
  assert.match(svg, />1,5 л<\/text>/);
  assert.match(svg, /class="table-section">\s*<rect[^>]*x="56"[^>]*width="1374"[^>]*rx="5"/);
  assert.match(svg, /class="item-name"[^>]*>БАВАРИЯ ПШЕНИЧНОЕ<\/text>/);
  assert.doesNotMatch(svg, /class="item-name"[^>]*4,6%/);
  assert.doesNotMatch(svg, /4,6°/);
  assert.match(svg, /class="item-meta"[^>]*>ООО «Портал», п\. Солнечный · 4,6% · светлое · нефильтрованное<\/text>/);
  assert.match(svg, /class="price"[^>]*text-anchor="end"/);
  assert.match(svg, />179<tspan/);
  assert.match(svg, />268<tspan/);
});

test('canonical SVG uses TV Menu 1 typography ratios and remains CSP-safe', () => {
  const { svg } = rendered();
  assert.doesNotMatch(svg, /<style[\s>]/i);
  assert.match(svg, /class="item-name"[^>]*font-size="26\.25"[^>]*fill="#F8FAFC"/);
  assert.match(svg, /class="item-meta"[^>]*font-size="14\.700000000000001"|class="item-meta"[^>]*font-size="14\.7"/);
  assert.match(svg, /class="section-title"[^>]*font-size="29\.400000000000002"|class="section-title"[^>]*font-size="29\.4"/);
  assert.match(svg, /class="separator"[^>]*stroke="#8B929A"[^>]*stroke-dasharray=/);
  assert.match(svg, /font-family="Arial Narrow, Liberation Sans Narrow, DejaVu Sans Condensed, Arial, sans-serif"/);
});

test('Tahoma Bold is a real renderer option and enforces bold text floor', () => {
  const { svg } = rendered(4, 100, 'tahoma-bold');
  assert.match(svg, /font-family="Tahoma, Arial, sans-serif"/);
  assert.match(svg, /class="item-meta"[^>]*font-weight="700"/);
});

test('font scale automatically reduces to fit but respects manual maximum', () => {
  const { layout } = rendered(20, 100);
  assert.equal(layout.vertical.fits, true);
  assert.equal(layout.vertical.autoReduced, true);
  assert.ok(layout.vertical.effectivePercent < 100);
  assert.ok(layout.vertical.effectivePercent >= MENU_REFERENCE.fontScaleMinPercent);

  const manual = rendered(4, 82).layout;
  assert.equal(manual.vertical.effectivePercent, 82);
  assert.equal(manual.vertical.autoReduced, false);
});

test('menu that cannot fit even at minimum scale is explicitly rejected by layout', () => {
  const { layout } = rendered(50, 130);
  assert.equal(layout.vertical.effectivePercent, MENU_REFERENCE.fontScaleMinPercent);
  assert.equal(layout.vertical.fits, false);
});
