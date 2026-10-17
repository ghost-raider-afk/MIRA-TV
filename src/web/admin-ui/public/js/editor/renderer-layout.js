import {
  MENU_PRICE_FONT_SIZE,
  MENU_REFERENCE,
  buildRenderLayout as buildLegacyRenderLayout,
  requestedFontScalePercent
} from './renderer-model.js';

const READABLE_ROW_HEIGHT = 66;
const COMPACT_ROW_RATIO = .72;
const READABLE_COLUMN_GAP = 24;
const MIN_TWO_COLUMN_WIDTH = 900;

function readableHorizontal(left, width, extra = {}) {
  const scaleX = width / MENU_REFERENCE.tableWidth;
  const right = left + width;
  const rightPadding = Math.max(12, width * .025);
  const priceCellWidth = Math.max(104, width * .155);
  const primaryPriceX = right - rightPadding;
  const priceZoneLeft = primaryPriceX - priceCellWidth;
  const textGap = Math.max(16, width * .024);
  const textRight = priceZoneLeft - textGap;
  return Object.freeze({
    left,
    right,
    tableWidth:width,
    scaleX,
    priceCellWidth,
    priceColumnGap:0,
    priceZoneLeft,
    textGap,
    textRight,
    primaryPriceX,
    secondaryPriceX:primaryPriceX,
    nameWidth:textRight - left,
    ...extra
  });
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function hasSecondaryMetadata(line, readable) {
  if (line?.kind !== 'item') return true;
  const metadata = readable && typeof line.metadataReadable === 'string'
    ? line.metadataReadable
    : line.metadata;
  return Boolean(String(metadata || '').trim());
}

function lineBaseHeight(line, readable) {
  const normal = readable ? READABLE_ROW_HEIGHT : MENU_REFERENCE.rowHeight;
  if (line?.kind === 'item' && !hasSecondaryMetadata(line, readable)) return normal * COMPACT_ROW_RATIO;
  return normal;
}

function variableLegacyLayout(model, lines, legacy) {
  const baseHeights = lines.map((line) => lineBaseHeight(line, false));
  const baseHeight = Math.max(1, baseHeights.reduce((sum, value) => sum + value, 0));
  const available = legacy.frame.height;
  const requestedPercent = requestedFontScalePercent(model.settings);
  const fitPercent = (available / baseHeight) * 100;
  const effectivePercent = Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(requestedPercent, fitPercent));
  const scale = effectivePercent / 100;
  let cursor = legacy.frame.y;
  const boxes = baseHeights.map((height) => {
    const scaledHeight = height * scale;
    const box = Object.freeze({
      top:cursor,
      height:scaledHeight,
      bottom:cursor + scaledHeight,
      gapBefore:0
    });
    cursor += scaledHeight;
    return box;
  });

  return Object.freeze({
    ...legacy,
    styleId:'legacy',
    horizontals:null,
    columns:Object.freeze([legacy.horizontal]),
    vertical:Object.freeze({
      ...legacy.vertical,
      baseContentHeight:baseHeight,
      requestedPercent:rounded(requestedPercent),
      fitPercent:rounded(fitPercent),
      effectivePercent:rounded(effectivePercent),
      scale,
      rowHeight:MENU_REFERENCE.rowHeight * scale,
      usedHeight:baseHeight * scale,
      fits:baseHeight * scale <= available + .5,
      autoReduced:effectivePercent + .05 < requestedPercent,
      boxes:Object.freeze(boxes)
    })
  });
}

function manualReadablePositions(lines, twoColumns) {
  if (!twoColumns) {
    let cursor = 0;
    const positions = lines.map((line) => {
      const height = lineBaseHeight(line, true);
      const position = { top:cursor, height, column:0, full:false };
      cursor += height;
      return position;
    });
    return { positions, baseHeight:Math.max(1, cursor) };
  }

  const cursors = [0, 0];
  const positions = lines.map((line) => {
    const height = lineBaseHeight(line, true);
    const full = line?.kind === 'section' && line?.column === 'full';
    if (full) {
      const top = Math.max(...cursors);
      cursors[0] = top + height;
      cursors[1] = top + height;
      return { top, height, column:0, full:true };
    }
    const column = line?.column === 'right' ? 1 : 0;
    const top = cursors[column];
    cursors[column] += height;
    return { top, height, column, full:false };
  });

  return { positions, baseHeight:Math.max(1, ...cursors) };
}

function readableLayout(model, lines, legacy) {
  const frame = legacy.frame;
  const twoColumns = frame.width >= MIN_TWO_COLUMN_WIDTH;
  const gap = twoColumns ? Math.min(READABLE_COLUMN_GAP, frame.width * .025) : 0;
  const columnWidth = twoColumns ? (frame.width - gap) / 2 : frame.width;
  const columns = twoColumns
    ? [readableHorizontal(frame.x, columnWidth), readableHorizontal(frame.x + columnWidth + gap, columnWidth)]
    : [readableHorizontal(frame.x, frame.width)];
  const fullHorizontal = twoColumns
    ? readableHorizontal(frame.x, frame.width, { fullWidth:true })
    : columns[0];

  const { positions, baseHeight } = manualReadablePositions(lines, twoColumns);
  const available = frame.height;
  const requestedPercent = requestedFontScalePercent(model.settings);
  const fitPercent = (available / baseHeight) * 100;
  const effectivePercent = Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(requestedPercent, fitPercent));
  const scale = effectivePercent / 100;
  const boxes = new Array(lines.length);
  const horizontals = new Array(lines.length);

  positions.forEach((position, lineIndex) => {
    const top = frame.y + position.top * scale;
    const height = position.height * scale;
    boxes[lineIndex] = Object.freeze({
      top,
      height,
      bottom:top + height,
      gapBefore:0,
      column:position.full ? 'full' : position.column
    });
    horizontals[lineIndex] = position.full ? fullHorizontal : columns[position.column];
  });

  const themeTableStyle = Object.freeze({
    ...(legacy.themeTableStyle || {}),
    table_style_mode:'readable',
    separator_dashed:false,
    separator:'#6E747C',
    item_tone_mode:'alternating',
    price_mode:'alternating',
    price_column_borders:false,
    show_sequence:false
  });

  return Object.freeze({
    ...legacy,
    styleId:'readable',
    horizontal:columns[0],
    horizontals:Object.freeze(horizontals),
    columns:Object.freeze(columns),
    columnGap:gap,
    vertical:Object.freeze({
      top:frame.y,
      bottom:frame.y + frame.height,
      availableHeight:available,
      baseContentHeight:baseHeight,
      requestedPercent:rounded(requestedPercent),
      fitPercent:rounded(fitPercent),
      effectivePercent:rounded(effectivePercent),
      scale,
      rowHeight:READABLE_ROW_HEIGHT * scale,
      usedHeight:baseHeight * scale,
      fits:baseHeight * scale <= available + .5,
      autoReduced:effectivePercent + .05 < requestedPercent,
      boxes:Object.freeze(boxes)
    }),
    themeTableStyle,
    priceFontSizePt:Math.min(MENU_PRICE_FONT_SIZE.maxPt, Math.max(31, legacy.priceFontSizePt || MENU_PRICE_FONT_SIZE.defaultPt))
  });
}

export function buildMenuRenderLayout(model, lines) {
  const legacy = buildLegacyRenderLayout(model, lines);
  return String(model?.settings?.table_style || 'legacy') === 'readable'
    ? readableLayout(model, lines, legacy)
    : variableLegacyLayout(model, lines, legacy);
}
