#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

replacements = {
  'src/web/admin-ui/public/js/pages/events.js': [('menu-tv:event-recorded','mira-tv:event-recorded')],
  'src/web/admin-ui/public/js/core/notifications.js': [('menu-tv:event-recorded','mira-tv:event-recorded')],
  'src/web/admin-ui/public/js/core/presentation.js': [('menu-tv-theme','mira-tv-theme')],
  'src/web/admin-ui/public/js/core/toasts.js': [('menu-tv:event-recorded','mira-tv:event-recorded')],
  'src/web/admin-ui/public/theme-bootstrap.js': [('menu_tv_theme','mira_tv_theme'),('menu-tv-theme','mira-tv-theme')],
  'tests/site-assets.test.js': [('menu-tv-site-assets-','mira-tv-site-assets-')],
}
for rel, pairs in replacements.items():
    p=ROOT/rel
    if not p.exists(): continue
    t=p.read_text()
    for old,new in pairs: t=t.replace(old,new)
    p.write_text(t)

(ROOT/'Dockerfile').write_text('''FROM node:24-bookworm-slim AS base\nWORKDIR /app\nENV NODE_ENV=production\n\nFROM base AS dependencies\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev && npm cache clean --force\n\nFROM base AS runtime\nRUN groupadd --gid 11000 mira-tv-assets \\\n  && useradd --uid 10001 --gid mira-tv-assets --create-home --shell /usr/sbin/nologin mira-tv\nCOPY --from=dependencies /app/node_modules ./node_modules\nCOPY package.json ./\nCOPY src ./src\nCOPY native ./native\nCOPY scripts ./scripts\nRUN chown -R mira-tv:mira-tv-assets /app\nUSER mira-tv\nEXPOSE 8080\nCMD ["node", "src/server.js"]\n''')

(ROOT/'docs/VPS-ACCEPTANCE.md').write_text('''# MIRA-TV — приёмка VPS\n\n## Цель\nПроверить чистую установку MIRA-TV 1.0.0.1 без устаревших транспортных сервисов.\n\n## Обязательные проверки\n- `mira-tv` и `mira-tv-db` запущены и healthy;\n- HTTPS отвечает на каноническом домене;\n- PostgreSQL доступен только внутренней Docker-сети;\n- внешний proxy network называется `mira-tv-proxy`;\n- TV Player `/player` открывается и может пройти QR-привязку;\n- локальные site assets доступны Player по HTTPS;\n- на хосте нет отдельного файлового транспортного сервиса и лишнего открытого порта;\n- `docker compose -p mira-tv config` проходит без ошибок;\n- повторный `update` не пересоздаёт секреты из `.env`;\n- `remove` сохраняет данные, `purge` удаляет volumes только после явного выбора пользователя.\n\n## Ресурсный критерий TV Player\nПри отсутствии изменений Player не должен постоянно пересобирать статические слои или выполнять частые сетевые запросы.\n''')

# Exact old product brand in visible defaults becomes MIRA-TV.
for p in ROOT.rglob('*'):
    if not p.is_file() or '.git' in p.parts or 'node_modules' in p.parts: continue
    if p.suffix.lower() not in {'.js','.md','.html','.css','.json','.yaml','.yml','.sh','.example'} and p.name != '.env.example': continue
    try: t=p.read_text()
    except UnicodeDecodeError: continue
    n=t.replace('ТВ МЕНЮ','MIRA-TV')
    if n != t: p.write_text(n)

print('remaining legacy runtime identifiers purged')
