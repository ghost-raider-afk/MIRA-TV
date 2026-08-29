import { ValidationError, UnprocessableEntityError } from '../shared/errors.js';

const VALID_STATUSES = new Set(['draft', 'ready', 'published']);
const VALID_THEMES = new Set(['system', 'light', 'dark']);
const VALID_DATE_FORMATS = new Set(['DD.MM.YYYY', 'YYYY-MM-DD']);

export function requireText(value, field, { max = 120 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new ValidationError(`Поле «${field}» должно содержать от 1 до ${max} символов.`);
  }
  return value.trim();
}

export function optionalText(value, field, { max = 300 } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new ValidationError(`Поле «${field}» должно содержать не более ${max} символов.`);
  }
  return value.trim();
}

export function positiveId(value, field) {
  const source = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-9]\d*$/.test(source)) throw new ValidationError(`Поле «${field}» должно быть положительным целым числом.`);
  const id = Number(source);
  if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError(`Поле «${field}» должно быть положительным целым числом.`);
  return id;
}

export function locationInput(body) {
  return { name: requireText(body.name, 'name'), address: optionalText(body.address, 'address'), active: body.active !== false };
}

export function resolutionInput(value, field, { maxWidth, maxHeight }) {
  const resolution = requireText(value, field, { max: 32 });
  const match = resolution.match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) throw new ValidationError('Укажите разрешение в формате 1920×1080.');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > maxWidth || height > maxHeight) throw new ValidationError(`Максимальное разрешение — ${maxWidth}×${maxHeight}.`);
  return `${width}×${height}`;
}

export function screenInput(body, { defaultScreenResolution, maxWidth, maxHeight }) {
  const status = body.status ?? 'draft';
  if (!VALID_STATUSES.has(status)) throw new ValidationError('Статус может быть только «черновик», «готово» или «опубликовано».');
  return {
    location_id: positiveId(body.location_id, 'location_id'),
    name: requireText(body.name, 'name'),
    resolution: resolutionInput(body.resolution ?? defaultScreenResolution, 'resolution', { maxWidth, maxHeight }),
    status,
    active: body.active !== false
  };
}

export function normalisePrice(value, field, { required = true } = {}) {
  const text = optionalText(value, field, { max: 16 }).replace(',', '.');
  if (!text && !required) return '';
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) throw new ValidationError(`Поле «${field}» должно содержать цену в формате 240 или 240.50.`);
  const [whole, decimal = ''] = text.split('.');
  return decimal ? `${Number.parseInt(whole, 10)}.${decimal.padEnd(2, '0')}` : String(Number.parseInt(whole, 10));
}

function priceForOneAndHalf(value) {
  const [whole, decimal = ''] = value.split('.');
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(decimal.padEnd(2, '0'), 10);
  const result = Math.round((cents * 3) / 2);
  const resultWhole = Math.floor(result / 100);
  const resultDecimal = String(result % 100).padStart(2, '0');
  return resultDecimal === '00' ? String(resultWhole) : `${resultWhole}.${resultDecimal}`;
}

export function productInput(body) {
  const beverageColor = body.beverage_color ?? 'none';
  const filtration = body.filtration ?? 'none';
  if (!['none', 'light', 'dark', 'white', 'semi_dark', 'amber', 'red'].includes(beverageColor) || !['none', 'filtered', 'unfiltered'].includes(filtration)) {
    throw new ValidationError('Выберите корректные параметры напитка.');
  }
  const pricePrimary = normalisePrice(body.price_primary, 'Цена за 1 л');
  return {
    name: requireText(body.name, 'Название продукции'),
    producer: optionalText(body.producer, 'Производитель', { max: 120 }),
    characteristics: optionalText(body.characteristics, 'Характеристики', { max: 180 }),
    strength: optionalText(body.strength, 'Крепость', { max: 20 }),
    price_primary: pricePrimary,
    price_secondary: priceForOneAndHalf(pricePrimary),
    alcoholic: body.alcoholic === true,
    beverage_color: beverageColor,
    filtration,
    active: body.active !== false
  };
}

export function packagingInput(body) {
  return { name: requireText(body.name, 'Название тары'), unit_price: normalisePrice(body.unit_price, 'Цена тары'), active: body.active !== false };
}

export async function menuDraftInput(body, store, maxBytes) {
  if (!Array.isArray(body.rows)) throw new ValidationError('Меню должно содержать список строк.');
  const products = new Map((await store.listProducts()).map((item) => [item.id, item]));
  const packaging = new Map((await store.listPackaging()).map((item) => [item.id, item]));
  const usedIds = new Set();
  const rows = body.rows.map((row, index) => {
    const kind = row?.kind;
    const candidateId = typeof row?.id === 'string' && row.id.length <= 120 && row.id.length > 0 ? row.id : `row-${index + 1}`;
    if (usedIds.has(candidateId)) throw new ValidationError('Идентификаторы строк меню должны быть уникальными.');
    usedIds.add(candidateId);
    const id = candidateId;
    if (kind === 'section') return { id, kind, name: requireText(row.name, 'Название раздела', { max: 100 }), enabled: row.enabled !== false };
    if (kind === 'item') {
      const product = products.get(positiveId(row.product_id ?? row.productId, 'Продукция'));
      if (!product || !product.active) throw new UnprocessableEntityError('Каждая позиция меню должна быть связана с активной продукцией общей базы.');
      if (!product.price_primary) throw new UnprocessableEntityError(`Для продукции «${product.name}» не указана обязательная цена.`);
      return {
        id, kind, product_id: product.id, name: product.name,
        characteristics: optionalText(row.characteristics, 'Подпись продукции', { max: 180 }),
        price_primary: product.price_primary, price_secondary: product.price_secondary,
        promotion: row.promotion === true,
        promotion_text: optionalText(row.promotion_text ?? row.promotionText, 'Текст акции', { max: 80 }),
        enabled: row.enabled !== false
      };
    }
    if (kind === 'packaging') {
      const item = packaging.get(positiveId(row.packaging_id ?? row.packagingId, 'Тара'));
      if (!item || !item.active) throw new UnprocessableEntityError('Каждая строка тары должна быть связана с активной тарой общей базы.');
      return { id, kind, packaging_id: item.id, name: item.name, unit_price: item.unit_price, enabled: row.enabled !== false };
    }
    throw new ValidationError('Тип строки меню не поддерживается.');
  });
  const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings : {};
  if (Buffer.byteLength(JSON.stringify({ rows, settings }), 'utf8') > maxBytes) throw new ValidationError('Черновик меню слишком большой.');
  return { rows, settings };
}

export function sftpDirectoryInput(body) {
  const name = requireText(body.name, 'name', { max: 64 });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name) || name === '.' || name === '..') {
    throw new ValidationError('Имя SFTP-каталога: латинские буквы, цифры, точка, дефис или подчёркивание');
  }
  return { name };
}

export function sftpBindingInput(body) {
  const username = requireText(body.username, 'username', { max: 32 });
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/.test(username)) {
    throw new ValidationError('Логин SFTP: 3–32 латинских символа, цифры, дефис или подчёркивание');
  }
  return { directoryId: positiveId(body.directory_id, 'directory_id'), username };
}

export function userPreferencesInput(body) {
  if (typeof body.notifications_enabled !== 'boolean') throw new ValidationError('Поле «notifications_enabled» должно быть логическим значением.');
  const email = optionalText(body.email, 'email', { max: 160 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Укажите корректный e-mail.');
  const theme = requireText(body.theme, 'theme', { max: 16 });
  if (!VALID_THEMES.has(theme)) throw new ValidationError('Тема интерфейса выбрана неверно.');
  return {
    display_name: requireText(body.display_name, 'display_name', { max: 80 }),
    email,
    phone: optionalText(body.phone, 'phone', { max: 40 }),
    job_title: optionalText(body.job_title, 'job_title', { max: 80 }),
    theme,
    notifications_enabled: body.notifications_enabled
  };
}

function logoSize(value) {
  const source = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-7]$/.test(source)) throw new ValidationError('Размер логотипа страницы входа должен быть от 1 до 7.');
  return Number(source);
}

export function siteSettingsInput(body, config) {
  const application_name = requireText(body.application_name, 'application_name', { max: 80 });
  const accent_color = requireText(body.accent_color, 'accent_color', { max: 7 });
  if (!/^#[0-9a-fA-F]{6}$/.test(accent_color)) throw new ValidationError('Основной цвет должен быть в формате #RRGGBB.');
  const timezone = requireText(body.timezone, 'timezone', { max: 80 });
  try { Intl.DateTimeFormat('ru-RU', { timeZone: timezone }); }
  catch { throw new ValidationError('Укажите существующий часовой пояс в формате Europe/Moscow.'); }
  const date_format = requireText(body.date_format, 'date_format', { max: 16 });
  if (!VALID_DATE_FORMATS.has(date_format)) throw new ValidationError('Формат даты выбран неверно.');
  const refreshSource = typeof body.dashboard_refresh_seconds === 'number'
    ? String(body.dashboard_refresh_seconds)
    : typeof body.dashboard_refresh_seconds === 'string' ? body.dashboard_refresh_seconds.trim() : '';
  if (!/^\d+$/.test(refreshSource)) {
    throw new ValidationError(`Интервал обновления должен быть от ${config.dashboardRefreshMinSeconds} до ${config.dashboardRefreshMaxSeconds} секунд.`);
  }
  const dashboard_refresh_seconds = Number(refreshSource);
  if (!Number.isSafeInteger(dashboard_refresh_seconds) || dashboard_refresh_seconds < config.dashboardRefreshMinSeconds || dashboard_refresh_seconds > config.dashboardRefreshMaxSeconds) {
    throw new ValidationError(`Интервал обновления должен быть от ${config.dashboardRefreshMinSeconds} до ${config.dashboardRefreshMaxSeconds} секунд.`);
  }
  const default_screen_resolution = resolutionInput(body.default_screen_resolution, 'default_screen_resolution', {
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight
  });
  return {
    application_name,
    accent_color: accent_color.toUpperCase(),
    timezone,
    date_format,
    dashboard_refresh_seconds,
    default_screen_resolution,
    signin_logo_size: logoSize(body.signin_logo_size ?? 1)
  };
}
