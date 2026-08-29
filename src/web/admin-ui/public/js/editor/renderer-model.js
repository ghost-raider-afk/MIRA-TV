const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_FONT_KEY = 'arial-narrow';
export const TV1_REFERENCE_SCALE = 1.05;

export const MENU_FONT_OPTIONS = Object.freeze([
  Object.freeze({ key: 'arial-narrow', label: 'Arial Narrow', family: 'Arial Narrow, Liberation Sans Narrow, DejaVu Sans Condensed, Arial, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'tahoma-bold', label: 'Tahoma Bold', family: 'Tahoma, Arial, sans-serif', weightFloor: 700 }),
  Object.freeze({ key: 'arial', label: 'Arial', family: 'Arial, Liberation Sans, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'dejavu-condensed', label: 'DejaVu Sans Condensed', family: 'DejaVu Sans Condensed, DejaVu Sans, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'liberation-narrow', label: 'Liberation Sans Narrow', family: 'Liberation Sans Narrow, Liberation Sans, Arial, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'system-sans', label: 'Системный sans-serif', family: 'Arial, sans-serif', weightFloor: 400 })
]);

export const MENU_REFERENCE = Object.freeze({
  width: 1920,
  height: 1080,
  tableX: 56,
  tableRight: 1430,
  tableWidth: 1374,
  tableTop: 15,
  tableBottom: 940,
  tableHeight: 925,
  rowHeight: 53.5,
  sectionInset: 4,
  separatorInset: 9,
  secondaryPriceX: 1405,
  priceColumnGap: 147,
  rightZoneX: 1495,
  bottomZoneY: 940,
  fontScaleMinPercent: 55,
  fontScaleMaxPercent: 130
});

export const MENU_TABLE_STYLE = Object.freeze({
  defaultBackground: '#101828',
  defaultAccent: '#F6C90E',
  defaultText: '#F4F7FA',
  darkText: '#101317',
  separator: '#8B929A',
  secondaryText: '#C5CBD2',
  accentSecondaryText: '#DFC34F',
  packagingBackground: '#121820',
  promotion: '#D92D35'
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function enabledRows(rows) {
  return rows.filter((row) => row && row.enabled !== false);
}

function recordById(records, id) {
  return records.find((record) => Number(record.id) === Number(id));
}

function normalizeHex(value, fallback) {
  return HEX.test(String(value || '')) ? String(value).toUpperCase() : fallback;
}

function rgb(value) {
  const parsed = Number.parseInt(normalizeHex(value, '#000000').slice(1), 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

function hex({ r, g, b }) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function mix(source, target, amount) {
  const left = rgb(source);
  const right = rgb(target);
  return hex({
    r: left.r + (right.r - left.r) * amount,
    g: left.g + (right.g - left.g) * amount,
    b: left.b + (right.b - left.b) * amount
  });
}

function luminance(value) {
  const color = rgb(value);
  const channel = (input) => {
    const normalized = input / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function foregroundFor(background) {
  return contrast(background, MENU_TABLE_STYLE.darkText) >= contrast(background, '#FFFFFF')
    ? MENU_TABLE_STYLE.darkText
    : '#FFFFFF';
}

function readableColor(source, background) {
  const color = normalizeHex(source, MENU_TABLE_STYLE.defaultText);
  if (contrast(color, background) >= 4.5) return color;
  const target = contrast('#FFFFFF', background) >= contrast(MENU_TABLE_STYLE.darkText, background)
    ? '#FFFFFF'
    : MENU_TABLE_STYLE.darkText;
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mix(color, target, step / 10);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return target;
}

export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function truncateText(value, maximum) {
  const text = String(value ?? '');
  return text.length > maximum ? `${text.slice(0, Math.max(1, maximum - 1))}…` : text;
}

export function priceParts(value) {
  if (!value && value !== 0) return null;
  const normalized = String(value).replace(',', '.');
  const [whole = '0', decimal = ''] = normalized.split('.');
  return { whole, cents: decimal.padEnd(2, '0').slice(0, 2) };
}

export function formatStrength(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  const numericStrength = compact.match(/^(\d+(?:[.,]\d+)?)(?:°|%|об\.?%?)?$/i);
  if (numericStrength) return `${numericStrength[1]}%`;
  return text.replaceAll('°', '%');
}

function beverageColorLabel(value) {
  if (value === 'light') return 'светлое';
  if (value === 'dark') return 'тёмное';
  return '';
}

function filtrationLabel(value) {
  if (value === 'filtered') return 'фильтрованное';
  if (value === 'unfiltered') return 'нефильтрованное';
  return '';
}

export function formatProductMetadata(product) {
  return [
    product?.producer || '',
    formatStrength(product?.strength || ''),
    beverageColorLabel(product?.beverage_color),
    filtrationLabel(product?.filtration)
  ].filter(Boolean).join(' · ');
}

function fontDefinition(value) {
  return MENU_FONT_OPTIONS.find((font) => font.key === value)
    || MENU_FONT_OPTIONS.find((font) => font.key === DEFAULT_FONT_KEY);
}

export function buildMenuPalette(settings = {}) {
  const background = normalizeHex(settings.background_color, MENU_TABLE_STYLE.defaultBackground);
  const accent = normalizeHex(settings.accent_color, MENU_TABLE_STYLE.defaultAccent);
  const primaryText = readableColor(settings.text_color, background);
  return Object.freeze({
    background,
    accent,
    sectionText: foregroundFor(accent),
    primaryText,
    secondaryText: readableColor(MENU_TABLE_STYLE.secondaryText, background),
    accentText: readableColor(accent, background),
    accentSecondaryText: readableColor(MENU_TABLE_STYLE.accentSecondaryText, background)
  });
}

export function requestedFontScalePercent(settings = {}) {
  return clamp(
    numeric(settings.font_scale_percent, 100),
    MENU_REFERENCE.fontScaleMinPercent,
    MENU_REFERENCE.fontScaleMaxPercent
  );
}

export function buildRenderModel(editorState, viewport = {}) {
  const width = Math.max(1, Math.round(numeric(viewport.width, DEFAULT_WIDTH)));
  const height = Math.max(1, Math.round(numeric(viewport.height, DEFAULT_HEIGHT)));
  const settings = structuredClone(editorState?.settings || {});
  const rows = enabledRows(Array.isArray(editorState?.rows) ? editorState.rows : []);
  return Object.freeze({
    viewport: Object.freeze({ width, height, aspectRatio: width / height }),
    settings: Object.freeze(settings),
    rows: Object.freeze(rows.map((row, index) => Object.freeze({ ...structuredClone(row), renderIndex: index })))
  });
}

export function buildDisplayLines(model, { products = [], packaging = [], fallbackTitle = 'Меню' } = {}) {
  const lines = [];
  let toneIndex = 0;
  let firstSectionSeen = false;
  const sourceRows = model.rows.length
    ? model.rows
    : [{ id: 'render-base-section', kind: 'section', name: fallbackTitle, enabled: true, renderIndex: -1 }];

  if (sourceRows[0]?.kind !== 'section') {
    lines.push(Object.freeze({ kind: 'section', name: fallbackTitle, showPriceLabels: true, virtual: true }));
    firstSectionSeen = true;
  }

  for (const row of sourceRows) {
    if (row.kind === 'section') {
      lines.push(Object.freeze({
        kind: 'section',
        name: row.name || fallbackTitle,
        showPriceLabels: !firstSectionSeen,
        virtual: row.renderIndex === -1
      }));
      firstSectionSeen = true;
      toneIndex = 0;
      continue;
    }

    if (row.kind === 'item') {
      const product = recordById(products, row.product_id ?? row.productId);
      const tone = toneIndex % 2 === 0 ? 'light' : 'accent';
      toneIndex += 1;
      lines.push(Object.freeze({
        kind: 'item',
        tone,
        name: product?.name || row.name || 'Продукция не выбрана',
        metadata: formatProductMetadata(product),
        promotion: row.promotion === true,
        promotionText: row.promotion_text || row.promotionText || '',
        pricePrimary: product?.price_primary || row.price_primary || row.pricePrimary || '',
        priceSecondary: product?.price_secondary || row.price_secondary || row.priceSecondary || ''
      }));
      continue;
    }

    if (row.kind === 'packaging') {
      const item = recordById(packaging, row.packaging_id ?? row.packagingId);
      const entry = Object.freeze({
        name: item?.name || row.name || 'Тара не выбрана',
        unitPrice: item?.unit_price || row.unit_price || row.unitPrice || '',
        tone: toneIndex % 2 === 0 ? 'light' : 'accent'
      });
      toneIndex += 1;
      const previous = lines.at(-1);
      if (previous?.kind === 'packaging' && previous.items.length < 2) {
        lines[lines.length - 1] = Object.freeze({ ...previous, items: Object.freeze([...previous.items, entry]) });
      } else {
        lines.push(Object.freeze({ kind: 'packaging', items: Object.freeze([entry]) }));
      }
    }
  }

  return Object.freeze(lines);
}

function tableFrame(model) {
  const x = clamp(Math.round(numeric(model.settings.table_x, MENU_REFERENCE.tableX)), 0, Math.max(0, model.viewport.width - 1));
  const y = clamp(Math.round(numeric(model.settings.table_y, MENU_REFERENCE.tableTop)), 0, Math.max(0, model.viewport.height - 1));
  const width = clamp(Math.round(numeric(model.settings.table_width_px, MENU_REFERENCE.tableWidth)), 1, Math.max(1, model.viewport.width - x));
  const height = clamp(Math.round(numeric(model.settings.table_height_px, MENU_REFERENCE.tableHeight)), 1, Math.max(1, model.viewport.height - y));
  return Object.freeze({ x, y, width, height });
}

export function buildRenderLayout(model, lines) {
  const frame = tableFrame(model);
  const available = frame.height;
  const baseHeight = Math.max(1, lines.length * MENU_REFERENCE.rowHeight);
  const requestedPercent = requestedFontScalePercent(model.settings);
  const fitPercent = (available / baseHeight) * 100;
  const effectivePercent = Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(requestedPercent, fitPercent));
  const scale = effectivePercent / 100;
  const rowHeight = MENU_REFERENCE.rowHeight * scale;
  const fits = baseHeight * scale <= available + 0.5;
  const boxes = lines.map((_line, index) => Object.freeze({
    top: frame.y + index * rowHeight,
    height: rowHeight,
    bottom: frame.y + (index + 1) * rowHeight,
    gapBefore: 0
  }));
  const scaleX = frame.width / MENU_REFERENCE.tableWidth;
  const secondaryPriceX = frame.x + (MENU_REFERENCE.secondaryPriceX - MENU_REFERENCE.tableX) * scaleX;
  const primaryPriceX = secondaryPriceX - MENU_REFERENCE.priceColumnGap * scaleX;

  return Object.freeze({
    frame,
    horizontal: Object.freeze({
      left: frame.x,
      right: frame.x + frame.width,
      tableWidth: frame.width,
      scaleX,
      primaryPriceX,
      secondaryPriceX,
      nameWidth: primaryPriceX - frame.x
    }),
    vertical: Object.freeze({
      top: frame.y,
      bottom: frame.y + frame.height,
      availableHeight: available,
      baseContentHeight: baseHeight,
      requestedPercent: Math.round(requestedPercent * 10) / 10,
      fitPercent: Math.round(fitPercent * 10) / 10,
      effectivePercent: Math.round(effectivePercent * 10) / 10,
      scale,
      rowHeight,
      usedHeight: lines.length * rowHeight,
      fits,
      autoReduced: effectivePercent + 0.05 < requestedPercent,
      boxes: Object.freeze(boxes)
    }),
    palette: buildMenuPalette(model.settings),
    typography: fontDefinition(model.settings.font_family)
  });
}

export function renderFingerprint(model) {
  return JSON.stringify({ viewport: model.viewport, settings: model.settings, rows: model.rows });
}
