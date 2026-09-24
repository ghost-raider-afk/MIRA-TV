import {
  MENU_REFERENCE,
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

function promotionMarkup(line, x, box, scale, typography, horizontal, textBaseline, settings = {}) {
  if (!line.promotion || !line.promotionText) return { markup: '', glow: '', width: 0 };
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const text = truncateText(line.promotionText, 12);
  const width = Math.min(143 * fontScale, Math.max(75 * fontScale, ([...text].length * 9.8 + 26) * fontScale));
  const height = 29.7 * fontScale;
  const preferredTextY = Number.isFinite(textBaseline) ? textBaseline : box.top + 20.3 * fontScale;
  const preferredTop = preferredTextY - 20.3 * fontScale;
  const minTop = box.top + 0.35 * scale;
  const maxTop = Math.max(minTop, box.bottom - height - 0.35 * scale);
  const top = Math.min(maxTop, Math.max(minTop, preferredTop));
  const textY = top + 20.3 * fontScale;
  const notch = 9.9 * fontScale;
  const shapeKey = ['base', 'capsule', 'cut', 'chevron', 'tag'].includes(settings.promotion_badge_shape)
    ? settings.promotion_badge_shape : 'base';
  const shape = promotionShapePath(shapeKey, x, top, width, height, notch);
  const clipId = `mira-promo-badge-clip-${Math.round(box.top * 10)}-${Math.round(x * 10)}`;
  const rowClipId = `mira-promo-row-clip-${Math.round(box.top * 10)}-${Math.round(horizontal.left * 10)}`;
  const rowAnimation = ['wave', 'gloss', 'fill', 'pulse', 'runner'].includes(line.promotionAnimation) ? line.promotionAnimation : 'wave';
  const badgeAnimation = ['shine', 'breathe'].includes(line.promotionBadgeAnimation) ? line.promotionBadgeAnimation : 'shine';
  const shineWidth = Math.max(34 * fontScale, width * .66);
  const sparkleRadius = Math.max(3.8 * fontScale, height * .16);
  const sparkleStartX = x - sparkleRadius * 2.4;
  const sparkleY = top + height * .32;
  const shineTravel = width + shineWidth * 2;
  const sparkleTravel = width + sparkleRadius * 4.8;
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
    markup: `<defs>
      <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${shape}"/></clipPath>
      <clipPath id="${rowClipId}" clipPathUnits="userSpaceOnUse"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${box.height}" rx="${Math.max(4, 6 * scale)}"/></clipPath>
    </defs>
    <g class="promotion-badge-glow" data-promotion-badge-animation="${badgeAnimation}" opacity="0" pointer-events="none"><path d="${shape}" fill="${MENU_TABLE_STYLE.promotion}"/></g>
    <g class="promotion-badge" data-promotion-badge-shape="${shapeKey}">
      <path d="${shape}" fill="url(#mira-promo-badge-depth)" stroke="rgba(255,255,255,.30)" stroke-width="${Math.max(.7, .85 * fontScale)}" filter="url(#mira-promo-badge-depth-shadow)"/>
      <rect x="${x}" y="${top}" width="${width}" height="${height * .48}" fill="url(#mira-promo-badge-bevel)" clip-path="url(#${clipId})" pointer-events="none"/>
    </g>
    <g class="promotion-badge-effects-clip" clip-path="url(#${clipId})" pointer-events="none">
      <g class="promotion-badge-shine" data-promotion-badge-animation="${badgeAnimation}" data-promotion-travel="${shineTravel}" opacity="0">
        <rect x="${x - shineWidth}" y="${top - height * .28}" width="${shineWidth}" height="${height * 1.56}" fill="url(#mira-promo-badge-shine)" transform="skewX(-18)"/>
      </g>
      <g class="promotion-badge-sparkle" data-promotion-badge-animation="${badgeAnimation}" data-promotion-travel="${sparkleTravel}" opacity="0">
        <circle cx="${sparkleStartX}" cy="${sparkleY}" r="${sparkleRadius * 1.8}" fill="url(#mira-promo-badge-sparkle)"/>
        <line x1="${sparkleStartX - sparkleRadius * 2.2}" y1="${sparkleY}" x2="${sparkleStartX + sparkleRadius * 2.2}" y2="${sparkleY}" stroke="#fff" stroke-width="${Math.max(.7, .75 * fontScale)}" stroke-linecap="round"/>
        <line x1="${sparkleStartX}" y1="${sparkleY - sparkleRadius * 2.2}" x2="${sparkleStartX}" y2="${sparkleY + sparkleRadius * 2.2}" stroke="#fff" stroke-width="${Math.max(.7, .75 * fontScale)}" stroke-linecap="round"/>
      </g>
    </g>
    <g class="promotion-badge-label" pointer-events="none">
      <text x="${textCenter}" y="${textY}" class="promotion" transform="translate(0 ${textY}) scale(1 ${promoHeight}) translate(0 ${-textY})" ${textAttributes({ size: promoSize, weight: promoWeight, fill: '#FFFFFF', letterSpacing: promoTracking, anchor: 'middle', fontFamily: promoFont.family }, promoFont)}>${escapeXml(text)}</text>
    </g>`,
    glow: `<g class="promotion-row-clip" clip-path="url(#${rowClipId})" pointer-events="none"><g class="promotion-row-glow" data-promotion-row-animation="${rowAnimation}" opacity="0"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${box.height}" rx="${Math.max(4, 6 * scale)}" fill="url(#mira-promo-row-glow)"/></g></g>`
  };
}

function sectionMarkup(line, box, horizontal, palette, scale, typography) {
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
  return `<g class="table-section"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${rectHeight}" rx="5" ry="5" fill="${palette.accent}"/>${motionSurfaceMarkup(box, horizontal, scale, 'section')}<text x="${horizontal.left + 19 * horizontal.scaleX}" y="${baseline}" class="section-title" ${textAttributes({ size: 28 * fontScale, weight: 700, fill: palette.sectionText, letterSpacing: 0.3 }, typography)}>${escapeXml(truncateText(title, maximumCharacters))}</text>${labels}</g>`;
}

function itemMarkup(line, box, horizontal, palette, scale, typography, settings) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const toneColor = line.tone === 'accent' ? palette.accentText : palette.primaryText;
  const metaColor = line.tone === 'accent' ? palette.accentSecondaryText : palette.secondaryText;
  const nameX = horizontal.left + 22 * horizontal.scaleX;
  const priceBaseline = box.top + 35 * fontScale;
  const hasMetadata = Boolean(line.metadata);
  const nameBaseline = hasMetadata ? box.top + 21 * fontScale : priceBaseline;
  const metaBaseline = box.top + 44.5 * fontScale;
  const nameSize = (hasMetadata ? 24 : 25) * fontScale;
  const metaSize = 13.5 * fontScale;
  const promotion = promotionMarkup(line, nameX, box, scale, typography, horizontal, nameBaseline, settings);
  const itemNameX = nameX + (promotion.width ? promotion.width + 11 * fontScale : 0);
  const nameCharacters = Math.max(8, Math.floor((horizontal.primaryPriceX - itemNameX - 30 * horizontal.scaleX) / (13 * fontScale)));
  const metaCharacters = Math.max(18, Math.floor((horizontal.primaryPriceX - nameX - 30 * horizontal.scaleX) / (7 * fontScale)));
  return `<g class="table-item tone-${line.tone === 'accent' ? 'accent' : 'light'}">
    ${separatorMarkup(box, horizontal, scale)}
    ${motionSurfaceMarkup(box, horizontal, scale, 'item')}
    ${promotion.glow}
    ${promotion.markup}
    <g class="table-item-content"><text x="${itemNameX}" y="${nameBaseline}" class="item-name" ${textAttributes({ size: nameSize, weight: 700, fill: toneColor }, typography)}>${escapeXml(truncateText(line.name, nameCharacters))}</text>${line.metadata ? `<text x="${nameX}" y="${metaBaseline}" class="item-meta" ${textAttributes({ size: metaSize, weight: 400, fill: metaColor }, typography)}>${escapeXml(truncateText(line.metadata, metaCharacters))}</text>` : ''}</g>
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
    return itemMarkup(line, box, horizontal, palette, scale, typography, model.settings);
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="menu-table-svg" width="${model.viewport.width}" height="${model.viewport.height}" viewBox="0 0 ${model.viewport.width} ${model.viewport.height}" preserveAspectRatio="xMinYMin meet" aria-label="Предпросмотр таблицы меню" font-family="${escapeXml(typography.family)}">
    <defs>
      <linearGradient id="mira-row-motion-surface" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--mira-menu-accent,#F4C915)" stop-opacity="0"/><stop offset="0.26" stop-color="var(--mira-menu-accent,#F4C915)" stop-opacity="0.18"/><stop offset="0.5" stop-color="var(--mira-menu-accent,#F4C915)" stop-opacity="0.30"/><stop offset="0.74" stop-color="var(--mira-menu-accent,#F4C915)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--mira-menu-accent,#F4C915)" stop-opacity="0"/></linearGradient>
      <linearGradient id="mira-promo-row-glow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2442" stop-opacity="0.16"/><stop offset="0.16" stop-color="#ff3048" stop-opacity="0.42"/><stop offset="0.5" stop-color="#ff5c70" stop-opacity="0.72"/><stop offset="0.84" stop-color="#ff3048" stop-opacity="0.42"/><stop offset="1" stop-color="#ff2442" stop-opacity="0.16"/></linearGradient>
      <linearGradient id="mira-promo-badge-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7b86"/><stop offset="0.22" stop-color="#f85361"/><stop offset="0.56" stop-color="${MENU_TABLE_STYLE.promotion}"/><stop offset="0.82" stop-color="#b71928"/><stop offset="1" stop-color="#760813"/></linearGradient>
      <linearGradient id="mira-promo-badge-bevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".52" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <filter id="mira-promo-badge-depth-shadow" x="-22%" y="-45%" width="144%" height="205%"><feDropShadow dx="0" dy="${Math.max(1.5, 2.4 * scale)}" stdDeviation="${Math.max(1.4, 2.9 * scale)}" flood-color="#41050c" flood-opacity=".78"/></filter>
      <linearGradient id="mira-promo-badge-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="0.05"/><stop offset="0.40" stop-color="#fff" stop-opacity="0.26"/><stop offset="0.52" stop-color="#fff" stop-opacity="0.96"/><stop offset="0.63" stop-color="#fff" stop-opacity="0.30"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="mira-promo-badge-sparkle"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.24" stop-color="#fffbe8" stop-opacity=".96"/><stop offset="0.56" stop-color="#fff6bd" stop-opacity=".46"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <filter id="mira-promo-row-softness" x="-8%" y="-80%" width="116%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    ${content}
  </svg>`;
}
