import { productInput, positiveId } from '../contracts/input.js';
import { ConflictError, ValidationError } from '../shared/errors.js';

const EXPORT_HEADERS = Object.freeze([
  ['id', 'ID'],
  ['name', 'Название'],
  ['producer', 'Производитель'],
  ['characteristics', 'Характеристики'],
  ['strength', 'Крепость'],
  ['price_primary', 'Цена 1 л'],
  ['price_secondary', 'Цена 1,5 л (расчётная)'],
  ['alcoholic', 'Алкогольная'],
  ['beverage_color', 'Цвет напитка'],
  ['filtration', 'Фильтрация'],
  ['active', 'Активна']
]);

const HEADER_ALIASES = new Map([
  ['id', 'id'], ['название', 'name'], ['name', 'name'], ['производитель', 'producer'], ['producer', 'producer'],
  ['характеристики', 'characteristics'], ['characteristics', 'characteristics'], ['крепость', 'strength'], ['strength', 'strength'],
  ['цена 1 л', 'price_primary'], ['цена за 1 л', 'price_primary'], ['price_primary', 'price_primary'],
  ['цена 1,5 л', 'price_secondary'], ['цена за 1,5 л', 'price_secondary'], ['цена 1,5 л (расчётная)', 'price_secondary'],
  ['цена 1,5 л — расчётная', 'price_secondary'], ['цена 1,5 л - расчётная', 'price_secondary'], ['price_secondary', 'price_secondary'],
  ['алкогольная', 'alcoholic'], ['алкогольная продукция', 'alcoholic'], ['alcoholic', 'alcoholic'],
  ['цвет напитка', 'beverage_color'], ['beverage_color', 'beverage_color'], ['фильтрация', 'filtration'], ['filtration', 'filtration'],
  ['активна', 'active'], ['active', 'active']
]);

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'да', 'д']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'нет', 'н']);
const PRODUCT_FIELDS = Object.freeze([
  'name', 'producer', 'characteristics', 'strength', 'price_primary', 'price_secondary',
  'alcoholic', 'beverage_color', 'filtration', 'active'
]);

function csvValue(value) {
  const text = String(value ?? '');
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function readableBoolean(value) {
  return value === true ? 'да' : 'нет';
}

function readableColor(value) {
  if (value === 'light') return 'светлый';
  if (value === 'dark') return 'тёмный';
  if (value === 'white') return 'белое';
  if (value === 'semi_dark') return 'полутёмное';
  if (value === 'amber') return 'янтарное';
  if (value === 'red') return 'красное';
  return '';
}

function readableFiltration(value) {
  if (value === 'filtered') return 'фильтрованное';
  if (value === 'unfiltered') return 'нефильтрованное';
  return '';
}

function readablePrice(value) {
  return String(value ?? '').replace('.', ',');
}

export function productsToCsv(products) {
  const header = EXPORT_HEADERS.map(([, label]) => csvValue(label)).join(';');
  const rows = products.map((product) => [
    product.id,
    product.name,
    product.producer,
    product.characteristics,
    product.strength,
    readablePrice(product.price_primary),
    readablePrice(product.price_secondary),
    readableBoolean(product.alcoholic),
    readableColor(product.beverage_color),
    readableFiltration(product.filtration),
    readableBoolean(product.active)
  ].map(csvValue).join(';'));
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

function delimiterFromHeader(source) {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const char of source.replace(/^\uFEFF/, '')) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ';') semicolons += 1;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && (char === '\n' || char === '\r')) break;
  }
  return semicolons >= commas ? ';' : ',';
}

function parseRows(source) {
  if (typeof source !== 'string' || source.trim().length === 0) throw new ValidationError('CSV-файл пуст.');
  const text = source.replace(/^\uFEFF/, '');
  const delimiter = delimiterFromHeader(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  if (quoted) throw new ValidationError('CSV содержит незакрытое поле в кавычках.');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (!rows.length) throw new ValidationError('CSV-файл пуст.');
  return rows;
}

function normaliseHeader(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function headerMap(headerRow) {
  const map = new Map();
  headerRow.forEach((heading, index) => {
    const source = normaliseHeader(heading);
    const field = HEADER_ALIASES.get(source);
    if (!field) throw new ValidationError(`Неизвестный столбец CSV: «${String(heading).trim()}».`);
    if (map.has(field)) throw new ValidationError(`Столбец «${String(heading).trim()}» указан в CSV несколько раз.`);
    map.set(field, index);
  });
  for (const required of ['name', 'price_primary']) {
    if (!map.has(required)) throw new ValidationError(required === 'name' ? 'В CSV отсутствует столбец «Название».' : 'В CSV отсутствует столбец «Цена 1 л».');
  }
  return map;
}

function cell(row, columns, field) {
  const index = columns.get(field);
  return index === undefined ? '' : String(row[index] ?? '').trim();
}

function booleanValue(value, field, fallback) {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (!text) return fallback;
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  throw new ValidationError(`Поле «${field}» должно содержать да/нет.`);
}

function beverageColorValue(value) {
  const text = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (!text || text === 'none' || text === 'не указан') return 'none';
  if (text === 'light' || text === 'светлый' || text === 'светлое') return 'light';
  if (text === 'dark' || text === 'тёмный' || text === 'темный' || text === 'тёмное' || text === 'темное') return 'dark';
  if (text === 'white' || text === 'белое' || text === 'белый') return 'white';
  if (text === 'semi_dark' || text === 'semi-dark' || text === 'полутёмное' || text === 'полутемное') return 'semi_dark';
  if (text === 'amber' || text === 'янтарное' || text === 'янтарный') return 'amber';
  if (text === 'red' || text === 'красное' || text === 'красный') return 'red';
  throw new ValidationError('Поле «Цвет напитка» содержит неизвестное значение.');
}

function filtrationValue(value) {
  const text = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (!text || text === 'none' || text === 'не указана') return 'none';
  if (text === 'filtered' || text === 'фильтрованное' || text === 'фильтрованная') return 'filtered';
  if (text === 'unfiltered' || text === 'нефильтрованное' || text === 'нефильтрованная') return 'unfiltered';
  throw new ValidationError('Поле «Фильтрация» содержит неизвестное значение.');
}

function csvDraftRows(source) {
  const rows = parseRows(source);
  const columns = headerMap(rows[0]);
  const entries = rows.slice(1).map((row, offset) => {
    const line = offset + 2;
    return {
      key: `row-${line}`,
      line,
      excluded: false,
      values: {
        id: cell(row, columns, 'id'),
        name: cell(row, columns, 'name'),
        producer: cell(row, columns, 'producer'),
        characteristics: cell(row, columns, 'characteristics'),
        strength: cell(row, columns, 'strength'),
        price_primary: cell(row, columns, 'price_primary'),
        alcoholic: cell(row, columns, 'alcoholic'),
        beverage_color: cell(row, columns, 'beverage_color'),
        filtration: cell(row, columns, 'filtration'),
        active: cell(row, columns, 'active')
      }
    };
  });
  if (!entries.length) throw new ValidationError('В CSV нет строк продукции.');
  return entries;
}

function strictProductFromDraft(entry) {
  const rawId = String(entry.values.id || '').trim();
  const id = rawId ? positiveId(rawId, 'ID') : null;
  return {
    line: entry.line,
    id,
    product: productInput({
      name: entry.values.name,
      producer: entry.values.producer,
      characteristics: entry.values.characteristics,
      strength: entry.values.strength,
      price_primary: entry.values.price_primary,
      alcoholic: booleanValue(entry.values.alcoholic, 'Алкогольная', false),
      beverage_color: beverageColorValue(entry.values.beverage_color),
      filtration: filtrationValue(entry.values.filtration),
      active: booleanValue(entry.values.active, 'Активна', true)
    })
  };
}

export function productsFromCsv(source) {
  const drafts = csvDraftRows(source);
  const entries = [];
  const usedIds = new Set();
  for (const draft of drafts) {
    try {
      const entry = strictProductFromDraft(draft);
      if (entry.id && usedIds.has(entry.id)) throw new ValidationError(`ID ${entry.id} встречается в CSV несколько раз.`);
      if (entry.id) usedIds.add(entry.id);
      entries.push(entry);
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`Строка ${draft.line}: ${error.message}`);
      throw error;
    }
  }
  return entries;
}

function importDraftRow(input, index) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = source.values && typeof source.values === 'object' && !Array.isArray(source.values) ? source.values : source;
  const line = Number.isSafeInteger(Number(source.line)) && Number(source.line) > 0 ? Number(source.line) : index + 1;
  const candidateKey = typeof source.key === 'string' && /^[a-zA-Z0-9._:-]{1,80}$/.test(source.key) ? source.key : `row-${index + 1}`;
  const text = (value) => value === undefined || value === null ? '' : String(value);
  return {
    key: candidateKey,
    line,
    excluded: source.excluded === true,
    values: {
      id: text(values.id).trim(),
      name: text(values.name),
      producer: text(values.producer),
      characteristics: text(values.characteristics),
      strength: text(values.strength),
      price_primary: text(values.price_primary),
      alcoholic: typeof values.alcoholic === 'boolean' ? values.alcoholic : text(values.alcoholic),
      beverage_color: text(values.beverage_color),
      filtration: text(values.filtration),
      active: typeof values.active === 'boolean' ? values.active : text(values.active)
    }
  };
}

function importDraftRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('Нет строк продукции для импорта.');
  return rows.map(importDraftRow);
}

function errorField(error) {
  const message = String(error?.message || 'Некорректное значение.');
  if (message.includes('Название продукции')) return 'name';
  if (message.includes('Производитель')) return 'producer';
  if (message.includes('Характеристики')) return 'characteristics';
  if (message.includes('Крепость')) return 'strength';
  if (message.includes('Цена за 1 л')) return 'price_primary';
  return '_row';
}

function addError(errors, field, error) {
  errors.push({ field, message: String(error?.message || error || 'Некорректное значение.') });
}

function comparable(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value;
  return String(value);
}

function productChanges(existing, product) {
  return PRODUCT_FIELDS.flatMap((field) => comparable(existing?.[field]) === comparable(product?.[field])
    ? []
    : [{ field, before: existing?.[field] ?? '', after: product?.[field] ?? '' }]);
}

function previewRow(draft, existingById, idCounts) {
  const values = { ...draft.values };
  const errors = [];
  let id = null;

  if (values.id) {
    try { id = positiveId(values.id, 'ID'); }
    catch (error) { addError(errors, 'id', error); }
  }
  if (id && idCounts.get(id) > 1) addError(errors, 'id', `ID ${id} встречается в импорте несколько раз.`);

  let alcoholic = values.alcoholic;
  let beverageColor = values.beverage_color;
  let filtration = values.filtration;
  let active = values.active;

  try { alcoholic = booleanValue(values.alcoholic, 'Алкогольная', false); values.alcoholic = alcoholic; }
  catch (error) { addError(errors, 'alcoholic', error); }
  try { beverageColor = beverageColorValue(values.beverage_color); values.beverage_color = beverageColor; }
  catch (error) { addError(errors, 'beverage_color', error); }
  try { filtration = filtrationValue(values.filtration); values.filtration = filtration; }
  catch (error) { addError(errors, 'filtration', error); }
  try { active = booleanValue(values.active, 'Активна', true); values.active = active; }
  catch (error) { addError(errors, 'active', error); }

  let product = null;
  if (!errors.some((item) => ['alcoholic', 'beverage_color', 'filtration', 'active'].includes(item.field))) {
    try {
      product = productInput({
        name: values.name,
        producer: values.producer,
        characteristics: values.characteristics,
        strength: values.strength,
        price_primary: values.price_primary,
        alcoholic,
        beverage_color: beverageColor,
        filtration,
        active
      });
    } catch (error) {
      if (error instanceof ValidationError) addError(errors, errorField(error), error);
      else throw error;
    }
  }

  const existing = id ? existingById.get(id) : null;
  if (id && !existing) addError(errors, 'id', `Продукция с ID ${id} не найдена. Удалите ID, чтобы создать новую запись.`);

  if (draft.excluded) {
    return { ...draft, values, id, normalized: product, status: 'excluded', errors: [], changes: [] };
  }
  if (errors.length || !product) {
    return { ...draft, values, id, normalized: product, status: 'error', errors, changes: [] };
  }
  if (!id) return { ...draft, values, id: null, normalized: product, status: 'new', errors: [], changes: [] };
  const changes = productChanges(existing, product);
  return { ...draft, values, id, normalized: product, status: changes.length ? 'changed' : 'unchanged', errors: [], changes };
}

function buildPreview(products, drafts) {
  const existingById = new Map(products.map((product) => [Number(product.id), product]));
  const idCounts = new Map();
  for (const draft of drafts) {
    if (draft.excluded || !draft.values.id) continue;
    try {
      const id = positiveId(draft.values.id, 'ID');
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    } catch { /* row-level validation reports the invalid ID */ }
  }

  const rows = drafts.map((draft) => previewRow(draft, existingById, idCounts));
  const summary = { total: rows.length, new: 0, changed: 0, unchanged: 0, error: 0, excluded: 0 };
  rows.forEach((row) => { summary[row.status] += 1; });
  return {
    rows,
    summary,
    canApply: summary.error === 0 && (summary.new + summary.changed) > 0
  };
}

export async function previewProductsImport(store, input = {}) {
  const drafts = typeof input?.csv === 'string' ? csvDraftRows(input.csv) : importDraftRows(input?.rows);
  return buildPreview(await store.listProducts(), drafts);
}

function previewValidationError(preview) {
  const row = preview.rows.find((item) => item.status === 'error');
  const error = row?.errors?.[0];
  return new ValidationError(row && error ? `Строка ${row.line}: ${error.message}` : 'Импорт содержит ошибки.');
}

async function writeImportedProduct(row, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code !== '23505') throw error;
    throw new ConflictError(
      `Строка ${row.line}: продукция «${row.normalized.name}» уже существует. Укажите ID существующей записи для обновления или измените название.`,
      { cause: error }
    );
  }
}

export async function applyProductsImport(store, rows) {
  const drafts = importDraftRows(rows);
  return store.transaction(async (transaction) => {
    const preview = buildPreview(await transaction.listProducts(), drafts);
    if (preview.summary.error) throw previewValidationError(preview);

    let created = 0;
    let updated = 0;
    for (const row of preview.rows) {
      if (row.status === 'new') {
        await writeImportedProduct(row, () => transaction.createProduct(row.normalized));
        created += 1;
      } else if (row.status === 'changed') {
        const product = await writeImportedProduct(row, () => transaction.updateProduct(row.id, row.normalized));
        if (!product) throw new ValidationError(`Строка ${row.line}: продукция с ID ${row.id} больше не существует.`);
        updated += 1;
      }
    }
    return {
      created,
      updated,
      unchanged: preview.summary.unchanged,
      excluded: preview.summary.excluded,
      total: created + updated
    };
  });
}

export async function importProductsCsv(store, source) {
  const result = await applyProductsImport(store, csvDraftRows(source));
  return { created: result.created, updated: result.updated, total: result.total };
}
