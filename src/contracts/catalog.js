import { ValidationError } from '../shared/errors.js';
import { optionalText, requireText } from './input.js';

const FIELD_TYPES = new Set(['text', 'number', 'boolean', 'select']);
const PRICING_MODELS = new Set(['fixed', 'proportional', 'weight', 'variant']);
const CLASS_CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

function plainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`Поле «${field}» должно быть объектом.`);
  return value;
}

function finiteNumber(value, field, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const source = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const number = Number(source);
  if (!Number.isFinite(number) || number < min || number > max) throw new ValidationError(`Поле «${field}» содержит некорректное число.`);
  return number;
}

function decimalString(value, field, { min = 0, max = 999999999.99, decimals = 2 } = {}) {
  const number = finiteNumber(value, field, { min, max });
  return number.toFixed(decimals).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '').replace(/\.$/, '');
}

function optionValues(field) {
  if (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 100) {
    throw new ValidationError(`Схема поля «${field.key}» должна содержать варианты выбора.`);
  }
  const result = [];
  const used = new Set();
  for (const option of field.options) {
    const source = plainObject(option, `options.${field.key}`);
    const value = requireText(String(source.value ?? ''), `options.${field.key}.value`, { max: 80 });
    if (used.has(value)) throw new ValidationError(`Схема поля «${field.key}» содержит повторяющийся вариант.`);
    used.add(value);
    result.push({ value, label: requireText(source.label, `options.${field.key}.label`, { max: 120 }) });
  }
  return result;
}

export function normaliseCatalogFieldSchema(value) {
  if (!Array.isArray(value)) throw new ValidationError('Схема класса каталога должна быть массивом полей.');
  if (value.length > 80) throw new ValidationError('Класс каталога содержит слишком много полей.');
  const used = new Set();
  return value.map((entry, index) => {
    const source = plainObject(entry, `field_schema[${index}]`);
    const key = requireText(source.key, `field_schema[${index}].key`, { max: 64 });
    if (!FIELD_KEY_PATTERN.test(key)) throw new ValidationError(`Ключ поля «${key}» имеет неверный формат.`);
    if (used.has(key)) throw new ValidationError(`Поле «${key}» объявлено в схеме повторно.`);
    used.add(key);
    const type = requireText(source.type, `field_schema[${index}].type`, { max: 16 });
    if (!FIELD_TYPES.has(type)) throw new ValidationError(`Тип поля «${key}» не поддерживается.`);
    const result = {
      key,
      label: requireText(source.label, `field_schema[${index}].label`, { max: 120 }),
      type,
      required: source.required === true
    };
    if (type === 'text') result.max = Math.min(2000, Math.max(1, Number(source.max) || 300));
    if (type === 'number') {
      result.min = Number.isFinite(Number(source.min)) ? Number(source.min) : -1000000000;
      result.max = Number.isFinite(Number(source.max)) ? Number(source.max) : 1000000000;
      if (result.max < result.min) throw new ValidationError(`Диапазон поля «${key}» задан неверно.`);
      result.step = Number.isFinite(Number(source.step)) && Number(source.step) > 0 ? Number(source.step) : 1;
    }
    if (type === 'select') result.options = optionValues({ ...source, key });
    return result;
  });
}

export function catalogClassContract(value) {
  const source = plainObject(value, 'catalog_class');
  const code = requireText(source.code, 'Код класса', { max: 64 });
  if (!CLASS_CODE_PATTERN.test(code)) throw new ValidationError('Код класса каталога имеет неверный формат.');
  const pricingModel = requireText(source.pricing_model || 'fixed', 'Модель цены', { max: 24 });
  if (!PRICING_MODELS.has(pricingModel)) throw new ValidationError('Модель цены класса не поддерживается.');
  return {
    ...source,
    code,
    name: requireText(source.name, 'Название класса', { max: 120 }),
    description: optionalText(source.description, 'Описание класса', { max: 500 }),
    pricing_model: pricingModel,
    default_unit: requireText(source.default_unit || 'шт', 'Единица измерения', { max: 24 }),
    resolved_field_schema: normaliseCatalogFieldSchema(source.resolved_field_schema ?? source.field_schema ?? [])
  };
}

function normaliseAttributes(value, catalogClass) {
  const source = value === undefined || value === null ? {} : plainObject(value, 'attributes');
  const schema = normaliseCatalogFieldSchema(catalogClass.resolved_field_schema ?? catalogClass.field_schema ?? []);
  const allowed = new Map(schema.map((field) => [field.key, field]));
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new ValidationError(`Поле «${key}» не предусмотрено классом «${catalogClass.name}».`);
  }
  const result = {};
  for (const field of schema) {
    const raw = source[field.key];
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) {
      if (field.required) throw new ValidationError(`Поле «${field.label}» обязательно.`);
      continue;
    }
    if (field.type === 'text') {
      result[field.key] = optionalText(raw, field.label, { max: field.max });
      continue;
    }
    if (field.type === 'number') {
      result[field.key] = finiteNumber(raw, field.label, { min: field.min, max: field.max });
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof raw !== 'boolean') throw new ValidationError(`Поле «${field.label}» должно быть логическим значением.`);
      result[field.key] = raw;
      continue;
    }
    const values = new Set(field.options.map((option) => option.value));
    if (!values.has(String(raw))) throw new ValidationError(`Поле «${field.label}» содержит неподдерживаемое значение.`);
    result[field.key] = String(raw);
  }
  return result;
}

export function catalogItemInput(body, catalogClass) {
  const source = plainObject(body, 'catalog_item');
  const resolvedClass = catalogClassContract(catalogClass);
  const unit = requireText(source.unit || resolvedClass.default_unit, 'Единица измерения', { max: 24 });
  return {
    class_id: Number(resolvedClass.id),
    name: requireText(source.name, 'Название позиции', { max: 160 }),
    description: optionalText(source.description, 'Описание', { max: 1000 }),
    base_price: decimalString(source.base_price ?? 0, 'Базовая цена', { min: 0, max: 999999999.99, decimals: 2 }),
    base_quantity: decimalString(source.base_quantity ?? 1, 'Базовое количество', { min: 0.001, max: 1000000, decimals: 3 }),
    unit,
    attributes: normaliseAttributes(source.attributes, resolvedClass),
    active: source.active !== false
  };
}

export function catalogPricingModel(value) {
  const model = String(value || 'fixed');
  return PRICING_MODELS.has(model) ? model : 'fixed';
}
