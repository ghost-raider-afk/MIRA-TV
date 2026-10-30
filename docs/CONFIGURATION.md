# Конфигурация MIRA-TV

Установщик создаёт `/opt/MIRA-TV/.env`. Его пример и актуальный перечень значений — [`.env.example`](../.env.example). Изменения вносятся только при понятной необходимости.

**Не публикуйте реальный `.env`:** в нём находятся пароли PostgreSQL, начальный доступ администратора и SESSION_SECRET. Для планового обновления используйте установщик, который добавляет недостающие настройки, сохраняя существующие секреты.

## Домен и безопасность

| Переменная | Назначение / пример |
| --- | --- |
| `MIRA_TV_DOMAIN` | DNS-имя без протокола, например `menu.example.com` |
| `MIRA_TV_ACME_EMAIL` | Email для сертификата Let's Encrypt |
| `SESSION_SECRET` | Секрет сессий, создаётся установщиком |
| `SECURE_COOKIES=true` | Защищённые cookie для HTTPS |
| `SESSION_TTL_HOURS=12` | Срок веб-сессии |
| `LOGIN_MAX_ATTEMPTS=8` | Лимит неудачных логинов |
| `LOGIN_IP_MAX_ATTEMPTS=32` | Лимит по IP |
| `LOGIN_WINDOW_MINUTES=15` | Интервал защиты входа |

Сервер публично обслуживает только `80/443`. PostgreSQL наружу не выставляется.

## PostgreSQL и первый администратор

`POSTGRES_HOST=db`, `POSTGRES_PORT=5432`, `POSTGRES_DB=mira_tv`, `POSTGRES_USER=mira_tv` и `POSTGRES_PASSWORD` определяют доступ к базе. Обычный предел пула: `POSTGRES_POOL_MAX=5`. Не меняйте пароль существующей базы простой заменой записи в `.env`.

`BOOTSTRAP_ADMIN_USERNAME` и `BOOTSTRAP_ADMIN_PASSWORD` задают начального администратора. `PASSWORD_MIN_LENGTH=10`, `PASSWORD_MAX_LENGTH=32` и `GENERATED_PASSWORD_LENGTH=10` — правила паролей/генерации. Для сброса действующего администратора используйте `mira-tv reset-admin-password`.

## Телевизоры и Local-first

| Переменная | Значение в текущем шаблоне |
| --- | --- |
| `DEVICE_ACTIVATION_TTL_MINUTES` | `2` — срок временного кода |
| `DEVICE_ACTIVATION_POLL_SECONDS` | `2` — опрос только при подключении |
| `DEVICE_SESSION_TTL_DAYS` | `30` — TTL TV-сессии, не срока хранения LKG |
| `DEVICE_HEARTBEAT_WRITE_SECONDS` | `60` |
| `PLAYER_FALLBACK_POLL_SECONDS` | `60` — резервный опрос |
| `PLAYER_LOG_BATCH_SIZE` | `100` |
| `PLAYER_LOG_LOCAL_MAX_ENTRIES` | `5000` |
| `PLAYER_LOG_LOCAL_MAX_BYTES` | `10485760` |
| `PLAYER_METRICS_INTERVAL_SECONDS` | `60` |
| `PLAYER_METRICS_RETENTION_DAYS` | `31` |
| `TV_PREVIEW_CAPTURE_SECONDS` | `30` |
| `TV_PREVIEW_MAX_BYTES` | `262144` |

TV-сессия и локальный срок хранения сцены — разные сущности. При изменении TTL не очищайте браузерное LKG.

## Погода

В текущем `.env.example`:

~~~text
WEATHER_PROVIDER_ORDER=met-no,open-meteo
MET_NO_WEATHER_BASE_URL=https://api.met.no
WEATHER_PROVIDER_BASE_URL=https://api.open-meteo.com
WEATHER_GEOCODING_BASE_URL=https://geocoding-api.open-meteo.com
WEATHER_CACHE_SECONDS=600
WEATHER_FETCH_TIMEOUT_MS=5000
WEATHER_PROVIDER_COOLDOWN_SECONDS=300
WEATHER_COLLECTOR_INTERVAL_SECONDS=60
~~~

Погода обновляется сервером, который реализует fallback и LKG. TV не должен напрямую обращаться к внешнему погодному API.

## Данные, медиа и ограничения

- `SCREEN_MAX_WIDTH=1920`, `SCREEN_MAX_HEIGHT=1080` — максимальные размеры сцены.
- `SCREEN_SOURCE_MAX_BYTES=12582912`, `MENU_DRAFT_MAX_BYTES=49152` — пределы данных экрана/меню.
- `SITE_LOGO_MAX_BYTES=2097152`, `SITE_FAVICON_MAX_BYTES=524288` — файлы бренда.
- `SCREEN_BACKGROUND_MAX_BYTES=20971520` — фон.
- `SCENE_ASSET_MAX_BYTES=104857600` — asset сцены (название переменной — именно `SCENE_ASSET_MAX_BYTES`, а не `ENTITY_ASSET_MAX_BYTES`).
- `SITE_ASSETS_ROOT=/srv/mira-tv/site-assets` — каталог volume внутри контейнера.
- `IMAGE_MAX_PIXELS=40000000` — ограничение обработки изображений.
- `EVENT_JOURNAL_RETENTION_DAYS=30`, `EVENT_JOURNAL_MAX_ENTRIES=5000` — события.
- `SEED_DEMO_DATA=false` — демонстрационные данные отключены.

Существующий путь к asset — это не разрешение на видеорендеринг: действующий TV runtime работает со статическими элементами.

## Ограничения Docker

По умолчанию: `APP_MEMORY_LIMIT=768m`, `DB_MEMORY_LIMIT=1g`, `PROXY_MEMORY_LIMIT=256m`; `APP_PIDS_LIMIT=256`, `DB_PIDS_LIMIT=256`, `PROXY_PIDS_LIMIT=128`. Проверяйте реальные ресурсы VPS перед изменением лимитов.

## Применение настроек

~~~bash
cd /opt/MIRA-TV
sudo docker compose config --quiet
sudo docker compose up -d
~~~

Проверяйте `docker compose ps` и `/readyz` после изменения. Меняйте секреты только по специальной процедуре с учётом действующих TV-сессий и БД: произвольная ротация может лишить пользователей доступа.

См. [INSTALLATION.md](INSTALLATION.md) и [.env.example](../.env.example).
