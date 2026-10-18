import {
  MENU_PRICE_FONT_SIZE,
  MENU_REFERENCE,
  buildRenderLayout as buildLegacyRenderLayout,
  requestedFontScalePercent
} from './renderer-model.js';

const READABLE_ROW_HEIGHT = 66;
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

function manualReadablePositions(lines, twoColumns) {
  if (!twoColumns) {
    return {
      positions:lines.map((_line, index) => ({ row:index, column:0, full:false })),
      maxRows:Math.max(1, lines.length)
    };
  }

  const cursors = [0, 0];
  const positions = lines.map((line) => {
    const full = line?.kind === 'section' && line?.column === 'full';
    if (full) {
      const row = Math.max(...cursors);
      cursors[0] = row + 1;
      cursors[1] = row + 1;
      return { row, column:0, full:true };
    }
    const column = line?.column === 'right' ? 1 : 0;
    const row = cursors[column];
    cursors[column] += 1;
    return { row, column, full:false };
  });

  return { positions, maxRows:Math.max(1, ...cursors) };
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

  const { positions, maxRows } = manualReadablePositions(lines, twoColumns);
  const available = frame.height;
  const baseHeight = maxRows * READABLE_ROW_HEIGHT;
  const requestedPercent = requestedFontScalePercent(model.settings);
  const fitPercent = (available / Math.max(1, baseHeight)) * 100;
  const effectivePercent = Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(requestedPercent, fitPercent));
  const scale = effectivePercent / 100;
  const rowHeight = READABLE_ROW_HEIGHT * scale;
  const boxes = new Array(lines.length);
  const horizontals = new Array(lines.length);

  positions.forEach((position, lineIndex) => {
    const top = frame.y + position.row * rowHeight;
    boxes[lineIndex] = Object.freeze({
      top,
      height:rowHeight,
      bottom:top + rowHeight,
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
      rowHeight,
      usedHeight:maxRows * rowHeight,
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
    : Object.freeze({ ...legacy, styleId:'legacy', horizontals:null, columns:Object.freeze([legacy.horizontal]) });
}
