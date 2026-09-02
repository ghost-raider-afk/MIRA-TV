const DEFAULT_QUANTITIES = Object.freeze([0.5, 1, 1.5]);
const MAX_QUANTITY_COLUMNS = 6;
const TABLE_PRESETS = new Set(['clean', 'glass', 'solid', 'minimal']);
const TABLE_DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const TABLE_HEADER_STYLES = new Set(['subtle', 'accent', 'solid']);
const TABLE_PRICE_STYLES = new Set(['accent', 'bold', 'plain']);
const TABLE_PRICE_LAYOUTS = new Set(['single', 'quantities']);

function toNumber(value) {
  if (typeof value === 'string') value = value.replace(',', '.').trim();
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function option(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function colour(value, fallback) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function classCode(value) {
  const code = String(value || '').trim();
  return /^[a-z][a-z0-9_]{1,63}$/.test(code) ? code : '';
}

function unit(value, fallback = 'л') {
  const text = String(value || '').trim().slice(0, 24);
  return text || fallback;
}

export function normaliseTableConfig(source = {}) {
  const rawQuantities = Array.isArray(source.quantities)
    ? source.quantities
    : Array.isArray(source.volumes_l) ? source.volumes_l : DEFAULT_QUANTITIES;
  const quantities = [];
  for (const raw of rawQuantities) {
    const quantity = toNumber(raw);
    if (quantity === null || quantity <= 0 || quantity > 1000000 || quantities.includes(quantity)) continue;
    quantities.push(quantity);
    if (quantities.length >= MAX_QUANTITY_COLUMNS) break;
  }
  const appearanceSource = source.appearance && typeof source.appearance === 'object' ? source.appearance : {};
  return {
    class_code: classCode(source.class_code),
    group_by_class: source.group_by_class !== false,
    show_description: source.show_description === true,
    show_metadata: source.show_metadata !== false,
    price_layout: option(source.price_layout, TABLE_PRICE_LAYOUTS, 'quantities'),
    quantity_unit: unit(source.quantity_unit, 'л'),
    base_volume_l: Math.max(0.001, toNumber(source.base_volume_l) || 1),
    quantities: quantities.length ? quantities : [...DEFAULT_QUANTITIES],
    volumes_l: quantities.length ? quantities : [...DEFAULT_QUANTITIES],
    show_producer: source.show_producer !== false,
    show_strength: source.show_strength !== false,
    show_color: source.show_color !== false,
    show_filtration: source.show_filtration !== false,
    active_only: source.active_only !== false,
    row_limit: Math.min(50, Math.max(1, Math.round(toNumber(source.row_limit) || 12))),
    appearance: {
      preset: option(appearanceSource.preset, TABLE_PRESETS, 'clean'),
      density: option(appearanceSource.density, TABLE_DENSITIES, 'comfortable'),
      header_style: option(appearanceSource.header_style, TABLE_HEADER_STYLES, 'subtle'),
      price_style: option(appearanceSource.price_style, TABLE_PRICE_STYLES, 'accent'),
      accent_color: colour(appearanceSource.accent_color, '#f4c915'),
      show_title: appearanceSource.show_title !== false,
      row_dividers: appearanceSource.row_dividers !== false,
      zebra: appearanceSource.zebra === true
    }
  };
}

export function parseTargetVolumes(value) {
  const tokens = Array.isArray(value) ? value : String(value || '').split(/[;\n]+/u);
  return normaliseTableConfig({ quantities: tokens }).quantities;
}

export function resolveVolumePrice(product, targetVolume, baseVolume = 1) {
  const basePrice = toNumber(product?.base_price ?? product?.price_primary);
  const target = toNumber(targetVolume);
  const base = toNumber(product?.base_quantity ?? baseVolume);
  if (basePrice === null || target === null || base === null || base <= 0 || target <= 0) return null;
  return roundMoney(basePrice * target / base);
}

function legacyCatalogItem(product) {
  return {
    ...product,
    class_code: 'beer',
    class_name: 'Пиво',
    pricing_model: 'proportional',
    base_price: product?.price_primary ?? 0,
    base_quantity: 1,
    unit: 'л',
    description: '',
    attributes: {
      producer: product?.producer || '',
      characteristics: product?.characteristics || '',
      alcoholic: product?.alcoholic === true,
      abv: String(product?.strength || '').replace('%', '').replace('°', '').replace(',', '.'),
      beverage_color: product?.beverage_color || 'none',
      filtration: product?.filtration || 'none'
    }
  };
}

function catalogItem(item) {
  if (item?.class_code) {
    return {
      ...item,
      class_name: item.class_name || item.class_code,
      pricing_model: item.pricing_model || 'fixed',
      base_quantity: item.base_quantity || 1,
      unit: item.unit || item.default_unit || 'шт',
      attributes: item.attributes && typeof item.attributes === 'object' ? item.attributes : {}
    };
  }
  return legacyCatalogItem(item || {});
}

function filteredItems(items, config) {
  return (Array.isArray(items) ? items : [])
    .map(catalogItem)
    .filter((item) => (!config.active_only || item.active !== false) && (!config.class_code || item.class_code === config.class_code));
}

export function formatQuantity(quantity, quantityUnit = '') {
  const number = toNumber(quantity);
  if (number === null) return '';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(number);
  return quantityUnit ? `${formatted} ${quantityUnit}` : formatted;
}

export function formatVolume(volume) {
  return formatQuantity(volume, 'л');
}

function formatPlainPrice(value) {
  const number = toNumber(value);
  if (number === null) return '—';
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number);
}

export function formatPrice(value) {
  const plain = formatPlainPrice(value);
  return plain === '—' ? plain : `${plain} ₽`;
}

const ATTRIBUTE_LABELS = Object.freeze({
  light: 'светлое', dark: 'тёмное', white: 'белое', semi_dark: 'полутёмное', amber: 'янтарное', red: 'красное', rose: 'розовое',
  filtered: 'фильтрованное', unfiltered: 'нефильтрованное',
  dry: 'сухое', semi_dry: 'полусухое', semi_sweet: 'полусладкое', sweet: 'сладкое',
  mild: 'слабоострое', medium: 'острое', hot: 'очень острое'
});

function textAttribute(value) {
  if (value === undefined || value === null || value === '' || value === false || value === 'none') return '';
  if (value === true) return 'да';
  return ATTRIBUTE_LABELS[value] || String(value);
}

function itemMetadata(item, config) {
  if (!config.show_metadata) return '';
  const attributes = item.attributes || {};
  const parts = [];
  const push = (value) => {
    const text = textAttribute(value);
    if (text && !parts.includes(text)) parts.push(text);
  };

  if (config.show_producer) push(attributes.producer);
  if (config.show_strength && attributes.abv !== undefined && attributes.abv !== '') push(`${String(attributes.abv).replace('.', ',')}%`);
  if (config.show_color) push(attributes.beverage_color || attributes.wine_color);
  if (config.show_filtration) push(attributes.filtration);
  push(attributes.spiciness);
  if (attributes.weight_g) push(`${attributes.weight_g} г`);
  push(attributes.sauce);
  push(attributes.material);
  push(attributes.volume);
  if (config.show_description) push(item.description);
  if (attributes.characteristics) push(attributes.characteristics);
  return parts.join(' · ');
}

function itemBasePrice(item) {
  const base = toNumber(item.base_price);
  return base === null ? null : base;
}

function itemPriceLabel(item) {
  const base = itemBasePrice(item);
  if (base === null) return '—';
  if (['proportional', 'weight'].includes(item.pricing_model)) {
    return `${formatPrice(base)} / ${formatQuantity(item.base_quantity, item.unit)}`;
  }
  if (item.pricing_model === 'variant' && Array.isArray(item.attributes?.variants) && item.attributes.variants.length) return 'по вариантам';
  return formatPrice(base);
}

export function catalogTableColumns(configSource = {}, _itemsSource = []) {
  const config = normaliseTableConfig(configSource);
  const compact = config.appearance.preset === 'clean';
  const columns = [{ key: compact ? 'product' : 'name', label: compact ? '' : 'Название', kind: 'product', weight: compact ? 3.2 : 2.4 }];

  if (!compact && !config.group_by_class) columns.push({ key: 'class_name', label: 'Класс', kind: 'text', weight: 1.05 });
  if (!compact && config.show_metadata) columns.push({ key: 'metadata', label: 'Описание', kind: 'text', weight: 1.8 });

  if (config.price_layout === 'quantities') {
    for (const quantity of config.quantities) {
      columns.push({ key: `price:${quantity}`, label: formatQuantity(quantity, config.quantity_unit), kind: 'price', quantity, weight: 0.82 });
    }
  } else {
    columns.push({ key: 'price', label: 'Цена', kind: 'price', weight: 1.05 });
  }
  return columns;
}

export function buildCatalogTableRows(itemsSource, configSource = {}) {
  const config = normaliseTableConfig(configSource);
  const items = filteredItems(itemsSource, config).slice(0, config.row_limit);
  return items.map((item) => {
    const name = String(item.name || 'Без названия');
    const metadata = itemMetadata(item, config);
    const values = {
      name,
      class_name: String(item.class_name || ''),
      metadata,
      product: metadata ? `${name}\n${metadata}` : name,
      price: itemPriceLabel(item)
    };
    if (config.price_layout === 'quantities') {
      for (const quantity of config.quantities) {
        const price = resolveVolumePrice(item, quantity, item.base_quantity);
        values[`price:${quantity}`] = config.appearance.preset === 'clean' ? formatPlainPrice(price) : formatPrice(price);
      }
    }
    return {
      id: item.id ?? null,
      class_code: item.class_code || '',
      group: config.group_by_class ? String(item.class_name || '') : '',
      values
    };
  });
}
