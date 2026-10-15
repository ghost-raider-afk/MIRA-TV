from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    p.write_text(text.replace(old, new, 1))


path = 'src/services/catalog-csv-service.js'
replace(
    path,
    """    return {
      key: `row-${line}`,
      line,
      excluded: false,
      values: {""",
    """    return {
      key: `row-${line}`,
      line,
      excluded: false,
      addressProvided: columns.has('address'),
      values: {""",
)
replace(
    path,
    """  return {
    key: candidateKey,
    line,
    excluded: source.excluded === true,
    values: {""",
    """  return {
    key: candidateKey,
    line,
    excluded: source.excluded === true,
    addressProvided: source.addressProvided !== false,
    values: {""",
)
replace(
    path,
    """  if (id && idCounts.get(id) > 1) addError(errors, 'id', `ID ${id} встречается в импорте несколько раз.`);

  let alcoholic = values.alcoholic;""",
    """  if (id && idCounts.get(id) > 1) addError(errors, 'id', `ID ${id} встречается в импорте несколько раз.`);
  const existing = id ? existingById.get(id) : null;
  if (!draft.addressProvided && existing) values.address = existing.address || '';

  let alcoholic = values.alcoholic;""",
)
replace(
    path,
    """  const existing = id ? existingById.get(id) : null;
  if (id && !existing) addError(errors, 'id', `Продукция с ID ${id} не найдена. Удалите ID, чтобы создать новую запись.`);""",
    """  if (id && !existing) addError(errors, 'id', `Продукция с ID ${id} не найдена. Удалите ID, чтобы создать новую запись.`);""",
)

# Keep the catalog form diff readable.
p = Path('src/web/admin-ui/public/catalog.html')
text = p.read_text()
old = '                <label class="field"><span>Производитель</span><input id="product-producer" maxlength="120" /></label><label class="field"><span>Адрес</span><input id="product-address" maxlength="180" /></label><label class="field"><span>Крепость</span><input id="product-strength" maxlength="20" placeholder="Например, 4,5%" /></label>'
new = '                <label class="field"><span>Производитель</span><input id="product-producer" maxlength="120" /></label>\n                <label class="field"><span>Адрес</span><input id="product-address" maxlength="180" /></label>\n                <label class="field"><span>Крепость</span><input id="product-strength" maxlength="20" placeholder="Например, 4,5%" /></label>'
if old not in text:
    raise SystemExit('catalog form formatting target not found')
p.write_text(text.replace(old, new, 1))

p = Path('tests/catalog-import-preview.test.js')
text = p.read_text()
if 'legacy CSV without address preserves' in text:
    raise SystemExit('compatibility test already exists')
text += """

test('legacy CSV without address preserves an existing structured address', async () => {
  const existing = { ...EXISTING, address:'Хабаровский край, Комсомольск-на-Амуре' };
  const store = { async listProducts() { return [existing]; } };
  const csv = [
    'ID;Название;Производитель;Крепость;Цена 1 л;Алкогольная;Цвет напитка;Фильтрация;Активна',
    `7;${existing.name};${existing.producer};${existing.strength};${existing.price_primary};да;светлый;фильтрованное;да`
  ].join('\\r\\n');

  const preview = await previewProductsImport(store, { csv });
  assert.equal(preview.rows[0].values.address, existing.address);
  assert.equal(preview.rows[0].normalized.address, existing.address);
  assert.equal(preview.rows[0].status, 'unchanged');
});

test('CSV with an explicit blank address can clear the address', async () => {
  const existing = { ...EXISTING, address:'Старый адрес' };
  const store = { async listProducts() { return [existing]; } };
  const csv = [
    'ID;Название;Производитель;Адрес;Крепость;Цена 1 л;Алкогольная;Цвет напитка;Фильтрация;Активна',
    `7;${existing.name};${existing.producer};;${existing.strength};${existing.price_primary};да;светлый;фильтрованное;да`
  ].join('\\r\\n');

  const preview = await previewProductsImport(store, { csv });
  assert.equal(preview.rows[0].normalized.address, '');
  assert.ok(preview.rows[0].changes.some((item) => item.field === 'address' && item.before === 'Старый адрес' && item.after === ''));
});
"""
p.write_text(text)
