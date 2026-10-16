from pathlib import Path
import subprocess


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'expected snippet not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Readable layout: reserve a single price cell for 1 l and give the former 1.5 l width back to text.
replace_once(
    'src/web/admin-ui/public/js/editor/renderer-layout.js',
    """function readableHorizontal(left, width) {\n  const scaleX = width / MENU_REFERENCE.tableWidth;\n  const right = left + width;\n  const rightPadding = Math.max(12, width * .025);\n  const priceCellWidth = Math.max(96, width * .145);\n  const priceColumnGap = Math.max(12, width * .018);\n  const secondaryPriceX = right - rightPadding;\n  const primaryPriceX = secondaryPriceX - priceCellWidth - priceColumnGap;\n  const priceZoneLeft = primaryPriceX - priceCellWidth;\n  const textGap = Math.max(16, width * .024);\n  const textRight = priceZoneLeft - textGap;\n  return Object.freeze({\n    left,\n    right,\n    tableWidth:width,\n    scaleX,\n    priceCellWidth,\n    priceColumnGap,\n    priceZoneLeft,\n    textGap,\n    textRight,\n    primaryPriceX,\n    secondaryPriceX,\n    nameWidth:textRight - left\n  });\n}\n""",
    """function readableHorizontal(left, width) {\n  const scaleX = width / MENU_REFERENCE.tableWidth;\n  const right = left + width;\n  const rightPadding = Math.max(12, width * .025);\n  const priceCellWidth = Math.max(104, width * .155);\n  const primaryPriceX = right - rightPadding;\n  const priceZoneLeft = primaryPriceX - priceCellWidth;\n  const textGap = Math.max(16, width * .024);\n  const textRight = priceZoneLeft - textGap;\n  return Object.freeze({\n    left,\n    right,\n    tableWidth:width,\n    scaleX,\n    priceCellWidth,\n    priceColumnGap:0,\n    priceZoneLeft,\n    textGap,\n    textRight,\n    primaryPriceX,\n    secondaryPriceX:primaryPriceX,\n    nameWidth:textRight - left\n  });\n}\n"""
)

# Readable section: one visible volume header. Classic keeps both headers.
replace_once(
    'src/web/admin-ui/public/js/editor/renderer-svg.js',
    """  const labels = line.showPriceLabels\n    ? `<text x=\"${horizontal.primaryPriceX - priceLabelCenterOffset}\" y=\"${baseline}\" class=\"price-label\" ${textAttributes({ size: (readable ? 25.5 : 22) * fontScale, weight: 800, fill: palette.sectionText, anchor: 'middle', fontFamily:typography?.family }, typography)}>1 л</text>\n      <text x=\"${horizontal.secondaryPriceX - priceLabelCenterOffset}\" y=\"${baseline}\" class=\"price-label\" ${textAttributes({ size: (readable ? 25.5 : 22) * fontScale, weight: 800, fill: palette.sectionText, anchor: 'middle', fontFamily:typography?.family }, typography)}>1,5 л</text>` : '';\n""",
    """  const labels = line.showPriceLabels\n    ? readable\n      ? `<text x=\"${horizontal.primaryPriceX - priceLabelCenterOffset}\" y=\"${baseline}\" class=\"price-label\" ${textAttributes({ size:25.5 * fontScale, weight:800, fill:palette.sectionText, anchor:'middle', fontFamily:typography?.family }, typography)}>1 л</text>`\n      : `<text x=\"${horizontal.primaryPriceX - priceLabelCenterOffset}\" y=\"${baseline}\" class=\"price-label\" ${textAttributes({ size:22 * fontScale, weight:800, fill:palette.sectionText, anchor:'middle', fontFamily:typography?.family }, typography)}>1 л</text>\n      <text x=\"${horizontal.secondaryPriceX - priceLabelCenterOffset}\" y=\"${baseline}\" class=\"price-label\" ${textAttributes({ size:22 * fontScale, weight:800, fill:palette.sectionText, anchor:'middle', fontFamily:typography?.family }, typography)}>1,5 л</text>`\n    : '';\n"""
)

replace_once(
    'src/web/admin-ui/public/js/editor/renderer-svg.js',
    """  const numberMarkup = showSequence ? `<text x=\"${numberX}\" y=\"${priceBaseline}\" class=\"item-sequence\" ${textAttributes({ size:18 * fontScale, weight:500, fill:palette.primaryText, anchor:'middle', fontFamily:itemFont?.family }, itemFont)}>${escapeXml(line.sequence || '')}</text>` : '';\n  return `<g class=\"table-item theme-${themeId} tone-${line.tone === 'accent' ? 'accent' : 'light'}\">\n""",
    """  const numberMarkup = showSequence ? `<text x=\"${numberX}\" y=\"${priceBaseline}\" class=\"item-sequence\" ${textAttributes({ size:18 * fontScale, weight:500, fill:palette.primaryText, anchor:'middle', fontFamily:itemFont?.family }, itemFont)}>${escapeXml(line.sequence || '')}</text>` : '';\n  const pricesMarkup = readable\n    ? priceMarkup(line.pricePrimary, horizontal.primaryPriceX, priceBaseline, scale, primaryPriceColor, priceFont, priceFontSizePt, 'price', primaryCentsColor)\n    : `${priceMarkup(line.pricePrimary, horizontal.primaryPriceX, priceBaseline, scale, primaryPriceColor, priceFont, priceFontSizePt, 'price', primaryCentsColor)}${priceMarkup(line.priceSecondary, horizontal.secondaryPriceX, priceBaseline, scale, secondaryPriceColor, priceFont, priceFontSizePt, 'price', secondaryCentsColor)}`;\n  return `<g class=\"table-item theme-${themeId} tone-${line.tone === 'accent' ? 'accent' : 'light'}\">\n"""
)
replace_once(
    'src/web/admin-ui/public/js/editor/renderer-svg.js',
    """    <g class=\"table-item-prices\">${priceMarkup(line.pricePrimary, horizontal.primaryPriceX, priceBaseline, scale, primaryPriceColor, priceFont, priceFontSizePt, 'price', primaryCentsColor)}${priceMarkup(line.priceSecondary, horizontal.secondaryPriceX, priceBaseline, scale, secondaryPriceColor, priceFont, priceFontSizePt, 'price', secondaryCentsColor)}</g>\n""",
    """    <g class=\"table-item-prices\">${pricesMarkup}</g>\n"""
)

# Admin TV cards: snapshot identity is the frame revision only; status refresh updates CSS/meta without recreating the image.
screens = Path('src/web/admin-ui/public/js/pages/screens.js')
text = screens.read_text(encoding='utf-8')
text = text.replace("""function previewUrl(screen, binding, { requestFresh = false } = {}) {\n  if (!binding?.online || (!requestFresh && !binding?.preview_available)) return '';\n  const version = requestFresh ? `request-${Date.now()}` : binding.preview_updated_at || '';\n  return `${API.deviceBindings}/${screen.id}/preview?v=${encodeURIComponent(version)}`;\n}\n\nfunction createTvFace(screen, binding, large = false, { requestFresh = false } = {}) {\n""", """function previewUrl(screen, binding) {\n  if (!binding?.preview_available) return '';\n  const version = binding.preview_updated_at || '';\n  return `${API.deviceBindings}/${screen.id}/preview?v=${encodeURIComponent(version)}`;\n}\n\nfunction createTvFace(screen, binding, large = false) {\n""")
text = text.replace("  const url = previewUrl(screen, binding, { requestFresh });", "  const url = previewUrl(screen, binding);")
old_sync = """function syncTvUnit(unit, screen, binding, { requestFresh = false } = {}) {\n  const status = statusState(binding);\n  unit.dataset.tvState = status.key;\n  const host = unit.querySelector('[data-tv-face-host]');\n  if (host) {\n    const faceKey = `${status.key}:${binding?.preview_updated_at || ''}:${requestFresh ? 'fresh' : 'cached'}`;\n    if (host.dataset.tvFaceKey !== faceKey) {\n      host.dataset.tvFaceKey = faceKey;\n      host.replaceChildren(createTvFace(screen, binding, false, { requestFresh }));\n    }\n  }\n"""
new_sync = """function syncTvUnit(unit, screen, binding) {\n  const status = statusState(binding);\n  unit.dataset.tvState = status.key;\n  const host = unit.querySelector('[data-tv-face-host]');\n  if (host) {\n    const faceKey = String(binding?.preview_updated_at || '');\n    const currentFace = host.querySelector('.screen-tv-face');\n    if (host.dataset.tvFaceKey !== faceKey || !currentFace) {\n      host.dataset.tvFaceKey = faceKey;\n      host.replaceChildren(createTvFace(screen, binding));\n    } else {\n      currentFace.className = `screen-tv-face is-${status.key}`;\n    }\n  }\n"""
if old_sync not in text: raise SystemExit('screens syncTvUnit snippet not found')
text = text.replace(old_sync, new_sync, 1)
text = text.replace("""  syncTvUnit(unit, screen, binding, {\n    requestFresh:binding?.online === true && binding?.preview_available !== true\n  });\n""", "  syncTvUnit(unit, screen, binding);\n", 1)
old_dialog = """function updatePreviewDialog(screen, { requestFresh = false } = {}) {\n  const dialog = ensurePreviewDialog();\n  const binding = bindingForScreen(screen.id);\n  dialog.querySelector('[data-tv-preview-title]').textContent = tvLabel(screen);\n  dialog.querySelector('[data-tv-preview-visual]').replaceChildren(createTvFace(screen, binding, true, { requestFresh }));\n  fillCardMeta(dialog.querySelector('[data-tv-preview-meta]'), screen, binding);\n}\n\nfunction openPreview(screen) {\n  previewDialogScreenId = Number(screen.id);\n  const dialog = ensurePreviewDialog();\n  updatePreviewDialog(screen, { requestFresh:true });\n"""
new_dialog = """function updatePreviewDialog(screen) {\n  const dialog = ensurePreviewDialog();\n  const binding = bindingForScreen(screen.id);\n  const status = statusState(binding);\n  dialog.querySelector('[data-tv-preview-title]').textContent = tvLabel(screen);\n  const visual = dialog.querySelector('[data-tv-preview-visual]');\n  const previewKey = String(binding?.preview_updated_at || '');\n  const currentFace = visual?.querySelector('.screen-tv-face');\n  if (visual && (visual.dataset.tvPreviewKey !== previewKey || !currentFace)) {\n    visual.dataset.tvPreviewKey = previewKey;\n    visual.replaceChildren(createTvFace(screen, binding, true));\n  } else if (currentFace) {\n    currentFace.className = `screen-tv-face is-${status.key} is-large`;\n  }\n  fillCardMeta(dialog.querySelector('[data-tv-preview-meta]'), screen, binding);\n}\n\nfunction openPreview(screen) {\n  previewDialogScreenId = Number(screen.id);\n  const dialog = ensurePreviewDialog();\n  updatePreviewDialog(screen);\n"""
if old_dialog not in text: raise SystemExit('screens preview dialog snippet not found')
text = text.replace(old_dialog, new_dialog, 1)
if 'requestFresh' in text: raise SystemExit('requestFresh remained in screens.js')
screens.write_text(text, encoding='utf-8')

# Device admin API: preview metadata and GET expose LKG even across reconnect/offline; GET never requests capture.
admin = Path('src/api/device/admin-routes.js')
text = admin.read_text(encoding='utf-8')
start = text.index('const PREVIEW_WAIT_MS = 2500;')
end = text.index('export function createDeviceAdminRouter', start)
text = text[:start] + text[end:]
old = """      const preview = realtime?.screenPreviewMeta(binding.screen_id);\n      const previewIsCurrentSession = Boolean(\n        preview && (!presence.connected_at || Date.parse(preview.updated_at) >= Date.parse(presence.connected_at))\n      );\n"""
if old not in text: raise SystemExit('preview current session snippet not found')
text = text.replace(old, "      const preview = realtime?.screenPreviewMeta(binding.screen_id);\n", 1)
text = text.replace("""        preview_available: online && previewIsCurrentSession,\n        preview_updated_at: previewIsCurrentSession ? preview.updated_at : null,\n""", """        preview_available:Boolean(preview),\n        preview_updated_at:preview?.updated_at || null,\n""", 1)
old_get = """    const presence = realtime?.presenceForScreen(screenId);\n    if (presence?.online !== true) return response.status(404).json({ error: 'TV Player сейчас не в сети.' });\n    const preview = await freshScreenPreview(realtime, screenId);\n"""
if old_get not in text: raise SystemExit('active preview GET snippet not found')
text = text.replace(old_get, "    const preview = realtime?.screenPreview?.(screenId) || null;\n", 1)
admin.write_text(text, encoding='utf-8')

# Manager endpoint must also be passive; all admin surfaces share the same saved frame.
manager_route = Path('src/api/managers/view-routes.js')
text = manager_route.read_text(encoding='utf-8')
start = text.index('async function requestedPreview(')
end = text.index('export function createManagerViewRouter', start)
text = text[:start] + text[end:]
text = text.replace('    const preview = await requestedPreview(realtime, id);', '    const preview = realtime?.screenPreview?.(id) || null;', 1)
manager_route.write_text(text, encoding='utf-8')

# On a connection with no server-side LKG request exactly one capture. Existing LKG survives reconnect.
realtime = Path('src/realtime/player-realtime.js')
text = realtime.read_text(encoding='utf-8')
old = """          add(session, ws);\n          send(ws, { type: 'ready', screen_id: session.screen_id });\n"""
new = """          add(session, ws);\n          send(ws, { type: 'ready', screen_id: session.screen_id });\n          if (!screenPreviews.has(Number(session.screen_id))) send(ws, { type:'preview.request' });\n"""
if old not in text: raise SystemExit('realtime ready snippet not found')
realtime.write_text(text.replace(old, new, 1), encoding='utf-8')

# After a successfully applied content change, publish the new frame from the Player itself.
state_sync = Path('src/web/admin-ui/public/js/player/player-state-sync.js')
text = state_sync.read_text(encoding='utf-8')
old = """    void warmAssets?.(context, changedNames);\n  }\n"""
new = """    void warmAssets?.(context, changedNames);\n    if (source !== 'last-known-good' && changedNames.length > 0) {\n      window.dispatchEvent(new CustomEvent('mira:player-preview-request', { detail:{ reason:'state-applied' } }));\n    }\n  }\n"""
if old not in text: raise SystemExit('state applied tail not found')
state_sync.write_text(text.replace(old, new, 1), encoding='utf-8')

# Update renderer regressions for one visible readable price column.
test_file = Path('tests/readable-menu-style.test.js')
text = test_file.read_text(encoding='utf-8')
text = text.replace("  assert.equal((svg.match(/>1,5 л<\\/text>/g) || []).length, 2);", "  assert.equal((svg.match(/>1,5 л<\\/text>/g) || []).length, 0);")
text = text.replace("  assert.equal((lightRow.match(new RegExp(`class=\\\"price\\\"[^>]*fill=\\\"${layout.palette.primaryText}\\\"`, 'g')) || []).length, 2);", "  assert.equal((lightRow.match(new RegExp(`class=\\\"price\\\"[^>]*fill=\\\"${layout.palette.primaryText}\\\"`, 'g')) || []).length, 1);")
text = text.replace("  assert.equal((accentRow.match(new RegExp(`class=\\\"price\\\"[^>]*fill=\\\"${layout.palette.accentText}\\\"`, 'g')) || []).length, 2);", "  assert.equal((accentRow.match(new RegExp(`class=\\\"price\\\"[^>]*fill=\\\"${layout.palette.accentText}\\\"`, 'g')) || []).length, 1);")
text = text.replace("  assert.ok(layout.columns[0].priceZoneLeft < layout.columns[0].primaryPriceX);", "  assert.ok(layout.columns[0].priceZoneLeft < layout.columns[0].primaryPriceX);\n  assert.equal(layout.columns[0].secondaryPriceX, layout.columns[0].primaryPriceX);")
test_file.write_text(text, encoding='utf-8')

browser = Path('tests/browser/readable-menu-fullscreen.spec.js')
text = browser.read_text(encoding='utf-8')
text = text.replace("  await expect(stage.locator('.price-label', { hasText:'1,5 л' })).toHaveCount(2);", "  await expect(stage.locator('.price-label', { hasText:'1,5 л' })).toHaveCount(0);")
text = text.replace("  expect((await prices.nth(1).getAttribute('fill'))?.toUpperCase()).toBe(itemNameFill);\n", "  await expect(prices).toHaveCount(1);\n")
browser.write_text(text, encoding='utf-8')

reg = Path('tests/browser/readable-menu-regression.spec.js')
text = reg.read_text(encoding='utf-8')
text = text.replace("row.priceFills.length === 2 && row.priceFills.every", "row.priceFills.length === 1 && row.priceFills.every")
text = text.replace("  expect(headerGeometry.labelSizes).toHaveLength(2);", "  expect(headerGeometry.labelSizes).toHaveLength(1);")
old_compare = """  expect(readable.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFills })))\n    .toEqual(classic.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFills })));\n"""
new_compare = """  expect(readable.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFill:priceFills[0] })))\n    .toEqual(classic.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFill:priceFills[0] })));\n"""
if old_compare not in text: raise SystemExit('browser classic/readable comparison not found')
reg.write_text(text.replace(old_compare, new_compare, 1), encoding='utf-8')

Path('tests/tv-preview-lkg.test.js').write_text("""import assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport test from 'node:test';\n\nconst read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');\n\ntest('admin preview endpoints are passive LKG readers', async () => {\n  const [deviceAdmin, manager] = await Promise.all([\n    read('src/api/device/admin-routes.js'),\n    read('src/api/managers/view-routes.js')\n  ]);\n  assert.doesNotMatch(deviceAdmin, /freshScreenPreview|requestScreenPreview/);\n  assert.match(deviceAdmin, /preview_available:Boolean\\(preview\\)/);\n  assert.match(deviceAdmin, /screenPreview\\?\\.\\(screenId\\)/);\n  assert.doesNotMatch(manager, /requestedPreview|requestScreenPreview/);\n  assert.match(manager, /screenPreview\\?\\.\\(id\\)/);\n});\n\ntest('TV cards keep the same image across status-only refreshes', async () => {\n  const screens = await read('src/web/admin-ui/public/js/pages/screens.js');\n  assert.doesNotMatch(screens, /requestFresh/);\n  assert.match(screens, /const faceKey = String\\(binding\\?\\.preview_updated_at \\|\\| ''\\)/);\n  assert.doesNotMatch(screens, /faceKey = `\\$\\{status\\.key\\}/);\n});\n\ntest('Player publishes a frame on first missing LKG and after applied content changes', async () => {\n  const [realtime, sync] = await Promise.all([\n    read('src/realtime/player-realtime.js'),\n    read('src/web/admin-ui/public/js/player/player-state-sync.js')\n  ]);\n  assert.match(realtime, /!screenPreviews\\.has\\(Number\\(session\\.screen_id\\)\\).*preview\\.request/);\n  assert.match(sync, /source !== 'last-known-good'.*changedNames\\.length > 0/);\n  assert.match(sync, /mira:player-preview-request/);\n});\n""", encoding='utf-8')

# Release metadata 1.18.7 and shell v68.
subprocess.run(['npm', 'version', '1.18.7', '--no-git-tag-version'], check=True)
subprocess.run(['npm', 'pkg', 'set', 'miraVersion=1.18.7'], check=True)
for path in ['.env.example', 'mira-tv.sh', 'src/web/admin-ui/public/js/player/player.js']:
    p = Path(path)
    content = p.read_text(encoding='utf-8')
    if '1.18.6' not in content: raise SystemExit(f'1.18.6 version marker missing in {path}')
    p.write_text(content.replace('1.18.6', '1.18.7'), encoding='utf-8')

sw = Path('src/web/admin-ui/public/player-sw.js')
text = sw.read_text(encoding='utf-8')
if "mira-tv-player-shell-v66" not in text or "mira-tv-player-shell-v67" not in text:
    raise SystemExit('expected shell v66/v67 markers not found')
text = text.replace("const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v66';", "const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v67';", 1)
text = text.replace("const SHELL_CACHE = 'mira-tv-player-shell-v67';", "const SHELL_CACHE = 'mira-tv-player-shell-v68';", 1)
text = text.replace('// Source revision: classic table surface parity with readable two-column style.', '// Source revision: event-driven TV snapshots and single-price readable table.')
sw.write_text(text, encoding='utf-8')

Path('docs/releases/1.18.7.md').write_text("""# MIRA-TV 1.18.7\n\n## Что изменено\n\n- В стиле **«Читаемый · 2 колонки»** полностью убран визуальный столбец `1,5 л`; данные второй цены остаются в каталоге и классическом стиле.\n- Освободившаяся ширина отдана названию товара и крепости; `1 л` остаётся отдельной защищённой ценовой зоной.\n- Карточки ТВ во всех точках больше не пересоздают кадр при 5-секундном обновлении статуса. Последний успешный кадр сохраняется как LKG и остаётся видимым даже при offline/reconnect.\n- GET превью больше не инициирует capture на телевизоре. Новый кадр публикуется Player после успешного применения изменившегося контента; при подключении кадр запрашивается только если сервер ещё не имеет LKG.\n- Классическая таблица уже использует ту же тёмную SVG-поверхность, что и читаемый стиль.\n- Offline Player shell обновлён до v68.\n\nБез изменений API данных каталога, PostgreSQL schema, Docker volumes и Local-first состояния.\n""", encoding='utf-8')

# Fast focused checks before the PR Final CI.
subprocess.run(['node', '--test', 'tests/readable-menu-style.test.js', 'tests/tv-preview-lkg.test.js'], check=True)
subprocess.run(['node', '--check', 'src/web/admin-ui/public/js/editor/renderer-layout.js'], check=True)
subprocess.run(['node', '--check', 'src/web/admin-ui/public/js/editor/renderer-svg.js'], check=True)
subprocess.run(['node', '--check', 'src/web/admin-ui/public/js/pages/screens.js'], check=True)
subprocess.run(['node', '--check', 'src/web/admin-ui/public/js/player/player-state-sync.js'], check=True)
subprocess.run(['node', '--check', 'src/realtime/player-realtime.js'], check=True)
subprocess.run(['node', '--check', 'src/api/device/admin-routes.js'], check=True)
subprocess.run(['node', '--check', 'src/api/managers/view-routes.js'], check=True)
