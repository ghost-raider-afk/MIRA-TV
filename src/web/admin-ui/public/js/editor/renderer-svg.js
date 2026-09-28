import {
  MENU_REFERENCE,
  MENU_PRICE_FONT_SIZE,
  MENU_TABLE_STYLE,
  TV1_REFERENCE_SCALE,
  buildRenderLayout,
  escapeXml,
  fontDefinition,
  priceParts,
  truncateText
} from './renderer-model.js';

function textAttributes({ size, weight = 400, fill, letterSpacing = 0, anchor = null, opacity = null, fontFamily = null }, typography) {
  const resolvedWeight = Math.max(weight, typography?.weightFloor || 400);
  return [
    `font-size="${size}"`, `font-weight="${resolvedWeight}"`, fill ? `fill="${fill}"` : '',
    letterSpacing ? `letter-spacing="${letterSpacing}"` : '', anchor ? `text-anchor="${anchor}"` : '',
    opacity !== null ? `opacity="${opacity}"` : '', fontFamily ? `font-family="${fontFamily}"` : ''
  ].filter(Boolean).join(' ');
}

function separatorMarkup(box, horizontal, scale, themeId = 'legacy', themeStyle = {}) {
  const y = box.bottom - 2 * scale;
  const dashed = typeof themeStyle.separator_dashed === 'boolean'
    ? themeStyle.separator_dashed
    : themeId === 'legacy' || themeId === 'chalk';
  const stroke = themeStyle.separator || (themeId === 'chalk' ? '#5B5B56' : MENU_TABLE_STYLE.separator);
  const opacity = themeId === 'legacy' ? '.65' : themeId === 'chalk' ? '.50' : '.42';
  return `<line x1="${horizontal.left + MENU_REFERENCE.separatorInset * horizontal.scaleX}" y1="${y}" x2="${horizontal.right}" y2="${y}" class="separator" stroke="${stroke}" stroke-width="${Math.max(1, scale)}"${dashed ? ` stroke-dasharray="${6 * scale} ${7 * scale}"` : ''} opacity="${opacity}"/>`;
}

function priceMarkup(value, x, baseline, scale, toneColor, typography, priceFontSizePt, className = 'price') {
  const parts = priceParts(value);
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const baseSize = Math.max(MENU_PRICE_FONT_SIZE.minPt, Math.min(MENU_PRICE_FONT_SIZE.maxPt, Number(priceFontSizePt) || MENU_PRICE_FONT_SIZE.defaultPt));
  const wholeSize = baseSize * fontScale;
  const centsSize = wholeSize * (14 / 27);
  const centsLift = wholeSize * (16 / 27);
  const attributes = textAttributes({ size: wholeSize, weight: 700, fill: toneColor, anchor: 'end' }, typography);
  if (!parts) return `<text x="${x}" y="${baseline}" class="${className}" ${attributes}>—</text>`;
  return `<text x="${x}" y="${baseline}" class="${className}" ${attributes}>${escapeXml(parts.whole)}<tspan class="cents" dy="${-centsLift}" font-size="${centsSize}" font-weight="700" fill="${toneColor}">${escapeXml(parts.cents)}</tspan></text>`;
}

function promotionShapePath(shape, x, top, width, height, notch) {
  const right = x + width;
  const bottom = top + height;
  const middle = top + height / 2;
  const cut = Math.min(notch, height * .28);
  if (shape === 'capsule') {
    const radius = height / 2;
    return `M${x + radius} ${top}H${right - radius}A${radius} ${radius} 0 0 1 ${right} ${middle}A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${middle}A${radius} ${radius} 0 0 1 ${x + radius} ${top}Z`;
  }
  if (shape === 'cut') {
    return `M${x + cut} ${top}H${right - cut}L${right} ${top + cut}V${bottom - cut}L${right - cut} ${bottom}H${x + cut}L${x} ${bottom - cut}V${top + cut}Z`;
  }
  if (shape === 'chevron') {
    return `M${x} ${top}H${right - notch}L${right} ${middle}L${right - notch} ${bottom}H${x}L${x + notch * .72} ${middle}Z`;
  }
  if (shape === 'tag') {
    return `M${x + notch} ${top}H${right}V${bottom}H${x + notch}L${x} ${middle}Z`;
  }
  return `M${x} ${top}H${right - notch}L${right} ${middle}L${right - notch} ${bottom}H${x}Z`;
}

function promotionMarkup(line, x, box, scale, typography, textBaseline, settings = {}) {
  if (!line.promotion || !line.promotionText) return { markup:'', width:0 };
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const text = truncateText(line.promotionText, 12);
  const width = Math.min(143 * fontScale, Math.max(75 * fontScale, ([...text].length * 9.8 + 26) * fontScale));
  const height = 29.7 * fontScale;
  const preferredTextY = Number.isFinite(textBaseline) ? textBaseline : box.top + 20.3 * fontScale;
  const preferredTop = preferredTextY - 20.3 * fontScale;
  const minTop = box.top + .35 * scale;
  const maxTop = Math.max(minTop, box.bottom - height - .35 * scale);
  const top = Math.min(maxTop, Math.max(minTop, preferredTop));
  const textY = top + 20.3 * fontScale;
  const notch = 9.9 * fontScale;
  const shapeKey = ['base','capsule','cut','chevron','tag'].includes(settings.promotion_badge_shape)
    ? settings.promotion_badge_shape
    : 'base';
  const shape = promotionShapePath(shapeKey, x, top, width, height, notch);
  const clipId = `mira-promo-badge-clip-${Math.round(box.top * 10)}-${Math.round(x * 10)}`;
  const promoFont = fontDefinition(settings.promotion_font_family);
  const promoSize = 15 * fontScale * (Number(settings.promotion_font_size_percent || 100) / 100);
  const promoWeight = Math.max(400, Math.min(900, Number(settings.promotion_font_weight || 900)));
  const promoHeight = Math.max(.7, Math.min(1.8, Number(settings.promotion_font_height_percent || 112) / 100));
  const promoTracking = Number(settings.promotion_letter_spacing_px || 0) * fontScale;
  const textCenter = shapeKey === 'base'
    ? x + (width - notch) / 2
    : shapeKey === 'tag'
      ? x + notch + (width - notch) / 2
      : x + width / 2;

  return {
    width,
    markup:`<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${shape}"/></clipPath></defs>
    <g class="promotion-badge" data-promotion-badge-shape="${shapeKey}">
      <path d="${shape}" fill="url(#mira-promo-badge-depth)" stroke="rgba(255,255,255,.30)" stroke-width="${Math.max(.7,.85 * fontScale)}"/>
      <rect x="${x}" y="${top}" width="${width}" height="${height * .48}" fill="url(#mira-promo-badge-bevel)" clip-path="url(#${clipId})" pointer-events="none"/>
    </g>
    <g class="promotion-badge-label" pointer-events="none">
      <text x="${textCenter}" y="${textY}" class="promotion" transform="translate(0 ${textY}) scale(1 ${promoHeight}) translate(0 ${-textY})" ${textAttributes({ size:promoSize, weight:promoWeight, fill:'#FFFFFF', letterSpacing:promoTracking, anchor:'middle', fontFamily:promoFont.family }, promoFont)}>${escapeXml(text)}</text>
    </g>`
  };
}

function sectionMarkup(line, box, horizontal, palette, scale, typography, themeId = 'legacy') {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const title = String(line.name || 'Меню');
  const baseline = box.top + 35 * fontScale;
  const titleWidth = line.showPriceLabels ? horizontal.primaryPriceX - horizontal.left - 45 * horizontal.scaleX : horizontal.tableWidth;
  const maximumCharacters = Math.max(16, Math.floor(titleWidth / (17 * fontScale)));
  const priceLabelCenterOffset = (MENU_REFERENCE.priceColumnGap / 3) * horizontal.scaleX;
  const labels = line.showPriceLabels
    ? `<text x="${horizontal.primaryPriceX - priceLabelCenterOffset}" y="${baseline}" class="price-label" ${textAttributes({ size: 22 * fontScale, weight: 700, fill: palette.sectionText, anchor: 'middle' }, typography)}>1 л</text>
      <text x="${horizontal.secondaryPriceX - priceLabelCenterOffset}" y="${baseline}" class="price-label" ${textAttributes({ size: 22 * fontScale, weight: 700, fill: palette.sectionText, anchor: 'middle' }, typography)}>1,5 л</text>` : '';
  const rectHeight = Math.max(1, box.height - MENU_REFERENCE.sectionInset * scale);
  const fill = themeId === 'premium'
    ? 'url(#mira-theme-premium-gold)'
    : themeId === 'chalk'
      ? 'url(#mira-theme-chalk-gold)'
      : themeId === 'brand-premium'
        ? 'url(#mira-theme-brand-gold)'
        : palette.accent;
  const radius = themeId === 'chalk' ? 3 : themeId === 'legacy' ? 5 : 7;
  const stroke = themeId === 'chalk' ? ' stroke="#F4E7B0" stroke-opacity=".20" stroke-width="1"' : '';
  return `<g class="table-section theme-${themeId}"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${rectHeight}" rx="${radius}" ry="${radius}" fill="${fill}"${stroke}/><text x="${horizontal.left + 19 * horizontal.scaleX}" y="${baseline}" class="section-title" ${textAttributes({ size: 28 * fontScale, weight: 700, fill: palette.sectionText, letterSpacing: 0.3 }, typography)}>${escapeXml(truncateText(title, maximumCharacters))}</text>${labels}</g>`;
}

function itemMarkup(line, box, horizontal, palette, scale, typography, settings, priceFontSizePt, themeId = 'legacy', themeStyle = {}, themeTypography = {}) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const toneColor = line.tone === 'accent' ? palette.accentText : palette.primaryText;
  const metaColor = line.tone === 'accent' ? palette.accentSecondaryText : palette.secondaryText;
  const themed = themeId !== 'legacy';
  const showSequence = themed && themeStyle.show_sequence !== false;
  const numberX = horizontal.left + 16 * horizontal.scaleX;
  const nameX = horizontal.left + (showSequence ? 55 : 22) * horizontal.scaleX;
  const priceBaseline = box.top + 35 * fontScale;
  const hasMetadata = Boolean(line.metadata);
  const nameBaseline = hasMetadata ? box.top + 21 * fontScale : priceBaseline;
  const metaBaseline = box.top + 44.5 * fontScale;
  const nameSize = (hasMetadata ? 24 : 25) * fontScale;
  const metaSize = 13.5 * fontScale;
  const itemFont = themeTypography.item || typography;
  const metaFont = themeTypography.meta || typography;
  const priceFont = themeTypography.price || typography;
  const promotion = promotionMarkup(line, nameX, box, scale, itemFont, nameBaseline, settings);
  const itemNameX = nameX + (promotion.width ? promotion.width + 11 * fontScale : 0);
  const nameCharacters = Math.max(8, Math.floor((horizontal.primaryPriceX - itemNameX - 30 * horizontal.scaleX) / (13 * fontScale)));
  const metaCharacters = Math.max(18, Math.floor((horizontal.primaryPriceX - nameX - 30 * horizontal.scaleX) / (7 * fontScale)));
  const primaryPriceColor = themeStyle.price_mode === 'primary-accent' ? palette.accentText : toneColor;
  const secondaryPriceColor = themeStyle.price_mode === 'primary-accent' ? palette.primaryText : toneColor;
  const numberMarkup = showSequence ? `<text x="${numberX}" y="${priceBaseline}" class="item-sequence" ${textAttributes({ size:18 * fontScale, weight:500, fill:palette.primaryText, anchor:'middle' }, itemFont)}>${escapeXml(line.sequence || '')}</text>` : '';
  return `<g class="table-item theme-${themeId} tone-${line.tone === 'accent' ? 'accent' : 'light'}">
    ${separatorMarkup(box, horizontal, scale, themeId, themeStyle)}
    ${numberMarkup}
    ${promotion.markup}
    <g class="table-item-content"><text x="${itemNameX}" y="${nameBaseline}" class="item-name" ${textAttributes({ size: nameSize, weight: 700, fill: toneColor }, itemFont)}>${escapeXml(truncateText(line.name, nameCharacters))}</text>${line.metadata ? `<text x="${nameX}" y="${metaBaseline}" class="item-meta" ${textAttributes({ size: metaSize, weight: 400, fill: metaColor }, metaFont)}>${escapeXml(truncateText(line.metadata, metaCharacters))}</text>` : ''}</g>
    <g class="table-item-prices">${priceMarkup(line.pricePrimary, horizontal.primaryPriceX, priceBaseline, scale, primaryPriceColor, priceFont, priceFontSizePt)}${priceMarkup(line.priceSecondary, horizontal.secondaryPriceX, priceBaseline, scale, secondaryPriceColor, priceFont, priceFontSizePt)}</g>
  </g>`;
}

function packagingMarkup(line, box, horizontal, palette, scale, typography, priceFontSizePt, themeId = 'legacy', themeStyle = {}, themeTypography = {}) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const gap = 34 * horizontal.scaleX;
  const cellWidth = (horizontal.tableWidth - gap) / 2;
  const baseline = box.top + 35 * fontScale;
  const itemFont = themeTypography.item || typography;
  const priceFont = themeTypography.price || typography;
  const cells = line.items.map((item, index) => {
    const x = horizontal.left + index * (cellWidth + gap);
    const right = x + cellWidth;
    const toneColor = item.tone === 'accent' ? palette.accentText : palette.primaryText;
    const maximumCharacters = Math.max(8, Math.floor((cellWidth - 175 * horizontal.scaleX) / (13 * fontScale)));
    return `<g class="packaging-cell tone-${item.tone === 'accent' ? 'accent' : 'light'}"><g class="packaging-cell-content"><text x="${x + 22 * horizontal.scaleX}" y="${baseline}" class="packaging-name" ${textAttributes({ size: 25 * fontScale, weight: 700, fill: toneColor }, itemFont)}>${escapeXml(truncateText(item.name, maximumCharacters))}</text></g><g class="packaging-cell-price">${priceMarkup(item.unitPrice, right - 22 * horizontal.scaleX, baseline, scale, toneColor, priceFont, priceFontSizePt, 'packaging-price')}</g></g>`;
  }).join('\n');
  return `<g class="table-packaging">${separatorMarkup(box, horizontal, scale, themeId, themeStyle)}${cells}</g>`;
}

export function buildTableSvg(model, lines, layout = buildRenderLayout(model, lines)) {
  const { palette, horizontal, vertical, typography } = layout;
  const themeId = model.themeId || 'legacy';
  const themeStyle = layout.themeTableStyle || {};
  const themeTypography = layout.themeTypography || {};
  const scale = vertical.scale;
  const content = lines.map((line, index) => {
    const box = vertical.boxes[index];
    if (line.kind === 'section') return sectionMarkup(line, box, horizontal, palette, scale, themeTypography.section || typography, themeId);
    if (line.kind === 'packaging') return packagingMarkup(line, box, horizontal, palette, scale, typography, layout.priceFontSizePt, themeId, themeStyle, themeTypography);
    return itemMarkup(line, box, horizontal, palette, scale, typography, model.settings, layout.priceFontSizePt, themeId, themeStyle, themeTypography);
  }).join('\n');
  const lastBottom = vertical.boxes.length ? vertical.boxes[vertical.boxes.length - 1].bottom : model.viewport.height;
  const firstTop = vertical.boxes.length ? vertical.boxes[0].top : 0;
  const priceColumns = themeId !== 'legacy' && themeStyle.price_column_borders !== false
    ? `<g class="theme-price-columns" opacity=".38"><line x1="${horizontal.primaryPriceX - 118 * horizontal.scaleX}" y1="${firstTop}" x2="${horizontal.primaryPriceX - 118 * horizontal.scaleX}" y2="${lastBottom}" stroke="#74736F" stroke-width="1"/><line x1="${horizontal.secondaryPriceX - 118 * horizontal.scaleX}" y1="${firstTop}" x2="${horizontal.secondaryPriceX - 118 * horizontal.scaleX}" y2="${lastBottom}" stroke="#74736F" stroke-width="1"/></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="menu-table-svg" width="${model.viewport.width}" height="${model.viewport.height}" viewBox="0 0 ${model.viewport.width} ${model.viewport.height}" preserveAspectRatio="xMinYMin meet" aria-label="Предпросмотр таблицы меню" font-family="${escapeXml(typography.family)}">
    <defs>
      <linearGradient id="mira-theme-premium-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F9D760"/><stop offset=".42" stop-color="#E9B638"/><stop offset="1" stop-color="#C98C16"/></linearGradient>
      <linearGradient id="mira-theme-chalk-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2C438"/><stop offset=".55" stop-color="#E7B52D"/><stop offset="1" stop-color="#D49B18"/></linearGradient>
      <linearGradient id="mira-theme-brand-gold" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="#FFD968"/><stop offset=".5" stop-color="#F2B526"/><stop offset="1" stop-color="#D99611"/></linearGradient>
      <linearGradient id="mira-promo-badge-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7b86"/><stop offset="0.22" stop-color="#f85361"/><stop offset="0.56" stop-color="${MENU_TABLE_STYLE.promotion}"/><stop offset="0.82" stop-color="#b71928"/><stop offset="1" stop-color="#760813"/></linearGradient>
      <linearGradient id="mira-promo-badge-bevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".52" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    ${priceColumns}
    ${content}
  </svg>`;
}
