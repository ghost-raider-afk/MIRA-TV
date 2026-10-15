from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

# 1) Geometry: denser rows plus an explicit protected text/price boundary.
path = 'src/web/admin-ui/public/js/editor/renderer-layout.js'
text = read(path)
text = replace_once(text, 'const READABLE_ROW_HEIGHT = 70;', 'const READABLE_ROW_HEIGHT = 66;', 'readable row height')
old = """  const rightPadding = Math.max(12, width * .025);\n  const priceCellWidth = Math.max(84, width * .13);\n  const priceColumnGap = Math.max(14, width * .022);\n  const secondaryPriceX = right - rightPadding;\n  const primaryPriceX = secondaryPriceX - priceCellWidth - priceColumnGap;\n  const priceZoneLeft = primaryPriceX - priceCellWidth;\n  return Object.freeze({\n    left,\n    right,\n    tableWidth:width,\n    scaleX,\n    priceCellWidth,\n    priceColumnGap,\n    priceZoneLeft,\n    primaryPriceX,\n    secondaryPriceX,\n    nameWidth:priceZoneLeft - left\n  });"""
new = """  const rightPadding = Math.max(12, width * .025);\n  const priceCellWidth = Math.max(96, width * .145);\n  const priceColumnGap = Math.max(12, width * .018);\n  const secondaryPriceX = right - rightPadding;\n  const primaryPriceX = secondaryPriceX - priceCellWidth - priceColumnGap;\n  const priceZoneLeft = primaryPriceX - priceCellWidth;\n  const textGap = Math.max(16, width * .024);\n  const textRight = priceZoneLeft - textGap;\n  return Object.freeze({\n    left,\n    right,\n    tableWidth:width,\n    scaleX,\n    priceCellWidth,\n    priceColumnGap,\n    priceZoneLeft,\n    textGap,\n    textRight,\n    primaryPriceX,\n    secondaryPriceX,\n    nameWidth:textRight - left\n  });"""
text = replace_once(text, old, new, 'readable protected price geometry')
write(path, text)

# 2) Render model: preserve classic metadata, add readable-only compact metadata and strength.
path = 'src/web/admin-ui/public/js/editor/renderer-model.js'
text = read(path)
old = """export function formatProductMetadata(product) {\n  const characteristics = String(product?.characteristics || '').trim();\n  const fallbackCharacteristics = [\n    beverageColorLabel(product?.beverage_color),\n    filtrationLabel(product?.filtration)\n  ].filter(Boolean).join(' · ');\n  return [\n    product?.producer || '',\n    formatStrength(product?.strength || ''),\n    characteristics || fallbackCharacteristics\n  ].filter(Boolean).join(' · ');\n}"""
new = """function productCharacteristics(product) {\n  const characteristics = String(product?.characteristics || '').trim();\n  if (characteristics) return characteristics;\n  return [\n    beverageColorLabel(product?.beverage_color),\n    filtrationLabel(product?.filtration)\n  ].filter(Boolean).join(' · ');\n}\n\nexport function formatProductReadableMetadata(product) {\n  return [\n    product?.producer || '',\n    productCharacteristics(product)\n  ].filter(Boolean).join(' · ');\n}\n\nexport function formatProductMetadata(product) {\n  return [\n    product?.producer || '',\n    formatStrength(product?.strength || ''),\n    productCharacteristics(product)\n  ].filter(Boolean).join(' · ');\n}"""
text = replace_once(text, old, new, 'product metadata helpers')
old = """        name: product?.name || row.name || 'Продукция не выбрана',\n        metadata: formatProductMetadata(product),\n        promotion:row.promotion === true,"""
new = """        name: product?.name || row.name || 'Продукция не выбрана',\n        strength:formatStrength(product?.strength || ''),\n        metadata:formatProductMetadata(product),\n        metadataReadable:formatProductReadableMetadata(product),\n        promotion:row.promotion === true,"""
text = replace_once(text, old, new, 'readable display line metadata')
write(path, text)

# 3) SVG renderer: hard clip zones, larger section/volume headers, strength inline, tight metadata gap.
path = 'src/web/admin-ui/public/js/editor/renderer-svg.js'
text = read(path)
section_pattern = re.compile(r"function sectionMarkup\(.*?\n}\n\nfunction itemMarkup", re.S)
section_replacement = r'''function sectionMarkup(line, box, horizontal, palette, scale, typography, themeId = 'legacy', styleId = 'legacy') {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const readable = styleId === 'readable';
  const title = String(line.name || 'Меню');
  const baseline = box.top + (readable ? 41.5 : 35) * fontScale;
  const titleX = horizontal.left + 19 * horizontal.scaleX;
  const titleRight = readable && Number.isFinite(horizontal.textRight)
    ? horizontal.textRight
    : readable && Number.isFinite(horizontal.priceZoneLeft)
      ? horizontal.priceZoneLeft
      : horizontal.primaryPriceX;
  const titleWidth = line.showPriceLabels
    ? Math.max(1, titleRight - titleX)
    : Math.max(1, horizontal.right - titleX);
  const maximumCharacters = Math.max(8, Math.floor(titleWidth / ((readable ? 15.5 : 17) * fontScale)));
  const priceLabelCenterOffset = readable && Number.isFinite(horizontal.priceCellWidth)
    ? horizontal.priceCellWidth / 2
    : (MENU_REFERENCE.priceColumnGap / 3) * horizontal.scaleX;
  const labels = line.showPriceLabels
    ? `<text x="${horizontal.primaryPriceX - priceLabelCenterOffset}" y="${baseline}" class="price-label" ${textAttributes({ size: (readable ? 25.5 : 22) * fontScale, weight: 800, fill: palette.sectionText, anchor: 'middle', fontFamily:typography?.family }, typography)}>1 л</text>
      <text x="${horizontal.secondaryPriceX - priceLabelCenterOffset}" y="${baseline}" class="price-label" ${textAttributes({ size: (readable ? 25.5 : 22) * fontScale, weight: 800, fill: palette.sectionText, anchor: 'middle', fontFamily:typography?.family }, typography)}>1,5 л</text>` : '';
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
  const titleAttributes = textAttributes({ size: (readable ? 32 : 28) * fontScale, weight: 800, fill: palette.sectionText, letterSpacing: 0.3, fontFamily:typography?.family }, typography);
  const titleText = `<text x="${titleX}" y="${baseline}" class="section-title" ${titleAttributes}>${escapeXml(truncateText(title, maximumCharacters))}</text>`;
  const clipId = `mira-section-title-clip-${Math.round(box.top * 10)}-${Math.round(horizontal.left * 10)}`;
  const titleMarkup = readable && line.showPriceLabels
    ? `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${titleX}" y="${box.top}" width="${titleWidth}" height="${rectHeight}"/></clipPath></defs><g class="section-title-zone" clip-path="url(#${clipId})">${titleText}</g>`
    : titleText;
  return `<g class="${themeId === 'legacy' ? 'table-section' : `table-section theme-${themeId}`}"><rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${rectHeight}" rx="${radius}" ry="${radius}" fill="${fill}"${stroke}/>${titleMarkup}${labels}</g>`;
}

function itemMarkup'''
text, count = section_pattern.subn(lambda _m: section_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'sectionMarkup replacement: expected 1, found {count}')

item_pattern = re.compile(r"function itemMarkup\(.*?\n}\n\nfunction packagingMarkup", re.S)
item_replacement = r'''function itemMarkup(line, box, horizontal, palette, scale, typography, settings, priceFontSizePt, themeId = 'legacy', themeStyle = {}, themeTypography = {}) {
  const fontScale = TV1_REFERENCE_SCALE * scale;
  const readable = themeStyle.table_style_mode === 'readable';
  const toneColor = line.tone === 'accent' ? palette.accentText : palette.primaryText;
  const legacyMetaColor = line.tone === 'accent' ? palette.accentSecondaryText : palette.secondaryText;
  const themed = themeId !== 'legacy';
  const styled = themed || readable;
  const fixedTone = styled && themeStyle.item_tone_mode === 'fixed';
  const itemColor = fixedTone ? palette.primaryText : toneColor;
  const metaColor = fixedTone ? palette.secondaryText : legacyMetaColor;
  const priceOnlyPromotion = themed && themeStyle.promotion_style === 'price-only' && line.promotion === true;
  const showSequence = themed && themeStyle.show_sequence !== false;
  const numberX = horizontal.left + 16 * horizontal.scaleX;
  const nameX = horizontal.left + (showSequence ? 55 : 22) * horizontal.scaleX;
  const priceBaseline = box.top + (readable ? 40.5 : 35) * fontScale;
  const metadata = readable && typeof line.metadataReadable === 'string' ? line.metadataReadable : line.metadata;
  const hasMetadata = Boolean(metadata);
  const nameBaseline = hasMetadata ? box.top + (readable ? 25.5 : 21) * fontScale : priceBaseline;
  const metaBaseline = box.top + (readable ? 46.5 : 44.5) * fontScale;
  const nameSize = (readable ? (hasMetadata ? 27.5 : 28) : (hasMetadata ? 24 : 25)) * fontScale;
  const metaSize = (readable ? 14 : 13.5) * fontScale;
  const itemFont = themeTypography.item || typography;
  const metaFont = themeTypography.meta || typography;
  const priceFont = themeTypography.price || typography;
  const promotion = priceOnlyPromotion
    ? { markup:'', width:0 }
    : promotionMarkup(line, nameX, box, scale, itemFont, nameBaseline, settings);
  const itemNameX = nameX + (promotion.width ? promotion.width + 11 * fontScale : 0);
  const textRight = readable && Number.isFinite(horizontal.textRight)
    ? horizontal.textRight
    : readable && Number.isFinite(horizontal.priceZoneLeft)
      ? horizontal.priceZoneLeft
      : horizontal.primaryPriceX;
  const nameCharacters = Math.max(8, Math.floor((textRight - itemNameX) / ((readable ? 13.5 : 13) * fontScale)));
  const metaCharacters = Math.max(14, Math.floor((textRight - nameX) / ((readable ? 7.2 : 7) * fontScale)));
  const strength = readable ? String(line.strength || '').trim() : '';
  const strengthSuffix = strength ? ` · ${strength}` : '';
  const nameBudget = Math.max(4, nameCharacters - [...strengthSuffix].length);
  const displayName = truncateText(line.name, nameBudget);
  const strengthMarkup = strength ? `<tspan class="item-strength">${escapeXml(strengthSuffix)}</tspan>` : '';
  const contentClipX = horizontal.left + 8 * horizontal.scaleX;
  const contentClipWidth = Math.max(1, textRight - contentClipX);
  const contentClipId = `mira-item-content-clip-${Math.round(box.top * 10)}-${Math.round(horizontal.left * 10)}`;
  const contentClip = readable
    ? `<defs><clipPath id="${contentClipId}" clipPathUnits="userSpaceOnUse"><rect x="${contentClipX}" y="${box.top}" width="${contentClipWidth}" height="${box.height}"/></clipPath></defs>`
    : '';
  const contentClipAttribute = readable ? ` clip-path="url(#${contentClipId})"` : '';
  const priceMode = String(themeStyle.price_mode || 'alternating');
  let primaryPriceColor = priceMode === 'primary-accent'
    ? palette.accentText
    : priceMode === 'white-primary' || priceMode === 'promotion-accent'
      ? palette.primaryText
      : toneColor;
  let secondaryPriceColor = priceMode === 'primary-accent' || priceMode === 'white-primary' || priceMode === 'promotion-accent'
    ? palette.primaryText
    : toneColor;
  let primaryCentsColor = priceMode === 'white-primary' ? palette.accentText : primaryPriceColor;
  let secondaryCentsColor = priceMode === 'white-primary' ? palette.accentText : secondaryPriceColor;
  if (priceOnlyPromotion && priceMode !== 'primary-accent') {
    primaryPriceColor = palette.accentText;
    secondaryPriceColor = palette.accentText;
    primaryCentsColor = palette.accentText;
    secondaryCentsColor = palette.accentText;
  }
  const numberMarkup = showSequence ? `<text x="${numberX}" y="${priceBaseline}" class="item-sequence" ${textAttributes({ size:18 * fontScale, weight:500, fill:palette.primaryText, anchor:'middle', fontFamily:itemFont?.family }, itemFont)}>${escapeXml(line.sequence || '')}</text>` : '';
  return `<g class="table-item theme-${themeId} tone-${line.tone === 'accent' ? 'accent' : 'light'}">
    ${separatorMarkup(box, horizontal, scale, themeId, themeStyle)}
    ${numberMarkup}
    ${promotion.markup}
    ${contentClip}
    <g class="table-item-content"${contentClipAttribute}><text x="${itemNameX}" y="${nameBaseline}" class="item-name" ${textAttributes({ size: nameSize, weight: 700, fill: itemColor, fontFamily:itemFont?.family }, itemFont)}>${escapeXml(displayName)}${strengthMarkup}</text>${metadata ? `<text x="${nameX}" y="${metaBaseline}" class="item-meta" ${textAttributes({ size: metaSize, weight: 400, fill: metaColor, fontFamily:metaFont?.family }, metaFont)}>${escapeXml(truncateText(metadata, metaCharacters))}</text>` : ''}</g>
    <g class="table-item-prices">${priceMarkup(line.pricePrimary, horizontal.primaryPriceX, priceBaseline, scale, primaryPriceColor, priceFont, priceFontSizePt, 'price', primaryCentsColor)}${priceMarkup(line.priceSecondary, horizontal.secondaryPriceX, priceBaseline, scale, secondaryPriceColor, priceFont, priceFontSizePt, 'price', secondaryCentsColor)}</g>
  </g>`;
}

function packagingMarkup'''
text, count = item_pattern.subn(lambda _m: item_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'itemMarkup replacement: expected 1, found {count}')
write(path, text)

# 4) Unit regression: readable metadata excludes strength; strength is promoted to the title line.
path = 'tests/readable-menu-style.test.js'
text = read(path)
old = """  assert.equal(lines[1].metadata, 'Завод 1 · 4,5% · светлое, фильтрованное');\n  assert.doesNotMatch(svg, /Адрес не для ТВ|Другой адрес/);"""
new = """  assert.equal(lines[1].metadata, 'Завод 1 · 4,5% · светлое, фильтрованное');\n  assert.equal(lines[1].metadataReadable, 'Завод 1 · светлое, фильтрованное');\n  assert.equal(lines[1].strength, '4,5%');\n  assert.match(svg, />Первый<tspan class=\"item-strength\"> · 4,5%<\\/tspan>/);\n  assert.match(svg, /section-title-zone/);\n  assert.match(svg, /mira-item-content-clip-/);\n  assert.doesNotMatch(svg, /Адрес не для ТВ|Другой адрес/);"""
text = replace_once(text, old, new, 'readable metadata unit regression')
write(path, text)

# 5) Browser regression: extreme long strings, hard boundaries, header font visibility, tight hierarchy.
path = 'tests/browser/readable-menu-regression.spec.js'
text = read(path)
text = replace_once(text,
    "name:`ДЛИННОЕ НАЗВАНИЕ ТОВАРА ${suffix}`",
    "name:`ЧЕШСКИЙ КАБАНЧИК, ПШЕНИЧНОЕ ОСОБОЕ СВЕТЛОЕ ${suffix}`",
    'browser long product name')
text = replace_once(text,
    "name:'ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ'",
    "name:'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ ОСОБОЕ'",
    'browser long section name')
text = replace_once(text,
    "await expect(svg).toContainText('Пивоварня · 4,5% · светлое, фильтрованное');",
    "await expect(svg).toContainText('Пивоварня · светлое, фильтрованное');\n  await expect(svg.locator('.item-strength').first()).toHaveText(' · 4,5%');",
    'browser compact metadata expectation')
marker = """  expect(readable.every((row) => row.priceFills.length === 2 && row.priceFills.every((fill) => fill === row.nameFill))).toBe(true);\n  expect(readable.some((row) => row.overlapsPrice)).toBe(false);\n\n  await saveStyle(page, screen, rows, 'legacy');"""
insert = """  expect(readable.every((row) => row.priceFills.length === 2 && row.priceFills.every((fill) => fill === row.nameFill))).toBe(true);\n  expect(readable.some((row) => row.overlapsPrice)).toBe(false);\n\n  const headerGeometry = await svg.locator('.table-section').first().evaluate((section) => {\n    const title = section.querySelector('.section-title');\n    const titleZone = section.querySelector('.section-title-zone');\n    const labels = [...section.querySelectorAll('.price-label')];\n    const clipRef = titleZone?.getAttribute('clip-path')?.match(/#([^)]*)/)?.[1];\n    const clipRect = clipRef ? document.getElementById(clipRef)?.querySelector('rect') : null;\n    const clipRight = clipRect ? Number(clipRect.getAttribute('x')) + Number(clipRect.getAttribute('width')) : Infinity;\n    const firstPriceLeft = labels.length ? Math.min(...labels.map((label) => label.getBBox().x)) : Infinity;\n    return {\n      protected:clipRight < firstPriceLeft,\n      titleSize:Number(title?.getAttribute('font-size') || 0),\n      labelSizes:labels.map((label) => Number(label.getAttribute('font-size') || 0))\n    };\n  });\n  expect(headerGeometry.protected).toBe(true);\n  expect(headerGeometry.titleSize).toBeGreaterThan(30);\n  expect(headerGeometry.labelSizes).toHaveLength(2);\n  expect(headerGeometry.labelSizes.every((size) => size > 24)).toBe(true);\n\n  const inlineStrength = await svg.locator('.item-name').first().evaluate((name) => {\n    const strength = name.querySelector('.item-strength');\n    return {\n      nameSize:Number.parseFloat(getComputedStyle(name).fontSize),\n      strengthSize:Number.parseFloat(getComputedStyle(strength).fontSize)\n    };\n  });\n  expect(inlineStrength.strengthSize).toBeCloseTo(inlineStrength.nameSize, 3);\n\n  await saveStyle(page, screen, rows, 'legacy');"""
text = replace_once(text, marker, insert, 'browser readable geometry assertions')
write(path, text)

# 6) Release metadata, excluding package/lock (npm version handles those).
for path in ['.env.example', 'mira-tv.sh', 'src/web/admin-ui/public/js/player/player.js']:
    text = read(path)
    if '1.18.5' not in text:
        raise SystemExit(f'{path}: expected 1.18.5')
    write(path, text.replace('1.18.5', '1.18.6'))

path = 'src/web/admin-ui/public/player-sw.js'
text = read(path)
text = replace_once(text, "const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v64';", "const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v65';", 'retired shell')
text = replace_once(text, "const SHELL_CACHE = 'mira-tv-player-shell-v65';", "const SHELL_CACHE = 'mira-tv-player-shell-v66';", 'active shell')
text = text.replace('// Source revision: classic row-tone parity, protected price zone and catalog address metadata.', '// Source revision: collision-proof readable table geometry and compact product hierarchy.')
write(path, text)

release_notes = '''# MIRA-TV 1.18.6\n\n## Readable table geometry\n\n- Hard-separates product/section text from the `1 л` and `1,5 л` price columns with SVG clip zones.\n- Enlarges section headings and the `1 л` / `1,5 л` column labels for distance readability.\n- Moves strength next to the product name at the same font size.\n- Keeps the lower line compact: producer + characteristics only.\n- Tightens vertical spacing and row height while preserving the existing product count.\n- Keeps classic alternating row colors and the shared Preview/TV renderer.\n- Offline Player shell v66 refreshes the renderer on already connected TVs.\n'''
Path('docs/releases/1.18.6.md').write_text(release_notes, encoding='utf-8')

print('staged MIRA-TV 1.18.6 readable layout changes')
