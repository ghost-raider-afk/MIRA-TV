import {
  MENU_PRICE_FONT_SIZE,
  MENU_REFERENCE,
  buildRenderLayout as buildLegacyRenderLayout,
  requestedFontScalePercent
} from './renderer-model.js';

const READABLE_ROW_HEIGHT = 70;
const READABLE_COLUMN_GAP = 24;

function sectionGroups(lines) {
  const groups = [];
  let current = null;
  lines.forEach((line, index) => {
    if (line?.kind === 'section' || !current) {
      current = { indexes:[] };
      groups.push(current);
    }
    current.indexes.push(index);
  });
  return groups;
}

function bestSequentialSplit(groups) {
  if (groups.length < 2) return null;
  const sizes = groups.map((group) => group.indexes.length);
  const total = sizes.reduce((sum, value) => sum + value, 0);
  let left = 0;
  let best = { cut:1, difference:Number.POSITIVE_INFINITY };
  for (let cut = 1; cut < groups.length; cut += 1) {
    left += sizes[cut - 1];
    const difference = Math.abs(left - (total - left));
    if (difference < best.difference) best = { cut, difference };
  }
  return best.cut;
}

function readableHorizontal(left, width) {
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
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function readableLayout(model, lines, legacy) {
  const frame = legacy.frame;
  const groups = sectionGroups(lines);
  const split = bestSequentialSplit(groups);
  const twoColumns = split !== null && frame.width >= 900;
  const gap = twoColumns ? Math.min(READABLE_COLUMN_GAP, frame.width * .025) : 0;
  const columnWidth = twoColumns ? (frame.width - gap) / 2 : frame.width;
  const columns = twoColumns
    ? [readableHorizontal(frame.x, columnWidth), readableHorizontal(frame.x + columnWidth + gap, columnWidth)]
    : [readableHorizontal(frame.x, frame.width)];

  const lineColumns = new Array(lines.length).fill(0);
  if (twoColumns) {
    groups.forEach((group, groupIndex) => {
      const column = groupIndex < split ? 0 : 1;
      group.indexes.forEach((index) => { lineColumns[index] = column; });
    });
  }

  const indexesByColumn = columns.map((_column, columnIndex) =>
    lineColumns.map((column, index) => column === columnIndex ? index : -1).filter((index) => index >= 0));
  const maxRows = Math.max(1, ...indexesByColumn.map((indexes) => indexes.length));
  const available = frame.height;
  const baseHeight = maxRows * READABLE_ROW_HEIGHT;
  const requestedPercent = requestedFontScalePercent(model.settings);
  const fitPercent = (available / Math.max(1, baseHeight)) * 100;
  const effectivePercent = Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(requestedPercent, fitPercent));
  const scale = effectivePercent / 100;
  const rowHeight = READABLE_ROW_HEIGHT * scale;
  const boxes = new Array(lines.length);
  const horizontals = new Array(lines.length);

  indexesByColumn.forEach((indexes, columnIndex) => {
    indexes.forEach((lineIndex, position) => {
      const top = frame.y + position * rowHeight;
      boxes[lineIndex] = Object.freeze({
        top,
        height:rowHeight,
        bottom:top + rowHeight,
        gapBefore:0,
        column:columnIndex
      });
      horizontals[lineIndex] = columns[columnIndex];
    });
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
