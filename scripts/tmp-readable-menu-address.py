from pathlib import Path
import re


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))


# Readable layout: reserve a real price zone and reuse classic row-tone behavior.
replace(
    'src/web/admin-ui/public/js/editor/renderer-layout.js',
    """function readableHorizontal(left, width) {
  const scaleX = width / MENU_REFERENCE.tableWidth;
  const right = left + width;
  const secondaryPriceX = right - Math.max(12, width * .025);
  const primaryPriceX = secondaryPriceX - Math.max(104, width * .165);
  return Object.freeze({
    left,
    right,
    tableWidth:width,
    scaleX,
    primaryPriceX,
    secondaryPriceX,
    nameWidth:primaryPriceX - left
  });
}""",
    """function readableHorizontal(left, width) {
  const scaleX = width / MENU_REFERENCE.tableWidth;
  const right = left + width;
  const rightPadding = Math.max(12, width * .025);
  const priceCellWidth = Math.max(84, width * .13);
  const priceColumnGap = Math.max(14, width * .022);
  const secondaryPriceX = right - rightPadding;
  const primaryPriceX = secondaryPriceX - priceCellWidth - priceColumnGap;
  const priceZoneLeft = primaryPriceX - priceCellWidth;
  return Object.freeze({
    left,
    right,
    tableWidth:width,
    scaleX,
    priceCellWidth,
    priceColumnGap,
    priceZoneLeft,
    primaryPriceX,
    secondaryPriceX,
    nameWidth:priceZoneLeft - left
  });
}""",
)
replace(
    'src/web/admin-ui/public/js/editor/renderer-layout.js',
    "    item_tone_mode:'fixed',\n    price_mode:'primary-accent',",
    "    item_tone_mode:'alternating',\n    price_mode:'alternating',",
)

# Metadata shown on TV: producer, strength, characteristics. Address is deliberately excluded.
replace(
    'src/web/admin-ui/public/js/editor/renderer-model.js',
    """export function formatProductMetadata(product) {
  return [
    product?.producer || '',
    formatStrength(product?.strength || ''),
    beverageColorLabel(product?.beverage_color),
    filtrationLabel(product?.filtration)
  ].filter(Boolean).join(' · ');
}""",
    """export function formatProductMetadata(product) {
  const characteristics = String(product?.characteristics || '').trim();
  const fallbackCharacteristics = [
    beverageColorLabel(product?.beverage_color),
    filtrationLabel(product?.filtration)
  ].filter(Boolean).join(' · ');
  return [
    product?.producer || '',
    formatStrength(product?.strength || ''),
    characteristics || fallbackCharacteristics
  ].filter(Boolean).join(' · ');
}""",
)

# Protect item/section text from price cells and give the two text lines more vertical separation.
p = Path('src/web/admin-ui/public/js/editor/renderer-svg.js')
text = p.read_text()
text, n = re.subn(
    r"  const titleWidth = line\.showPriceLabels \? horizontal\.primaryPriceX - horizontal\.left - 45 \* horizontal\.scaleX : horizontal\.tableWidth;\n  const maximumCharacters = Math\.max\(16, Math\.floor\(titleWidth / \(\(readable \? 16 : 17\) \* fontScale\)\)\);\n  const priceLabelCenterOffset = \(MENU_REFERENCE\.priceColumnGap / 3\) \* horizontal\.scaleX;",
    "  const titleRight = readable && Number.isFinite(horizontal.priceZoneLeft) ? horizontal.priceZoneLeft : horizontal.primaryPriceX;\n  const titleWidth = line.showPriceLabels ? titleRight - horizontal.left - 18 * horizontal.scaleX : horizontal.tableWidth;\n  const maximumCharacters = Math.max(16, Math.floor(titleWidth / ((readable ? 16 : 17) * fontScale)));\n  const priceLabelCenterOffset = readable && Number.isFinite(horizontal.priceCellWidth)\n    ? horizontal.priceCellWidth / 2\n    : (MENU_REFERENCE.priceColumnGap / 3) * horizontal.scaleX;",
    text,
    count=1,
)
if n != 1:
    raise SystemExit('renderer-svg: section price-zone patch failed')
old = "  const nameBaseline = hasMetadata ? box.top + (readable ? 27 : 21) * fontScale : priceBaseline;\n  const metaBaseline = box.top + (readable ? 53 : 44.5) * fontScale;"
new = "  const nameBaseline = hasMetadata ? box.top + (readable ? 24.5 : 21) * fontScale : priceBaseline;\n  const metaBaseline = box.top + (readable ? 56.5 : 44.5) * fontScale;"
if old not in text:
    raise SystemExit('renderer-svg: baseline patch failed')
text = text.replace(old, new, 1)
old = "  const nameCharacters = Math.max(8, Math.floor((horizontal.primaryPriceX - itemNameX - 30 * horizontal.scaleX) / ((readable ? 14 : 13) * fontScale)));\n  const metaCharacters = Math.max(18, Math.floor((horizontal.primaryPriceX - nameX - 30 * horizontal.scaleX) / ((readable ? 7.5 : 7) * fontScale)));"
new = "  const textRight = readable && Number.isFinite(horizontal.priceZoneLeft) ? horizontal.priceZoneLeft : horizontal.primaryPriceX;\n  const nameCharacters = Math.max(8, Math.floor((textRight - itemNameX - 14 * horizontal.scaleX) / ((readable ? 14 : 13) * fontScale)));\n  const metaCharacters = Math.max(18, Math.floor((textRight - nameX - 14 * horizontal.scaleX) / ((readable ? 7.5 : 7) * fontScale)));"
if old not in text:
    raise SystemExit('renderer-svg: item price-zone patch failed')
text = text.replace(old, new, 1)
old = "    const toneColor = readable ? palette.primaryText : item.tone === 'accent' ? palette.accentText : palette.primaryText;"
new = "    const toneColor = item.tone === 'accent' ? palette.accentText : palette.primaryText;"
if old not in text:
    raise SystemExit('renderer-svg: packaging tone patch failed')
text = text.replace(old, new, 1)
old = "${priceMarkup(item.unitPrice, right - 22 * horizontal.scaleX, baseline, scale, readable ? palette.accentText : toneColor, priceFont, priceFontSizePt, 'packaging-price')}"
new = "${priceMarkup(item.unitPrice, right - 22 * horizontal.scaleX, baseline, scale, toneColor, priceFont, priceFontSizePt, 'packaging-price')}"
if old not in text:
    raise SystemExit('renderer-svg: packaging price tone patch failed')
text = text.replace(old, new, 1)
p.write_text(text)

# New additive migration. Historical migrations are untouched.
migration = Path('src/db/migrations/catalog-product-address.js')
if migration.exists():
    raise SystemExit('catalog-product-address migration already exists')
migration.write_text("export async function migrateCatalogProductAddress(queryable) {\n  await queryable.query(\"ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';\");\n}\n")

replace(
    'src/db/index.js',
    "import { migrateLoginRateLimits } from './migrations/login-rate-limits.js';",
    "import { migrateLoginRateLimits } from './migrations/login-rate-limits.js';\nimport { migrateCatalogProductAddress } from './migrations/catalog-product-address.js';",
)
replace(
    'src/db/index.js',
    "  { name: '033-login-rate-limits', run: migrateLoginRateLimits }\n]);",
    "  { name: '033-login-rate-limits', run: migrateLoginRateLimits },\n  { name: '034-catalog-product-address', run: migrateCatalogProductAddress }\n]);",
)

replace(
    'src/db/catalog.js',
    """        `INSERT INTO catalog_products (name, producer, characteristics, strength, price_primary, price_secondary,
         alcoholic, beverage_color, filtration, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
        [product.name, product.producer, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, now]""",
    """        `INSERT INTO catalog_products (name, producer, address, characteristics, strength, price_primary, price_secondary,
         alcoholic, beverage_color, filtration, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) RETURNING id`,
        [product.name, product.producer, product.address, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, now]""",
)
replace(
    'src/db/catalog.js',
    """        `UPDATE catalog_products SET name = $1, producer = $2, characteristics = $3, strength = $4,
         price_primary = $5, price_secondary = $6, alcoholic = $7, beverage_color = $8,
         filtration = $9, active = $10, updated_at = $11 WHERE id = $12`,
        [product.name, product.producer, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, isoNow(), id]""",
    """        `UPDATE catalog_products SET name = $1, producer = $2, address = $3, characteristics = $4, strength = $5,
         price_primary = $6, price_secondary = $7, alcoholic = $8, beverage_color = $9,
         filtration = $10, active = $11, updated_at = $12 WHERE id = $13`,
        [product.name, product.producer, product.address, product.characteristics, product.strength, product.price_primary,
          product.price_secondary, product.alcoholic, product.beverage_color, product.filtration, product.active, isoNow(), id]""",
)

replace(
    'src/contracts/input.js',
    "    producer: optionalText(body.producer, 'Производитель', { max: 120 }),\n    characteristics: optionalText(body.characteristics, 'Характеристики', { max: 180 }),",
    "    producer: optionalText(body.producer, 'Производитель', { max: 120 }),\n    address: optionalText(body.address, 'Адрес', { max: 180 }),\n    characteristics: optionalText(body.characteristics, 'Характеристики', { max: 180 }),",
)

# Catalog UI.
replace(
    'src/web/admin-ui/public/catalog.html',
    '<label class="field"><span>Производитель</span><input id="product-producer" maxlength="120" /></label><label class="field"><span>Крепость</span>',
    '<label class="field"><span>Производитель</span><input id="product-producer" maxlength="120" /></label><label class="field"><span>Адрес</span><input id="product-address" maxlength="180" /></label><label class="field"><span>Крепость</span>',
)
replace(
    'src/web/admin-ui/public/catalog.html',
    '<th>Название</th><th>Производитель</th><th>Характеристики</th>',
    '<th>Название</th><th>Производитель</th><th>Адрес</th><th>Характеристики</th>',
)
replace(
    'src/web/admin-ui/public/js/pages/catalog.js',
    '    product.name, product.producer, product.characteristics, product.strength',
    '    product.name, product.producer, product.address, product.characteristics, product.strength',
)
replace(
    'src/web/admin-ui/public/js/pages/catalog.js',
    "    [product.producer || 'Производитель не указан', product.characteristics || product.strength || 'Без характеристик',",
    "    [product.producer || 'Производитель не указан', product.address || 'Адрес не указан', product.characteristics || product.strength || 'Без характеристик',",
)
replace(
    'src/web/admin-ui/public/js/pages/catalog.js',
    "  element('product-producer').value = product.producer || '';\n  element('product-characteristics').value = product.characteristics || '';",
    "  element('product-producer').value = product.producer || '';\n  element('product-address').value = product.address || '';\n  element('product-characteristics').value = product.characteristics || '';",
)
replace(
    'src/web/admin-ui/public/js/pages/catalog.js',
    "        producer: element('product-producer').value,\n        characteristics: element('product-characteristics').value,",
    "        producer: element('product-producer').value,\n        address: element('product-address').value,\n        characteristics: element('product-characteristics').value,",
)

# CSV import/export retains address but TV rendering ignores it.
replace(
    'src/services/catalog-csv-service.js',
    "  ['producer', 'Производитель'],\n  ['characteristics', 'Характеристики'],",
    "  ['producer', 'Производитель'],\n  ['address', 'Адрес'],\n  ['characteristics', 'Характеристики'],",
)
replace(
    'src/services/catalog-csv-service.js',
    "['название', 'name'], ['name', 'name'], ['производитель', 'producer'], ['producer', 'producer'],\n  ['характеристики'",
    "['название', 'name'], ['name', 'name'], ['производитель', 'producer'], ['producer', 'producer'], ['адрес', 'address'], ['address', 'address'],\n  ['характеристики'",
)
replace(
    'src/services/catalog-csv-service.js',
    "  'name', 'producer', 'characteristics', 'strength', 'price_primary', 'price_secondary',",
    "  'name', 'producer', 'address', 'characteristics', 'strength', 'price_primary', 'price_secondary',",
)
replace(
    'src/services/catalog-csv-service.js',
    "    product.producer,\n    product.characteristics,",
    "    product.producer,\n    product.address,\n    product.characteristics,",
)
replace(
    'src/services/catalog-csv-service.js',
    "        producer: cell(row, columns, 'producer'),\n        characteristics: cell(row, columns, 'characteristics'),",
    "        producer: cell(row, columns, 'producer'),\n        address: cell(row, columns, 'address'),\n        characteristics: cell(row, columns, 'characteristics'),",
)
replace(
    'src/services/catalog-csv-service.js',
    "      producer: entry.values.producer,\n      characteristics: entry.values.characteristics,",
    "      producer: entry.values.producer,\n      address: entry.values.address,\n      characteristics: entry.values.characteristics,",
)
replace(
    'src/services/catalog-csv-service.js',
    "      producer: text(values.producer),\n      characteristics: text(values.characteristics),",
    "      producer: text(values.producer),\n      address: text(values.address),\n      characteristics: text(values.characteristics),",
)
replace(
    'src/services/catalog-csv-service.js',
    "  if (message.includes('Производитель')) return 'producer';\n  if (message.includes('Характеристики'))",
    "  if (message.includes('Производитель')) return 'producer';\n  if (message.includes('Адрес')) return 'address';\n  if (message.includes('Характеристики'))",
)
replace(
    'src/services/catalog-csv-service.js',
    "        producer: values.producer,\n        characteristics: values.characteristics,",
    "        producer: values.producer,\n        address: values.address,\n        characteristics: values.characteristics,",
)

replace(
    'src/web/admin-ui/public/js/catalog/import-preview.js',
    "const IMPORT_FIELDS = Object.freeze(['id', 'name', 'producer', 'characteristics',",
    "const IMPORT_FIELDS = Object.freeze(['id', 'name', 'producer', 'address', 'characteristics',",
)
replace(
    'src/web/admin-ui/public/js/catalog/import-preview.js',
    "    ${importTextCell(row, 'producer', { max: 120 })}\n    ${importTextCell(row, 'characteristics', { max: 180 })}",
    "    ${importTextCell(row, 'producer', { max: 120 })}\n    ${importTextCell(row, 'address', { max: 180 })}\n    ${importTextCell(row, 'characteristics', { max: 180 })}",
)

# Tests.
replace(
    'tests/catalog-csv.test.js',
    "  producer: 'ООО \"Пивоварня\"',\n  characteristics:",
    "  producer: 'ООО \"Пивоварня\"',\n  address: 'Хабаровский край, Комсомольск-на-Амуре',\n  characteristics:",
)
replace(
    'tests/catalog-csv.test.js',
    "assert.ok(csv.startsWith('\\uFEFFID;Название;Производитель;'));",
    "assert.ok(csv.startsWith('\\uFEFFID;Название;Производитель;Адрес;'));\n  assert.match(csv, /Хабаровский край, Комсомольск-на-Амуре/);",
)
replace(
    'tests/catalog-csv.test.js',
    "    producer: PRODUCT.producer,\n    characteristics: PRODUCT.characteristics,",
    "    producer: PRODUCT.producer,\n    address: PRODUCT.address,\n    characteristics: PRODUCT.characteristics,",
)

replace(
    'tests/catalog-import-preview.test.js',
    "  producer: 'Пивоварня',\n  characteristics:",
    "  producer: 'Пивоварня',\n  address: 'Комсомольск-на-Амуре',\n  characteristics:",
)
replace(
    'tests/catalog-import-preview.test.js',
    "'ID;Название;Производитель;Крепость;Цена 1 л;Алкогольная;Цвет напитка;Фильтрация;Активна',",
    "'ID;Название;Производитель;Адрес;Крепость;Цена 1 л;Алкогольная;Цвет напитка;Фильтрация;Активна',",
)
replace(
    'tests/catalog-import-preview.test.js',
    "'7;Новое название;Пивоварня;4,5%;250;да;светлый;фильтрованное;да',\n    ';Новая позиция;;;100;нет;;;да',\n    '999;Ошибочная позиция;;;120;нет;;;да'",
    "'7;Новое название;Пивоварня;Комсомольск-на-Амуре;4,5%;250;да;светлый;фильтрованное;да',\n    ';Новая позиция;;;;100;нет;;;да',\n    '999;Ошибочная позиция;;;;120;нет;;;да'",
)
replace(
    'tests/catalog-import-preview.test.js',
    "name: 'Обновлено', producer: 'Пивоварня', characteristics:",
    "name: 'Обновлено', producer: 'Пивоварня', address: EXISTING.address, characteristics:",
)
replace(
    'tests/catalog-import-preview.test.js',
    "name: second.name, producer: second.producer, characteristics:",
    "name: second.name, producer: second.producer, address: second.address, characteristics:",
)
replace(
    'tests/catalog-import-preview.test.js',
    "name: 'Новая', producer: '', characteristics:",
    "name: 'Новая', producer: '', address: '', characteristics:",
)

p = Path('tests/readable-menu-style.test.js')
text = p.read_text()
if 'readable rows reuse classic alternating tones' in text:
    raise SystemExit('readable test already inserted')
text += """

test('readable rows reuse classic alternating tones and keep address out of TV metadata', () => {
  const model = buildRenderModel({
    settings:{ table_style:'readable' },
    rows:[
      { id:'s1', kind:'section', name:'Раздел', enabled:true },
      { id:'i1', kind:'item', product_id:1, enabled:true },
      { id:'i2', kind:'item', product_id:2, enabled:true }
    ]
  }, { width:1920, height:1080 });
  const products = [
    { id:1, name:'Первый', producer:'Завод 1', address:'Адрес не для ТВ', characteristics:'светлое, фильтрованное', strength:'4,5%', price_primary:'100', price_secondary:'150' },
    { id:2, name:'Второй', producer:'Завод 2', address:'Другой адрес', characteristics:'тёмное, нефильтрованное', strength:'5%', price_primary:'200', price_secondary:'300' }
  ];
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);
  const svg = buildTableSvg(model, lines, layout);

  assert.equal(layout.themeTableStyle.item_tone_mode, 'alternating');
  assert.equal(layout.themeTableStyle.price_mode, 'alternating');
  assert.equal(lines[1].metadata, 'Завод 1 · 4,5% · светлое, фильтрованное');
  assert.doesNotMatch(svg, /Адрес не для ТВ|Другой адрес/);
  assert.match(svg, new RegExp(`tone-light[\\s\\S]*fill=\\"${layout.palette.primaryText}\\"[\\s\\S]*table-item-prices[\\s\\S]*fill=\\"${layout.palette.primaryText}\\"`));
  assert.match(svg, new RegExp(`tone-accent[\\s\\S]*fill=\\"${layout.palette.accentText}\\"[\\s\\S]*table-item-prices[\\s\\S]*fill=\\"${layout.palette.accentText}\\"`));
  assert.ok(layout.columns[0].priceZoneLeft < layout.columns[0].primaryPriceX);
});
"""
p.write_text(text)

Path('tests/catalog-product-address.test.js').write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { productInput } from '../src/contracts/input.js';
import { migrateCatalogProductAddress } from '../src/db/migrations/catalog-product-address.js';

test('catalog product address is optional structured data', () => {
  const product = productInput({ name:'Товар', producer:'Завод', address:'  Хабаровский край  ', price_primary:'100' });
  assert.equal(product.address, 'Хабаровский край');
  assert.equal(product.price_secondary, '150');
});

test('catalog product address migration is additive and registered after historical migrations', async () => {
  const calls = [];
  await migrateCatalogProductAddress({ async query(sql) { calls.push(sql); } });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT ''/);
  const indexSource = await readFile(new URL('../src/db/index.js', import.meta.url), 'utf8');
  assert.match(indexSource, /034-catalog-product-address/);
});

test('catalog UI exposes address separately from producer', async () => {
  const html = await readFile(new URL('../src/web/admin-ui/public/catalog.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../src/web/admin-ui/public/js/pages/catalog.js', import.meta.url), 'utf8');
  assert.match(html, /id=\"product-address\"/);
  assert.match(html, /<th>Производитель<\/th><th>Адрес<\/th>/);
  assert.match(js, /address: element\('product-address'\)\.value/);
});
""")
