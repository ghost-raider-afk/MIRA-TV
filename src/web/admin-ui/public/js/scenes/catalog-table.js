const DEFAULT_VOLUMES = Object.freeze([0.5, 1, 1.5]);
const MAX_VOLUME_COLUMNS = 6;
const TABLE_PRESETS = new Set(['clean', 'glass', 'solid', 'minimal']);
const TABLE_DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const TABLE_HEADER_STYLES = new Set(['subtle', 'accent', 'solid']);
const TABLE_PRICE_STYLES = new Set(['accent', 'bold', 'plain']);

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

export function normaliseTableConfig(source = {}) {
  const rawVolumes = Array.isArray(source.volumes_l) ? source.volumes_l : DEFAULT_VOLUMES;
  const volumes = [];
  for (const raw of rawVolumes) {
    const volume = toNumber(raw);
    if (volume === null || volume <= 0 || volume > 1000 || volumes.includes(volume)) continue;
    volumes.push(volume);
    if (volumes.length >= MAX_VOLUME_COLUMNS) break;
  }
  const appearanceSource = source.appearance && typeof source.appearance === 'object' ? source.appearance : {};
  return {
    base_volume_l: Math.max(0.001, toNumber(source.base_volume_l) || 1),
    volumes_l: volumes.length ? volumes : [...DEFAULT_VOLUMES],
    show_producer: source.show_producer === true,
    show_strength: source.show_strength !== false,
    show_color: source.show_color === true,
    show_filtration: source.show_filtration === true,
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
  return normaliseTableConfig({ volumes_l: tokens }).volumes_l;
}

export function resolveVolumePrice(product, targetVolume, baseVolume = 1) {
  const basePrice = toNumber(product?.price_primary);
  const target = toNumber(targetVolume);
  const base = toNumber(baseVolume);
  if (basePrice === null || target === null || base === null || base <= 0 || target <= 0) return null;
  return roundMoney(basePrice * target / base);
}

export function formatVolume(volume) {
  const number = toNumber(volume);
  if (number === null) return '';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(number)} л`;
}

export function formatPrice(value) {
  const number = toNumber(value);
  if (number === null) return '—';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number)} ₽`;
}

function colourLabel(value) {
  const labels = { light: 'Светлое', dark: 'Тёмное', amber: 'Янтарное', red: 'Красное', none: '' };
  return labels[value] || String(value || '');
}

function filtrationLabel(value) {
  const labels = { filtered: 'Фильтр.', unfiltered: 'Нефильтр.', none: '' };
  return labels[value] || String(value || '');
}

export function catalogTableColumns(configSource = {}) {
  const config = normaliseTableConfig(configSource);
  const columns = [{ key: 'name', label: 'Название', kind: 'text', weight: 2.2 }];
  if (config.show_producer) columns.push({ key: 'producer', label: 'Производитель', kind: 'text', weight: 1.25 });
  if (config.show_strength) columns.push({ key: 'strength', label: 'Крепость', kind: 'text', weight: 0.8 });
  if (config.show_color) columns.push({ key: 'beverage_color', label: 'Цвет', kind: 'text', weight: 0.85 });
  if (config.show_filtration) columns.push({ key: 'filtration', label: 'Фильтрация', kind: 'text', weight: 0.9 });
  for (const volume of config.volumes_l) {
    columns.push({ key: `price:${volume}`, label: formatVolume(volume), kind: 'price', volume, weight: 0.85 });
  }
  return columns;
}

export function buildCatalogTableRows(products, configSource = {}) {
  const config = normaliseTableConfig(configSource);
  const list = Array.isArray(products) ? products : [];
  return list
    .filter((product) => !config.active_only || product?.active !== false)
    .slice(0, config.row_limit)
    .map((product) => {
      const values = {
        name: String(product?.name || 'Без названия'),
        producer: String(product?.producer || ''),
        strength: String(product?.strength || ''),
        beverage_color: colourLabel(product?.beverage_color),
        filtration: filtrationLabel(product?.filtration)
      };
      for (const volume of config.volumes_l) {
        values[`price:${volume}`] = formatPrice(resolveVolumePrice(product, volume, config.base_volume_l));
      }
      return { id: product?.id ?? null, values };
    });
}
