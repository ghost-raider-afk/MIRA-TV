import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisplayLines, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

test('packaging keeps two positions per row without card-style containers', () => {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { id: 'section', kind: 'section', name: 'Тара', enabled: true },
      { id: 'pack-1', kind: 'packaging', name: 'Бутылка ПЭТ 1 л', unit_price: '12.00', enabled: true },
      { id: 'pack-2', kind: 'packaging', name: 'Бутылка ПЭТ 1,5 л', unit_price: '16.00', enabled: true }
    ]
  }, { width: 1920, height: 1080 });

  const lines = buildDisplayLines(model);
  const packagingLines = lines.filter((line) => line.kind === 'packaging');
  assert.equal(packagingLines.length, 1, 'two packaging positions must share one rendered row');
  assert.equal(packagingLines[0].items.length, 2);

  const svg = buildTableSvg(model, lines);
  assert.equal((svg.match(/class="packaging-cell tone-/g) || []).length, 2);
  assert.equal((svg.match(/class="packaging-name"/g) || []).length, 2);
  assert.equal((svg.match(/class="packaging-price"/g) || []).length, 2);
  assert.equal((svg.match(/class="cents"/g) || []).length, 2, 'packaging prices must use the same whole/cents typography as product prices');
  assert.doesNotMatch(svg, /class="packaging-cell tone-[^"]*"[^>]*>[\s\S]{0,220}<rect\b/, 'packaging must not render separate rounded cards');
  assert.doesNotMatch(svg, /rx="7"/, 'legacy packaging card radius must not return');
  assert.doesNotMatch(svg, /fill="#121820"/, 'legacy packaging card background must not return');
});
