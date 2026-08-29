import {
  MENU_REFERENCE,
  MENU_TABLE_STYLE,
  TV1_REFERENCE_SCALE,
  buildRenderLayout,
  escapeXml,
  priceParts,
  truncateText
} from './renderer-model.js';

function textAttributes({ size, weight = 400, fill, letterSpacing = 0, anchor = null, opacity = null }, typography) {
  const resolvedWeight = Math.max(weight, typography?.weightFloor || 400);
  return [
    `font-size="${size}"`, `font-weight="${resolvedWeight}"`, fill ? `fill="${fill}"` : '',
    letterSpacing ? `letter-spacing="${letterSpacing}"` : '', anchor ? `text-anchor="${anchor}"` : '',
    opacity !== null ? `opacity="${opacity}"` : ''
  ].filter(Boolean).join(' ');
}

function separatorMarkup(box, horizontal, scale) {
  const y = box.bottom - 2 * scale;
  return `<line x1="${horizontal.left + MENU_REFERENCE.separatorInset * horizontal.scaleX}" y1="${y}" x2="${horizontal.right}" y2="${y}" class="separator" stroke="${MENU_TABLE_STYLE.separator}" stroke-width="${Math.max(1, scale)}" stroke-dasharray="${6 * scale} ${7 * scale}" opacity="0.65"/>`;
}

function motionSurfaceMarkup(box, horizontal, scale, kind) {
  return `<rect class="row-motion-surface row-motion-surface-${kind}" x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${box.height}" rx="${Math.max(4, 6 * scale)}" fill="url(#mira-row-motion-surface)" opacity="0" pointer-events="none"/>`;
}

function priceMarkup(value, x, baseline, scale, toneColor, typography, className = 'price') {
  const parts = priceParts(value);
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const attributes = textAttributes({ size: 27 * fontScale, weight: 700, fill: toneColor, anchor: 'end' }, typography);
  if (!parts) return `<text x="${x}" y="${baseline}" class="${className}" ${attributes}>—</text>`;
  return `<text x="${x}" y="${baseline}" class="${className}" ${attributes}>${escapeXml(parts.whole)}<tspan class="cents" dy="${-16 * fontScale}" font-size="${14 * fontScale}" font-weight="700" fill="${toneColor}">${escapeXml(parts.cents)}</tspan></text>`;
}

function promotionMarkup(line, x, box, scale, typography, horizontal) {
  if (!line.promotion || !line.promotionText) return { markup: '', glow: '', width: 0 };
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const text = truncateText(line.promotionText, 12);
  const width = Math.min(130 * fontScale, Math.max(68 * fontScale, ([...text].length * 9 + 24) * fontScale));
  const height = 27 * fontScale;
  const top = box.top + 4 * scale;
  const notch = 9 * fontScale;
  return {
    width,
    markup: `<g class="promotion-badge">
      <path d="M${x} ${top}H${x + width - notch}L${x + width} ${top + height / 2}L${x + width - notch} ${top + height}H${x}Z" fill="${MENU_TABLE_STYLE.promotion}"/>
      <text x="${x + (width - notch) / 2}" y="${top + 18.5 * fontScale}" class="promotion" ${textAttributes({ size: 12 * fontScale, weight: 800, fill: '#FFFFFF', letterSpacing: 0.2 * scale, anchor: 'middle' }, typography)}>${escapeXml(text)}</text>
    </g>`,
    glow: `<g class="promotion-row-glow" opacity="0" pointer-events="none"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${box.height}" rx="${Math.max(4, 6 * scale)}" fill="url(#mira-promo-row-glow)" filter="url(#mira-promo-row-softness)"/></g>`
  };
}

function sectionMarkup(line, box, horizontal, palette, scale, typography) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const title = String(line.name || 'Меню');
  const baseline = box.top + 35 * fontScale;
  const titleWidth = line.showPriceLabels ? horizontal.primaryPriceX - horizontal.left - 45 * horizontal.scaleX : horizontal.tableWidth;
  const maximumCharacters = Math.max(16, Math.floor(titleWidth / (17 * fontScale)));
  const labels = line.showPriceLabels
    ? `<text x="${horizontal.primaryPriceX}" y="${baseline}" class="price-label" ${textAttributes({ size: 22 * fontScale, weight: 700, fill: palette.sectionText, anchor: 'end' }, typography)}>1 л</text>
      <text x="${horizontal.secondaryPriceX}" y="${baseline}" class="price-label" ${textAttributes({ size: 22 * fontScale, weight: 700, fill: palette.sectionText, anchor: 'end' }, typography)}>1,5 л</text>` : '';
  const rectHeight = Math.max(1, box.height - MENU_REFERENCE.sectionInset * scale);
  return `<g class="table-section"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${rectHeight}" rx="5" ry="5" fill="${palette.accent}"/>${motionSurfaceMarkup(box, horizontal, scale, 'section')}<text x="${horizontal.left + 19 * horizontal.scaleX}" y="${baseline}" class="section-title" ${textAttributes({ size: 28 * fontScale, weight: 700, fill: palette.sectionText, letterSpacing: 0.3 }, typography)}>${escapeXml(truncateText(title, maximumCharacters))}</text>${labels}</g>`;
}

function itemMarkup(line, box, horizontal, palette, scale, typography) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const toneColor = line.tone === 'accent' ? palette.accentText : palette.primaryText;
  const metaColor = line.tone === 'accent' ? palette.accentSecondaryText : palette.secondaryText;
  const nameX = horizontal.left + 22 * horizontal.scaleX;
  const promotion = promotionMarkup(line, nameX, box, scale, typography, horizontal);
  const itemNameX = nameX + (promotion.width ? promotion.width + 11 * fontScale : 0);
  const nameCharacters = Math.max(8, Math.floor((horizontal.primaryPriceX - itemNameX - 30 * horizontal.scaleX) / (13 * fontScale)));
  const metaCharacters = Math.max(18, Math.floor((horizontal.primaryPriceX - nameX - 30 * horizontal.scaleX) / (7 * fontScale)));
  const priceBaseline = box.top + 35 * fontScale;
  const nameBaseline = line.metadata ? box.top + 24 * fontScale : priceBaseline;
  const metaBaseline = box.top + 44 * fontScale;
  return `<g class="table-item tone-${line.tone === 'accent' ? 'accent' : 'light'}">
    ${separatorMarkup(box, horizontal, scale)}
    ${motionSurfaceMarkup(box, horizontal, scale, 'item')}
    ${promotion.glow}
    ${promotion.markup}
    <g class="table-item-content"><text x="${itemNameX}" y="${nameBaseline}" class="item-name" ${textAttributes({ size: 25 * fontScale, weight: 700, fill: toneColor }, typography)}>${escapeXml(truncateText(line.name, nameCharacters))}</text>${line.metadata ? `<text x="${nameX}" y="${metaBaseline}" class="item-meta" ${textAttributes({ size: 14 * fontScale, weight: 400, fill: metaColor }, typography)}>${escapeXml(truncateText(line.metadata, metaCharacters))}</text>` : ''}</g>
    <g class="table-item-prices">${priceMarkup(line.pricePrimary, horizontal.primaryPriceX, priceBaseline, scale, toneColor, typography)}${priceMarkup(line.priceSecondary, horizontal.secondaryPriceX, priceBaseline, scale, toneColor, typography)}</g>
  </g>`;
}

function packagingMarkup(line, box, horizontal, palette, scale, typography) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const gap = 34 * horizontal.scaleX;
  const cellWidth = (horizontal.tableWidth - gap) / 2;
  const baseline = box.top + 35 * fontScale;
  const cells = line.items.map((item, index) => {
    const x = horizontal.left + index * (cellWidth + gap);
    const right = x + cellWidth;
    const toneColor = item.tone === 'accent' ? palette.accentText : palette.primaryText;
    const maximumCharacters = Math.max(8, Math.floor((cellWidth - 175 * horizontal.scaleX) / (13 * fontScale)));
    return `<g class="packaging-cell tone-${item.tone === 'accent' ? 'accent' : 'light'}"><g class="packaging-cell-content"><text x="${x + 22 * horizontal.scaleX}" y="${baseline}" class="packaging-name" ${textAttributes({ size: 25 * fontScale, weight: 700, fill: toneColor }, typography)}>${escapeXml(truncateText(item.name, maximumCharacters))}</text></g><g class="packaging-cell-price">${priceMarkup(item.unitPrice, right - 22 * horizontal.scaleX, baseline, scale, toneColor, typography, 'packaging-price')}</g></g>`;
  }).join('\n');
  return `<g class="table-packaging">${separatorMarkup(box, horizontal, scale)}${motionSurfaceMarkup(box, horizontal, scale, 'packaging')}${cells}</g>`;
}

export function buildTableSvg(model, lines, layout = buildRenderLayout(model, lines)) {
  const { palette, horizontal, vertical, typography } = layout;
  const scale = vertical.scale;
  const content = lines.map((line, index) => {
    const box = vertical.boxes[index];
    if (line.kind === 'section') return sectionMarkup(line, box, horizontal, palette, scale, typography);
    if (line.kind === 'packaging') return packagingMarkup(line, box, horizontal, palette, scale, typography);
    return itemMarkup(line, box, horizontal, palette, scale, typography);
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="menu-table-svg" width="${model.viewport.width}" height="${model.viewport.height}" viewBox="0 0 ${model.viewport.width} ${model.viewport.height}" preserveAspectRatio="xMinYMin meet" aria-label="Предпросмотр таблицы меню" font-family="${escapeXml(typography.family)}">
    <defs>
      <linearGradient id="mira-row-motion-surface" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.26" stop-color="#FFFFFF" stop-opacity="0.45"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.72"/><stop offset="0.74" stop-color="#FFFFFF" stop-opacity="0.45"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
      <linearGradient id="mira-promo-row-glow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff384f" stop-opacity="0.10"/><stop offset="0.16" stop-color="#ff3048" stop-opacity="0.30"/><stop offset="0.5" stop-color="#ff5267" stop-opacity="0.48"/><stop offset="0.84" stop-color="#ff3048" stop-opacity="0.30"/><stop offset="1" stop-color="#ff384f" stop-opacity="0.10"/></linearGradient>
      <filter id="mira-promo-row-softness" x="-8%" y="-80%" width="116%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    ${content}
  </svg>`;
}
