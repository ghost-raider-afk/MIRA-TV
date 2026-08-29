#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

# Canonical screen API: saving state is the publication boundary for TV Player.
(ROOT/'src/api/screens/routes.js').write_text('''import express from 'express';\nimport { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';\nimport { menuSettingsInput } from '../../contracts/menu-settings.js';\nimport { createScreenBackground, deleteScreenBackground } from '../../services/screen-background-service.js';\nimport { activity, conflict, notFound } from '../helpers.js';\n\nfunction settingsOptions(config) {\n  return { allowBackgroundImage: true, maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight };\n}\n\nasync function cloneScreen(tx, sourceId, targetLocationId, config, updatedBy) {\n  const source = await tx.getScreen(sourceId);\n  if (!source) throw notFound();\n  const [draft, sourceAnimation] = await Promise.all([tx.getScreenDraft(source.id), tx.getScreenAnimationSettings(source.id)]);\n  const created = await tx.createScreen({ location_id: targetLocationId, resolution: source.resolution, status: 'draft', active: source.active !== false });\n  const saved = await tx.saveScreenDraft(created.id, {\n    rows: structuredClone(draft.rows || []),\n    settings: menuSettingsInput(draft.settings || {}, settingsOptions(config))\n  }, 1);\n  if (!saved) throw conflict('Не удалось создать независимую копию монитора.');\n  if (sourceAnimation) {\n    const applied = await tx.applyAnimationSettingsToScreens([created.id], sourceAnimation, updatedBy);\n    if (applied.length !== 1) throw conflict('Не удалось создать независимую копию плейлиста монитора.');\n  }\n  return tx.getScreen(created.id);\n}\n\nfunction draftRevisionHeader(request) {\n  return positiveId(request.get('x-draft-revision'), 'x-draft-revision');\n}\n\nexport function createScreensRouter({ store, config }) {\n  const router = express.Router();\n\n  router.get('/screens', async (_request, response) => response.json(await store.listScreens()));\n  router.get('/screens/:id', async (request, response) => {\n    const screen = await store.getScreen(positiveId(request.params.id, 'id'));\n    if (!screen) throw notFound();\n    response.json(screen);\n  });\n  router.get('/screens/:id/editor', async (request, response) => {\n    const id = positiveId(request.params.id, 'id');\n    const screen = await store.getScreen(id);\n    if (!screen) throw notFound();\n    const [draft, products, packaging] = await Promise.all([store.getScreenDraft(id), store.listProducts(), store.listPackaging()]);\n    response.json({ screen, draft, products, packaging });\n  });\n\n  router.put('/screens/:id/draft', async (request, response) => {\n    const id = positiveId(request.params.id, 'id');\n    const expectedRevision = positiveId(request.body?.revision, 'revision');\n    const result = await store.transaction(async (tx) => {\n      if (!await tx.lockScreen(id)) throw notFound();\n      const current = await tx.getScreen(id);\n      if (!current) throw notFound();\n      const draft = await menuDraftInput(request.body, tx, config.menuDraftMaxBytes);\n      draft.settings = menuSettingsInput(draft.settings, settingsOptions(config));\n      let screenData = {\n        location_id: current.location_id, name: current.name, resolution: current.resolution, status: current.status, active: current.active\n      };\n      if (request.body?.screen && typeof request.body.screen === 'object' && !Array.isArray(request.body.screen)) {\n        const siteSettings = await tx.getSiteSettings();\n        screenData = screenInput(request.body.screen, {\n          defaultScreenResolution: siteSettings.default_screen_resolution,\n          maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight\n        });\n        if (!await tx.getLocation(screenData.location_id)) throw notFound();\n      }\n      const updatedScreen = await tx.updateScreen(id, screenData);\n      if (!updatedScreen) throw notFound();\n      const saved = await tx.saveScreenDraft(id, draft, expectedRevision);\n      if (!saved) throw conflict('Меню уже было изменено в другом окне. Обновите редактор и повторите изменения.', { expected_revision: expectedRevision });\n      return { screen: await tx.getScreen(id), draft: saved };\n    });\n    await activity(store, request, { action: 'screen.state.saved', entity_type: 'screen', entity_id: id, message: `Сохранено состояние монитора «${result.screen.name}».` });\n    response.json(result);\n  });\n\n  router.put('/screens/:id/background', express.raw({\n    type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: config.screenBackgroundMaxBytes\n  }), async (request, response) => {\n    const id = positiveId(request.params.id, 'id');\n    const expectedRevision = draftRevisionHeader(request);\n    const asset = await createScreenBackground(request.body, config);\n    let previousUrl = '';\n    try {\n      const result = await store.transaction(async (tx) => {\n        if (!await tx.lockScreen(id)) throw notFound();\n        const screen = await tx.getScreen(id);\n        if (!screen) throw notFound();\n        const draft = await tx.getScreenDraft(id);\n        previousUrl = draft.settings?.background_image_url || '';\n        const settings = menuSettingsInput({ ...draft.settings, background_image_url: asset.publicUrl }, settingsOptions(config));\n        const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings }, expectedRevision);\n        if (!saved) throw conflict('Состояние уже изменено в другом окне. Обновите редактор.');\n        return { screen: await tx.getScreen(id), draft: saved };\n      });\n      if (previousUrl && previousUrl !== asset.publicUrl) await deleteScreenBackground(previousUrl, { store, config });\n      await activity(store, request, { action: 'screen.background.updated', entity_type: 'screen', entity_id: id, message: `Обновлён фон монитора «${result.screen.name}».` });\n      response.json(result);\n    } catch (error) {\n      await deleteScreenBackground(asset.publicUrl, { store, config, force: true });\n      throw error;\n    }\n  });\n\n  router.delete('/screens/:id/background', async (request, response) => {\n    const id = positiveId(request.params.id, 'id');\n    const expectedRevision = draftRevisionHeader(request);\n    let previousUrl = '';\n    const result = await store.transaction(async (tx) => {\n      if (!await tx.lockScreen(id)) throw notFound();\n      const screen = await tx.getScreen(id);\n      if (!screen) throw notFound();\n      const draft = await tx.getScreenDraft(id);\n      previousUrl = draft.settings?.background_image_url || '';\n      const settings = menuSettingsInput({ ...draft.settings, background_image_url: '' }, settingsOptions(config));\n      const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings }, expectedRevision);\n      if (!saved) throw conflict('Состояние уже изменено в другом окне. Обновите редактор.');\n      return { screen: await tx.getScreen(id), draft: saved };\n    });\n    if (previousUrl) await deleteScreenBackground(previousUrl, { store, config });\n    await activity(store, request, { action: 'screen.background.removed', entity_type: 'screen', entity_id: id, message: `Удалён фон монитора «${result.screen.name}».` });\n    response.json(result);\n  });\n\n  router.post('/locations/:id/screens', async (request, response) => {\n    const locationId = positiveId(request.params.id, 'id');\n    const sourceId = request.body?.source_screen_id ? positiveId(request.body.source_screen_id, 'source_screen_id') : null;\n    const screen = await store.transaction(async (tx) => {\n      const location = await tx.getLocation(locationId);\n      if (!location) throw notFound();\n      if (sourceId) return cloneScreen(tx, sourceId, locationId, config, request.session.sub);\n      const siteSettings = await tx.getSiteSettings();\n      return tx.createScreen({ location_id: locationId, resolution: siteSettings.default_screen_resolution, status: 'draft', active: true });\n    });\n    if (!screen) throw notFound();\n    await activity(store, request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Создан монитор «${screen.name}».` });\n    response.status(201).json(screen);\n  });\n\n  router.delete('/screens/:id', async (request, response) => {\n    const id = positiveId(request.params.id, 'id');\n    const current = await store.getScreen(id);\n    if (!current) throw notFound();\n    const draft = await store.getScreenDraft(id);\n    if (draft?.settings?.background_image_url) await deleteScreenBackground(draft.settings.background_image_url, { store, config });\n    if (!await store.deleteScreen(id)) throw notFound();\n    await activity(store, request, { action: 'screen.deleted', entity_type: 'screen', entity_id: id, message: `Удалён монитор «${current.name}».` });\n    response.status(204).end();\n  });\n\n  return router;\n}\n''')

# Site settings expose the actual application domain only.
p=ROOT/'src/services/site-assets-service.js'
t=p.read_text()
t=t.replace('    domain: config.sftp.publicHost,\n', '    domain: config.domain,\n')
t=re.sub(r"\s*sftp_port: config\.sftp\.port,\n", '', t)
p.write_text(t)

# Remove retired input contracts.
p=ROOT/'src/contracts/input.js'
t=p.read_text()
t=re.sub(r"\nexport function sftpDirectoryInput\(body\) \{.*?\n}\n", '\n', t, flags=re.S)
t=re.sub(r"\nexport function sftpBindingInput\(body\) \{.*?\n}\n", '\n', t, flags=re.S)
p.write_text(t)

# Remove retired category/endpoint/state remnants.
for rel in ['src/web/admin-ui/public/js/pages/events.js','src/web/admin-ui/public/js/core/notifications.js']:
    p=ROOT/rel; t=p.read_text(); t=re.sub(r",?\s*sftp:\s*'SFTP'", '', t); p.write_text(t)
p=ROOT/'src/web/admin-ui/public/js/core/dom.js'; t=p.read_text(); t=re.sub(r"\n\s*if \(/sftp/i\.test\(source\)\) return 'sftp';", '', t); p.write_text(t)
p=ROOT/'src/web/admin-ui/public/js/core/config.js'; t=p.read_text(); t=re.sub(r"\n\s*sftpDirectories:.*?\n\s*sftpConnection:.*?\n\s*sftpOverview:.*?(?=\n)", '', t); p.write_text(t)
p=ROOT/'src/web/admin-ui/public/js/core/state.js'; t=p.read_text(); t=re.sub(r"\n\s*sftpDirectories:\s*\[\],?", '', t); p.write_text(t)
p=ROOT/'src/db/helpers.js'; t=p.read_text(); t=re.sub(r"\n\s*\.\.\.numericField\(row, 'sftp_directory_id'\),?", '', t); p.write_text(t)
p=ROOT/'src/db/migrations/event-journal.js'; t=p.read_text(); t=re.sub(r"\n\s*WHEN action LIKE 'sftp\.%' THEN 'sftp'", '', t); p.write_text(t)

# Editor is state-first: no generated delivery image and no second publish action.
p=ROOT/'src/web/admin-ui/public/js/editor/properties.js'
t=p.read_text()
t=re.sub(r"\n\s*const path = element\('editor-sftp-path'\);\n\s*if \(path\).*?;", '', t)
t=re.sub(r"\nexport function syncDeliveryControls\(screen, editorState\) \{.*?\n}\n", '\n', t, flags=re.S)
p.write_text(t)

p=ROOT/'src/web/admin-ui/public/js/editor/editor.js'
t=p.read_text()
t=t.replace(', syncDeliveryControls', '')
t=t.replace("import { renderFinalJpeg } from './final-image.js';\n", '')
t=t.replace("  'editor-publish', 'editor-save'", "  'editor-save'")
t=t.replace('  syncDeliveryControls(screen, editorState);\n', '')
t=re.sub(r"\n\s*let jpegPrepared = false;.*?setEditorMessage\(`Меню сохранено, но JPEG не собран: \$\{jpegError\?\.message \|\| 'неизвестная ошибка'\}\.`, 'error'\);", "\n      populateEditor(screen, editorState);\n      refreshRows();\n      refreshEditorView();\n      await loadNotifications();\n      setEditorMessage('Состояние сохранено и доступно TV Player.', 'success');", t, flags=re.S)
t=re.sub(r"\n\s*element\('editor-publish'\)\?\.addEventListener\('click', async \(\) => \{.*?\n\s*}\);\n", '\n', t, flags=re.S)
p.write_text(t)

# Final-image delivery renderer is no longer part of the product.
final_image=ROOT/'src/web/admin-ui/public/js/editor/final-image.js'
if final_image.exists(): final_image.unlink()

# Screen editor UI has only Save and local preview.
p=ROOT/'src/web/admin-ui/public/screen-editor.html'
t=p.read_text()
t=t.replace('href="/screens.html"', 'href="/screens"')
t=re.sub(r"\s*<span class=\"editor-toolbar-path\" id=\"editor-sftp-path\">.*?</span>", '', t)
t=t.replace('aria-label="Сохранение и публикация"', 'aria-label="Сохранение"')
t=re.sub(r"\s*<button class=\"button button-primary editor-publish\".*?</button>", '', t)
t=t.replace('Доступен для публикации', 'Доступен TV Player')
t=t.replace('Один renderer для preview и JPEG', 'Канонический renderer TV Player')
p.write_text(t)

# CSS and page copy.
p=ROOT/'src/web/admin-ui/public/css/index.css'; t=p.read_text().replace("@import url('./pages/sftp-settings.css');\n", ''); p.write_text(t)
p=ROOT/'src/web/admin-ui/public/css/pages/locations.css'; p.write_text('''body[data-page="locations"] .workspace-grid{display:grid;grid-template-columns:minmax(280px,.78fr) minmax(360px,1.22fr);gap:8px}body[data-page="locations"] .workspace-content .settings-card{min-height:100%}body[data-page="locations"] .record-list{margin-top:5px}@media(max-width:980px){body[data-page="locations"] .workspace-grid{grid-template-columns:1fr}}\n''')
p=ROOT/'src/web/admin-ui/public/locations.html'; t=p.read_text(); t=t.replace('Точки и копирование структуры. SFTP управляется отдельно в Настройки → SFTP.', 'Точки, мониторы и копирование структуры.'); t=t.replace('При выборе образца копируются мониторы, меню и оформление. SFTP не копируется.', 'При выборе образца копируются мониторы, меню и оформление.'); p.write_text(t)
p=ROOT/'src/web/admin-ui/public/events.html'; t=p.read_text(); t=re.sub(r'<option value="sftp">SFTP</option>', '', t); p.write_text(t)

# Browser tests no longer navigate to a removed subsystem or inspect its editor field.
for rel in ['tests/browser/editor-visual.spec.js','tests/browser/spa-navigation.spec.js']:
    p=ROOT/rel
    if not p.exists(): continue
    lines=[]
    for line in p.read_text().splitlines():
        low=line.lower()
        if 'sftp' in low: continue
        lines.append(line)
    p.write_text('\n'.join(lines)+'\n')

# Product baseline test uses positive assertions only; retired names do not belong in tests either.
p=ROOT/'tests/mira-product-baseline.test.js'
t=p.read_text()
t=re.sub(r"\n\s*assert\.doesNotMatch\(server, /Sftp\|sftp/\);", '', t)
t=re.sub(r"\ntest\('removed file-delivery subsystem is physically absent'.*?\n}\);", '', t, flags=re.S)
p.write_text(t)

# Replace old final-image test with a stronger single-renderer contract.
p=ROOT/'tests/css-adversarial.test.js'
t=p.read_text()
old=re.compile(r"test\('preview and final image share the exact modular canonical SVG and fit logic'.*?\n}\);", re.S)
new="""test('preview and TV rendering share one canonical SVG model without a delivery-image renderer', async () => {\n  const [facade, model, svg, preview, player] = await Promise.all([\n    source('src/web/admin-ui/public/js/editor/renderer.js'),\n    source('src/web/admin-ui/public/js/editor/renderer-model.js'),\n    source('src/web/admin-ui/public/js/editor/renderer-svg.js'),\n    source('src/web/admin-ui/public/js/editor/preview.js'),\n    source('src/web/admin-ui/public/js/player/player.js')\n  ]);\n  assert.match(facade, /from '\\.\\/renderer-model\\.js'/);\n  assert.match(facade, /buildTableSvg.*from '\\.\\/renderer-svg\\.js'/s);\n  assert.match(model, /export function buildRenderLayout/);\n  assert.match(svg, /export function buildTableSvg/);\n  assert.equal((svg.match(/export function buildTableSvg/g) || []).length, 1);\n  assert.match(preview, /buildTableSvg\\(model, lines, layout\\)/);\n  assert.match(player, /buildTableSvg/);\n});"""
t=old.sub(new,t)
p.write_text(t)

# Roadmap is now only for the new architecture.
(ROOT/'docs/ROADMAP.md').write_text('''# MIRA-TV Roadmap\n\n## 1.0.0.1\n- чистый MIRA-TV namespace и installer;\n- единый Player state вместо отдельной файловой публикации;\n- offline-first Last Known Good;\n- локальный журнал Player с bounded storage;\n- WebSocket invalidation/control plane;\n- REST snapshot/delta sync;\n- render-on-change по независимым слоям;\n- строгий ресурсный бюджет телевизора.\n\n## После 1.0.0.1\n- расширенная fleet-диагностика;\n- component-level asset manifests;\n- опциональный WebGL2/WebGPU слой только для эффектов, которым это действительно нужно;\n- измеримый resource telemetry budget без покадрового логирования.\n''')

print('obsolete file publication model removed')
