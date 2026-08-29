#!/usr/bin/env python3
from pathlib import Path
import json, re, shutil

ROOT = Path(__file__).resolve().parents[1]

DELETE = [
    'src/api/sftp', 'src/sftp', 'src/db/sftp.js', 'src/services/sftp-access-service.js',
    'src/services/publish-service.js',
    'src/web/admin-ui/public/sftp-settings.html',
    'src/web/admin-ui/public/js/pages/sftp-settings.js',
    'src/web/admin-ui/public/css/pages/sftp-settings.css',
    'tests/sftp-resilience.test.js', 'tests/sftp-settings-center.test.js',
    'tests/publish-service.test.js', 'tests/publish-revision.test.js', 'tests/editor-publish-ui.test.js'
]
for rel in DELETE:
    p = ROOT / rel
    if p.is_dir(): shutil.rmtree(p)
    elif p.exists(): p.unlink()

old_installer = ROOT / 'menu-tv-2.sh'
new_installer = ROOT / 'mira-tv.sh'
if old_installer.exists():
    old_installer.unlink()

TEXT_SUFFIXES = {'.js','.json','.md','.html','.css','.yml','.yaml','.sh','.cpp','.txt','.example'}
replacements = [
    ('ghost-raider-afk/menu-tv-2', 'ghost-raider-afk/MIRA-TV'),
    ('menu-tv-2.0', 'mira-tv'),
    ('menu-tv-2', 'mira-tv'),
    ('menu_tv_2', 'mira_tv'),
    ('MENU_TV_2', 'MIRA_TV'),
    ('tv-menu-2', 'mira-tv'),
    ('tv-menu', 'mira-tv'),
    ('Menu TV 2.0', 'MIRA-TV'),
    ('Menu TV', 'MIRA-TV'),
    ('TV Menu', 'MIRA-TV'),
    ('MenuTvStore', 'MiraTvStore'),
]
for p in ROOT.rglob('*'):
    if not p.is_file() or '.git' in p.parts or p.name == 'package-lock.json': continue
    if p.suffix.lower() not in TEXT_SUFFIXES and p.name not in {'.env.example','.dockerignore','.gitignore'}: continue
    try: text = p.read_text()
    except UnicodeDecodeError: continue
    new = text
    for a,b in replacements: new = new.replace(a,b)
    if new != text: p.write_text(new)

# Package metadata: canonical product release is four-part, npm remains valid SemVer.
pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text())
pkg['name'] = 'mira-tv'
pkg['version'] = '1.0.0-1'
pkg['miraVersion'] = '1.0.0.1'
pkg['description'] = 'MIRA-TV offline-first administration and TV player application'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

# Fresh product history starts here.
(ROOT/'CHANGELOG.md').write_text('''# Changelog\n\n## [1.0.0.1] - 2026-08-29\n\n### MIRA-TV\n- Новый самостоятельный репозиторий и новая нумерация продукта.\n- Полный ребрендинг runtime, Docker, путей, cache/storage keys и installer в MIRA-TV.\n- SFTPGo и весь SFTP/JPEG delivery pipeline удалены: телевизоры работают через MIRA-TV Player по HTTPS.\n- Архитектурный приоритет TV Player: минимальный расход CPU, GPU, RAM, сети и диска.\n- Подготовлена база для offline-first запуска, локального Last Known Good, WebSocket invalidation, delta sync и пакетной отправки логов.\n''')

(ROOT/'compose.yaml').write_text('''services:\n  db:\n    image: postgres:17-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad\n    container_name: mira-tv-db\n    environment:\n      POSTGRES_DB: ${POSTGRES_DB}\n      POSTGRES_USER: ${POSTGRES_USER}\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n      POSTGRES_INITDB_ARGS: --auth=scram-sha-256\n    volumes:\n      - mira-tv-db-data:/var/lib/postgresql/data\n    restart: unless-stopped\n    mem_limit: ${DB_MEMORY_LIMIT}\n    pids_limit: ${DB_PIDS_LIMIT}\n    networks: [mira-tv-internal]\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n      start_period: 10s\n\n  site-assets-init:\n    image: busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0\n    container_name: mira-tv-site-assets-init\n    env_file: [.env]\n    command: >-\n      sh -ec 'mkdir -p "$$SITE_ASSETS_ROOT" && chown 10001:11000 "$$SITE_ASSETS_ROOT" && chmod 2770 "$$SITE_ASSETS_ROOT"'\n    volumes:\n      - mira-tv-site-assets:${SITE_ASSETS_ROOT}\n    restart: "no"\n    networks: [mira-tv-internal]\n\n  app:\n    build: { context: . }\n    image: mira-tv:local\n    container_name: mira-tv\n    env_file: [.env]\n    restart: unless-stopped\n    mem_limit: ${APP_MEMORY_LIMIT}\n    pids_limit: ${APP_PIDS_LIMIT}\n    read_only: true\n    tmpfs:\n      - /tmp:rw,noexec,nosuid,size=64m\n    security_opt: [no-new-privileges:true]\n    cap_drop: [ALL]\n    depends_on:\n      db: { condition: service_healthy }\n      site-assets-init: { condition: service_completed_successfully }\n    volumes:\n      - mira-tv-site-assets:${SITE_ASSETS_ROOT}\n    networks: [mira-tv-internal, proxy]\n    labels:\n      - traefik.enable=true\n      - traefik.docker.network=mira-tv-proxy\n      - traefik.http.routers.mira-tv.rule=Host(`${MIRA_TV_DOMAIN}`)\n      - traefik.http.routers.mira-tv.entrypoints=websecure\n      - traefik.http.routers.mira-tv.tls=true\n      - traefik.http.routers.mira-tv.tls.certresolver=letsencrypt\n      - traefik.http.services.mira-tv.loadbalancer.server.port=8080\n\nvolumes:\n  mira-tv-db-data: { name: mira-tv-db-data }\n  mira-tv-site-assets: { name: mira-tv-site-assets }\n\nnetworks:\n  mira-tv-internal:\n    name: mira-tv-internal\n    internal: true\n  proxy:\n    external: true\n    name: mira-tv-proxy\n''')

(ROOT/'.env.example').write_text('''# MIRA-TV 1.0.0.1 — единый источник runtime-настроек.\nAPP_NAME=MIRA-TV\nMIRA_TV_VERSION=1.0.0.1\nNODE_ENV=production\nHOST=0.0.0.0\nPORT=8080\nMIRA_TV_DOMAIN=\n\nPOSTGRES_HOST=db\nPOSTGRES_PORT=5432\nPOSTGRES_DB=mira_tv\nPOSTGRES_USER=mira_tv\nPOSTGRES_PASSWORD=replace-with-generated-database-password\nPOSTGRES_POOL_MAX=5\nPOSTGRES_CONNECTION_TIMEOUT_MS=5000\nPOSTGRES_IDLE_TIMEOUT_MS=30000\n\nBOOTSTRAP_ADMIN_USERNAME=\nBOOTSTRAP_ADMIN_PASSWORD=\nGENERATED_PASSWORD_LENGTH=10\nPASSWORD_MIN_LENGTH=10\nPASSWORD_MAX_LENGTH=32\nSESSION_SECRET=replace-with-generated-session-secret\nSESSION_TTL_HOURS=12\nSECURE_COOKIES=true\nLOGIN_MAX_ATTEMPTS=8\nLOGIN_IP_MAX_ATTEMPTS=32\nLOGIN_WINDOW_MINUTES=15\nLOGIN_LIMITER_MAX_ENTRIES=500\n\nDEVICE_ACTIVATION_TTL_MINUTES=2\nDEVICE_ACTIVATION_POLL_SECONDS=2\nDEVICE_ACTIVATION_MAX_ATTEMPTS=20\nDEVICE_ACTIVATION_WINDOW_MINUTES=10\nDEVICE_ACTIVATION_LIMITER_MAX_ENTRIES=10000\nDEVICE_ACTIVATION_CLEANUP_MINUTES=15\nDEVICE_ACTIVATION_RETENTION_HOURS=24\nDEVICE_SESSION_TTL_DAYS=365\nDEVICE_HEARTBEAT_WRITE_SECONDS=60\nPLAYER_FALLBACK_POLL_SECONDS=60\nPLAYER_LOG_BATCH_SIZE=100\nPLAYER_LOG_LOCAL_MAX_ENTRIES=5000\nPLAYER_LOG_LOCAL_MAX_BYTES=10485760\n\nEVENT_JOURNAL_RETENTION_DAYS=30\nEVENT_JOURNAL_MAX_ENTRIES=5000\nJSON_BODY_MAX_BYTES=65536\nMENU_DRAFT_MAX_BYTES=49152\nSCREEN_SOURCE_MAX_BYTES=12582912\nDASHBOARD_REFRESH_MIN_SECONDS=15\nDASHBOARD_REFRESH_MAX_SECONDS=300\nSCREEN_MAX_WIDTH=1920\nSCREEN_MAX_HEIGHT=1080\nIMAGE_MAX_PIXELS=40000000\nSITE_ASSETS_ROOT=/srv/mira-tv/site-assets\nSITE_LOGO_MAX_BYTES=2097152\nSITE_FAVICON_MAX_BYTES=524288\nSCREEN_BACKGROUND_MAX_BYTES=20971520\nENTITY_ASSET_MAX_BYTES=104857600\nHEALTH_READINESS_CACHE_MS=2000\nAPP_MEMORY_LIMIT=768m\nAPP_PIDS_LIMIT=256\nDB_MEMORY_LIMIT=1g\nDB_PIDS_LIMIT=256\nSEED_DEMO_DATA=false\n''')

# New clean schema: no SFTP, no prepared/published JPEG state.
schema = ROOT/'src/db/migrations/schema.js'
text = schema.read_text()
text = re.sub(r"\s*CREATE TABLE IF NOT EXISTS sftp_directories \(.*?\);\n", "\n", text, flags=re.S)
text = re.sub(r"\s*sftp_directory_id BIGINT UNIQUE REFERENCES sftp_directories\(id\) ON DELETE RESTRICT,\n\s*sftp_username TEXT UNIQUE,\n\s*sftp_password_issued_at TIMESTAMPTZ,\n", "", text)
for col in ['delivery_filename','prepared_asset_key','prepared_asset_sha256','prepared_asset_size','prepared_draft_revision','publication_pending_sha256','publication_started_at','published_sha256','published_draft_revision','published_at']:
    text = re.sub(rf"\s*{col} [^,\n]+,?\n", "", text)
text = re.sub(r"\s*ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_.*?;\n", "", text)
text = re.sub(r"\s*ALTER TABLE screens ADD COLUMN IF NOT EXISTS (?:delivery_filename|prepared_asset_key|prepared_asset_sha256|prepared_asset_size|prepared_draft_revision|publication_pending_sha256|publication_started_at|published_sha256|published_draft_revision|published_at).*?;\n", "", text)
text = re.sub(r"\s*CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_.*?;\n", "", text)
schema.write_text(text)

# DB store: remove SFTP repository and adopt brand class name.
dbi = ROOT/'src/db/index.js'
text = dbi.read_text().replace("import { createSftpRepository } from './sftp.js';\n", '')
text = text.replace("    createSftpRepository(queryable, { getLocation: locations.getLocation }),\n", '')
text = text.replace('export class MenuTvStore', 'export class MiraTvStore')
dbi.write_text(text)

# Screens API no longer has SFTP/JPEG publication coupling.
screens = ROOT/'src/api/screens/routes.js'
text = screens.read_text()
text = text.replace("import { logger } from '../../logger/index.js';\n", '')
text = re.sub(r"async function removeStagedBestEffort\(.*?\n}\n\n", '', text, flags=re.S)
text = text.replace('export function createScreensRouter({ store, sftp, config })', 'export function createScreensRouter({ store, config })')
text = re.sub(r"\s*if \(current\.publication_pending_sha256\) \{.*?\n\s*}\n", '\n', text, flags=re.S)
text = text.replace("        if (current.published_at && current.location_id !== screenData.location_id) {\n          throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');\n        }\n", '')
text = text.replace("        invalidatedAssetKey: current.prepared_asset_key || null\n", "        revision: saved.revision\n")
text = re.sub(r"\n\s*await removeStagedBestEffort\(sftp, result\.invalidatedAssetKey,.*?\);", '', text)
text = re.sub(r"\s*if \(screen\.publication_pending_sha256\) throw conflict\([^\n]+\);\n", '', text)
text = text.replace("    await removeStagedBestEffort(sftp, current.prepared_asset_key, { screen_id: id });\n", '')
screens.write_text(text)

# Remove SFTP route from canonical pages.
routes = ROOT/'src/web/admin-ui/routes.js'
text = routes.read_text().replace("  Object.freeze({ path: '/sftp-settings', file: 'sftp-settings.html' }),\n", '')
text = text.replace("  ['/sftp-settings.html', '/sftp-settings'],\n", '')
routes.write_text(text)

# Remove SFTP navigation declarations wherever they occur.
for rel in ['src/web/admin-ui/public/js/core/navigation.js','src/web/admin-ui/public/js/components/header.js','src/web/admin-ui/public/js/application.js']:
    p=ROOT/rel
    if p.exists():
        lines=[line for line in p.read_text().splitlines() if 'sftp-settings' not in line.lower() and "'sftp'" not in line.lower()]
        p.write_text('\n'.join(lines)+'\n')

# Server: no SFTP service, no JPEG publication recovery.
server=ROOT/'src/server.js'
text=server.read_text()
for line in [
    "import { createPublishService } from './services/publish-service.js';\n",
    "import { SftpService } from './sftp/index.js';\n",
    "import { createSftpRouter } from './api/sftp/routes.js';\n",
]: text=text.replace(line,'')
text=re.sub(r"async function recoverRuntimeState\(store, sftp, config\) \{.*?\n}\n\n", "async function recoverRuntimeState(store, config) {\n  await cleanupDeviceActivations(store, config);\n  await cleanupEvents(store, config);\n}\n\n", text, flags=re.S)
text=text.replace("  app.use('/api', createSftpRouter(dependencies));\n", '')
text=text.replace('export async function createApp(config = loadConfig(), { store: suppliedStore, sftp: suppliedSftp } = {}) {', 'export async function createApp(config = loadConfig(), { store: suppliedStore } = {}) {')
text=text.replace('  const store = suppliedStore ?? new MenuTvStore(config.db, { seedDemoData: config.seedDemoData });\n  const sftp = suppliedSftp ?? new SftpService(config.sftp);\n', '  const store = suppliedStore ?? new MiraTvStore(config.db, { seedDemoData: config.seedDemoData });\n')
text=text.replace('  await recoverRuntimeState(store, sftp, config);', '  await recoverRuntimeState(store, config);')
text=text.replace('  const dependencies = { store, sftp, config };', '  const dependencies = { store, config };')
text=text.replace("service: 'mira-tv'", "service: 'mira-tv'")
text=text.replace("logger.info('MIRA-TV server started'", "logger.info('MIRA-TV server started'")
text=text.replace("logger.info('MIRA-TV server stopping'", "logger.info('MIRA-TV server stopping'")
server.write_text(text)

# Canonical MIRA-TV device/session identifiers.
for rel in ['src/services/session-service.js','src/services/device-session-service.js','src/web/admin-ui/public/js/player/player.js','src/web/admin-ui/public/player-sw.js']:
    p=ROOT/rel
    if p.exists():
        t=p.read_text().replace('menu_tv_', 'mira_tv_').replace('TV2:', 'MIRA:').replace('x-tv-menu-offline','x-mira-tv-offline')
        p.write_text(t)

# New default vector brand assets.
brand=ROOT/'src/web/admin-ui/public/brand'; brand.mkdir(parents=True, exist_ok=True)
(brand/'mira-tv-logo.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" role="img" aria-labelledby="t d"><title id="t">MIRA-TV</title><desc id="d">Экран с лучом сигнала и словесным знаком MIRA-TV</desc><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7C5CFF"/><stop offset=".52" stop-color="#00D5FF"/><stop offset="1" stop-color="#41F0B3"/></linearGradient></defs><rect x="18" y="25" width="190" height="120" rx="30" fill="#09111F" stroke="url(#g)" stroke-width="10"/><path d="M50 111 89 70l29 25 45-43" fill="none" stroke="url(#g)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><circle cx="167" cy="54" r="10" fill="#41F0B3"/><path d="M79 156h68" stroke="#8AA0BC" stroke-width="10" stroke-linecap="round"/><text x="245" y="111" font-family="Inter,Arial,sans-serif" font-size="82" font-weight="800" letter-spacing="2" fill="#EAF2FF">MIRA</text><text x="480" y="111" font-family="Inter,Arial,sans-serif" font-size="82" font-weight="300" fill="#7FDFFF">-TV</text></svg>''')
(brand/'mira-tv-mark.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7C5CFF"/><stop offset=".52" stop-color="#00D5FF"/><stop offset="1" stop-color="#41F0B3"/></linearGradient></defs><rect x="18" y="28" width="156" height="112" rx="30" fill="#09111F" stroke="url(#g)" stroke-width="9"/><path d="M43 108 75 75l24 21 38-39" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round"/><circle cx="141" cy="54" r="9" fill="#41F0B3"/><path d="M70 158h52" stroke="#8AA0BC" stroke-width="10" stroke-linecap="round"/></svg>''')
(brand/'mira-tv-splash.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><radialGradient id="a" cx="50%" cy="45%" r="75%"><stop stop-color="#162A49"/><stop offset=".55" stop-color="#091321"/><stop offset="1" stop-color="#040811"/></radialGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7C5CFF"/><stop offset=".5" stop-color="#00D5FF"/><stop offset="1" stop-color="#41F0B3"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#a)"/><g opacity=".18" fill="none" stroke="url(#g)"><circle cx="960" cy="520" r="330" stroke-width="3"/><circle cx="960" cy="520" r="440" stroke-width="2"/><circle cx="960" cy="520" r="560" stroke-width="1"/></g><g transform="translate(710 315) scale(2.6)"><rect x="18" y="28" width="156" height="112" rx="30" fill="#09111F" stroke="url(#g)" stroke-width="9"/><path d="M43 108 75 75l24 21 38-39" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round"/><circle cx="141" cy="54" r="9" fill="#41F0B3"/><path d="M70 158h52" stroke="#8AA0BC" stroke-width="10" stroke-linecap="round"/></g><text x="960" y="825" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="104" font-weight="800" letter-spacing="10" fill="#EDF6FF">MIRA-TV</text><text x="960" y="895" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="28" letter-spacing="8" fill="#7FDFFF">SMART DISPLAY PLATFORM</text></svg>''')

# Documentation rebuilt around the new product architecture.
(ROOT/'README.md').write_text('''# MIRA-TV\n\n**MIRA-TV 1.0.0.1** — система централизованного управления меню и контентом на телевизорах.\n\nОсновной принцип TV Player: **максимально экономить ресурсы телевизора**. Статические слои рендерятся только при изменении входных данных; сеть используется для синхронизации, а не для постоянной трансляции кадров.\n\n## Runtime\n- Node.js 24+ / Express 5\n- PostgreSQL 17\n- HTML5 / ES Modules / Canvas 2D / WAAPI\n- Service Worker + Cache Storage\n- IndexedDB для durable Player state (этап 1.0.0.1)\n- WebSocket для invalidation/control (этап 1.0.0.1)\n\nSFTP/SFTPGo отсутствуют. Телевизор получает состояние и медиа по HTTPS и рендерит локально.\n\n## Установка\n```bash\ncurl -fsSLo /tmp/mira-tv.sh https://raw.githubusercontent.com/ghost-raider-afk/MIRA-TV/main/mira-tv.sh && sudo bash /tmp/mira-tv.sh install\n```\n\nРабочий каталог: `/opt/MIRA-TV`. Launcher: `/usr/local/bin/mira-tv`.\n\nПодробности: `docs/ARCHITECTURE.md`, `docs/INSTALLATION.md`, `docs/TV-PLAYER-OFFLINE-FIRST.md`, `docs/RESOURCE-BUDGET.md`.\n''')
(ROOT/'docs/ARCHITECTURE.md').write_text('''# Архитектура MIRA-TV 1.0.0.1\n\n## Принцип\nСервер хранит authoritative state. TV Player хранит Last Known Good и ассеты локально, рендерит только изменившиеся слои и в нормальном состоянии простаивает.\n\n## Компоненты\n1. PostgreSQL — конфигурация, каталог, устройства, версии состояния и журналы.\n2. Node.js/Express — REST API, авторизация, delta/snapshot API и WebSocket control plane.\n3. TV Player — локальный renderer: Canvas 2D для статического меню, DOM media для изображений/видео, WAAPI/compositor для лёгких эффектов.\n4. IndexedDB — Last Known Good, component hashes, sync metadata и локальная очередь логов.\n5. Cache Storage — JS/CSS, изображения и видео.\n\n## Нет SFTP\nSFTPGo, SFTP credentials, каталоги доставки JPEG и отдельная публикация файлов удалены. Сохранённое состояние экрана является состоянием Player.\n\n## Render-on-change\nEnvironment, Menu, FX, Content, Entity, Brand и Announcement имеют независимое владение. Неизменившийся слой не перестраивается.\n''')
(ROOT/'docs/INSTALLATION.md').write_text('''# Установка MIRA-TV\n\n- Репозиторий: `ghost-raider-afk/MIRA-TV`\n- Каталог: `/opt/MIRA-TV`\n- Docker project: `mira-tv`\n- Контейнеры: `mira-tv`, `mira-tv-db`, `mira-tv-site-assets-init`\n- Volumes: `mira-tv-db-data`, `mira-tv-site-assets`\n- Proxy network: `mira-tv-proxy`\n\nУстановщик не создаёт SFTP сервисов и не открывает SFTP-порт. Все TV данные идут через HTTPS.\n''')
(ROOT/'docs/TV-PLAYER-OFFLINE-FIRST.md').write_text('''# Offline-first TV Player\n\nПри запуске Player сначала читает локальный Last Known Good и начинает показ до сетевой синхронизации. После восстановления связи отправляет накопленные логи пакетами и получает delta по компонентам. Если delta недоступна — получает полный snapshot. Новое состояние становится Last Known Good только после успешного render/asset validation.\n''')
(ROOT/'docs/RESOURCE-BUDGET.md').write_text('''# Бюджет ресурсов TV Player\n\nЖёсткое правило: при отсутствии изменений CPU/JS/сеть/диск должны быть близки к idle.\n\n- без постоянного re-render статических слоёв;\n- без 5-секундного polling при рабочем WebSocket;\n- fallback polling редкий;\n- видео декодируется штатным hardware decoder;\n- скрытые анимации ставятся на pause;\n- тяжёлые assets не хранятся в IndexedDB;\n- логирование пакетное и ограниченное;\n- reconnect — exponential backoff + jitter.\n''')
(ROOT/'docs/REALTIME-SYNC.md').write_text('''# Realtime и delta sync\n\nWebSocket сообщает только о необходимости синхронизации и управляющих событиях. REST остаётся authoritative transport для snapshot/delta. Это предотвращает дублирование бизнес-логики и упрощает offline recovery.\n''')
(ROOT/'docs/BRANDING.md').write_text('''# Branding\n\nКаноническое имя: **MIRA-TV**. В runtime, Docker, installer, путях и новых storage/cache keys не используется прежнее имя проекта.\n\nAssets: `brand/mira-tv-mark.svg`, `brand/mira-tv-logo.svg`, `brand/mira-tv-splash.svg`.\n''')

# Installer from scratch: new paths/names only, no old product identifiers.
new_installer.write_text(r'''#!/usr/bin/env bash
set -Eeuo pipefail
PROGRAM_NAME="mira-tv"
SCRIPT_VERSION="1.0.0.1"
INSTALL_DIR="/opt/MIRA-TV"
REPO_URL="https://github.com/ghost-raider-afk/MIRA-TV.git"
GITHUB_REPO="ghost-raider-afk/MIRA-TV"
GITHUB_API_URL="https://api.github.com/repos/$GITHUB_REPO"
COMPOSE_PROJECT="mira-tv"
APP_CONTAINER="mira-tv"
DB_CONTAINER="mira-tv-db"
PROXY_DIR="/opt/MIRA-TV-proxy"
PROXY_NETWORK="mira-tv-proxy"
LAUNCHER_PATH="/usr/local/bin/mira-tv"
log(){ printf '\n==> %s\n' "$*"; }
info(){ printf '    %s\n' "$*"; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require_root(){ [[ ${EUID:-$(id -u)} -eq 0 ]] || die 'Запустите через sudo.'; }
require_ubuntu(){ . /etc/os-release; [[ ${ID:-} == ubuntu ]] || die 'Поддерживается Ubuntu.'; }
install_docker(){ command -v docker >/dev/null && docker compose version >/dev/null 2>&1 && return; apt-get update; apt-get install -y ca-certificates curl git openssl dnsutils; curl -fsSL https://get.docker.com | sh; systemctl enable --now docker; }
gen(){ openssl rand -base64 48 | tr -dc 'A-Za-z0-9_@%+=-' | head -c "$1"; }
latest_tag(){ curl -fsSL -H 'Accept: application/vnd.github+json' "$GITHUB_API_URL/releases/latest" | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"(v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' | head -1; }
ensure_proxy(){
  mkdir -p "$PROXY_DIR"; docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || docker network create "$PROXY_NETWORK" >/dev/null
  cat >"$PROXY_DIR/compose.yaml" <<'YAML'
services:
  proxy:
    image: traefik:v3.5
    container_name: mira-tv-proxy
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    networks: [proxy]
networks:
  proxy:
    external: true
    name: mira-tv-proxy
YAML
}
write_env(){
  local domain="$1" admin="$2" pass="$3" dbpass secret
  dbpass="$(gen 32)"; secret="$(gen 64)"
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  sed -i \
    -e "s|^MIRA_TV_DOMAIN=.*|MIRA_TV_DOMAIN=$domain|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$dbpass|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|" \
    -e "s|^BOOTSTRAP_ADMIN_USERNAME=.*|BOOTSTRAP_ADMIN_USERNAME=$admin|" \
    -e "s|^BOOTSTRAP_ADMIN_PASSWORD=.*|BOOTSTRAP_ADMIN_PASSWORD=$pass|" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
}
install_app(){
  require_root; require_ubuntu; install_docker
  [[ ! -e "$INSTALL_DIR" ]] || die "$INSTALL_DIR уже существует. Используйте update."
  read -r -p 'HTTPS-домен MIRA-TV: ' domain; [[ -n "$domain" ]] || die 'Домен обязателен.'
  read -r -p 'Email для TLS: ' email; [[ -n "$email" ]] || die 'Email обязателен.'
  read -r -p 'Логин администратора: ' admin; [[ -n "$admin" ]] || die 'Логин обязателен.'
  pass="$(gen 16)"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  write_env "$domain" "$admin" "$pass"
  ensure_proxy; printf 'ACME_EMAIL=%s\n' "$email" >"$PROXY_DIR/.env"; mkdir -p "$PROXY_DIR/letsencrypt"; touch "$PROXY_DIR/letsencrypt/acme.json"; chmod 600 "$PROXY_DIR/letsencrypt/acme.json"
  docker compose -f "$PROXY_DIR/compose.yaml" --env-file "$PROXY_DIR/.env" up -d
  cd "$INSTALL_DIR"; docker compose -p "$COMPOSE_PROJECT" --env-file .env up -d --build --wait
  install -m 0755 "$INSTALL_DIR/mira-tv.sh" "$LAUNCHER_PATH"
  printf '\nMIRA-TV установлен.\nURL: https://%s\nАдминистратор: %s\nПароль: %s\n' "$domain" "$admin" "$pass"
}
update_app(){
  require_root; [[ -d "$INSTALL_DIR/.git" ]] || die 'MIRA-TV не установлен.'
  cd "$INSTALL_DIR"; git fetch --tags origin; tag="$(latest_tag)"; [[ -n "$tag" ]] || die 'Стабильный релиз не найден.'; git checkout -f "$tag"; docker compose -p "$COMPOSE_PROJECT" --env-file .env up -d --build --wait
}
status_app(){ cd "$INSTALL_DIR"; docker compose -p "$COMPOSE_PROJECT" --env-file .env ps; }
remove_app(){ require_root; cd "$INSTALL_DIR" 2>/dev/null || true; docker compose -p "$COMPOSE_PROJECT" --env-file .env down 2>/dev/null || true; rm -rf "$INSTALL_DIR"; rm -f "$LAUNCHER_PATH"; }
purge_app(){ require_root; cd "$INSTALL_DIR" 2>/dev/null || true; docker compose -p "$COMPOSE_PROJECT" --env-file .env down -v 2>/dev/null || true; rm -rf "$INSTALL_DIR" "$PROXY_DIR"; rm -f "$LAUNCHER_PATH"; }
case "${1:-menu}" in
 install) install_app;; update) update_app;; status) status_app;; remove) remove_app;; purge) purge_app;;
 check-update) printf 'Последний релиз: %s\n' "$(latest_tag)";;
 menu) printf 'MIRA-TV %s\n1) install  2) update  3) status  4) remove  5) purge\n' "$SCRIPT_VERSION";;
 *) die 'Команды: install | update | status | remove | purge | check-update';;
esac
''')
new_installer.chmod(0o755)

# Remove old public wording that explicitly describes obsolete delivery.
for p in ROOT.rglob('*'):
    if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES:
        try: t=p.read_text()
        except UnicodeDecodeError: continue
        t=t.replace('SFTPGo','').replace('SFTP-настройки','').replace('SFTP настройки','')
        p.write_text(t)

print('MIRA-TV 1.0.0.1 baseline refactor complete')
