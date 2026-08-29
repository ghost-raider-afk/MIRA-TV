# MIRA-TV

**MIRA-TV 1.0.0** — система централизованного управления меню и медиаконтентом на телевизорах.

Главный принцип TV Player: **максимально экономить ресурсы телевизора**. Статические слои рендерятся только при изменении входных данных; сеть используется для синхронизации состояния и медиа, а не для постоянной передачи кадров.

## Структура MIRA-TV 1.0.0

Система разделена на четыре владельца состояния:

- **PostgreSQL** — единственный authoritative state каталога, экранов, привязок и сцен;
- **Node.js / Express** — REST API, авторизация, stateless component delta и WebSocket invalidation;
- **IndexedDB на ТВ** — Last Known Good и bounded локальный диагностический журнал;
- **Service Worker + Cache Storage** — offline shell и тяжёлые media assets.

TV Player не зеркалирует PostgreSQL и не хранит server delta history. Сервер вычисляет hashes независимых компонентов (`screen`, `menu`, `animation`, `environment`, `scene_playlist`, `entity`, `brand`, `announcement`, `runtime`), а TV при синхронизации получает только отличающиеся компоненты.

После успешного render candidate он становится новым Last Known Good. Только затем Service Worker получает manifest активных assets, последовательно обеспечивает их наличие в Cache Storage и после успешного ensure удаляет больше не используемые файлы.

WebSocket передаёт только лёгкие invalidation-события. При рабочем WebSocket постоянного REST polling нет; при его потере включается редкий fallback.

Невидимые Entity/GPU/CSS animations и video приостанавливаются. Entity runtime событийный и не использует постоянный `MutationObserver` или `requestAnimationFrame`. Cached video не копируется целиком в JavaScript память для Range-обработки.

## Технологии

- Node.js 24+ / Express 5
- PostgreSQL 17
- HTML5 / ES Modules / Canvas 2D / WAAPI
- Service Worker + Cache Storage
- IndexedDB для Last Known Good и локального журнала Player
- WebSocket как control/invalidation channel с редким REST fallback
- HTTPS REST для component delta/snapshot и media
- Docker Compose для всего серверного runtime

Отдельного файлового транспорта нет. Телевизор получает состояние и media по HTTPS и рендерит сцену локально.

## Установка

```bash
curl -fsSLo /tmp/mira-tv.sh https://raw.githubusercontent.com/ghost-raider-afk/MIRA-TV/main/mira-tv.sh
sudo bash /tmp/mira-tv.sh install
```

Рабочий каталог после установки: `/opt/MIRA-TV`.

## Управление Docker

Вся MIRA-TV — один Compose-проект. Из `/opt/MIRA-TV` используются обычные команды Docker Compose без дополнительных `-p`, `-f` и `--env-file`:

```bash
cd /opt/MIRA-TV
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs -f
sudo docker compose restart
sudo docker compose stop
sudo docker compose start
sudo docker compose down
```

После обновления исходного кода или Dockerfile:

```bash
sudo docker compose up -d --build --wait
```

Удаление volumes выполняется только явно:

```bash
sudo docker compose down -v
```

## Документация

- `docs/INSTALLATION.md` — установка, обновление, Docker Compose и удаление.
- `docs/ARCHITECTURE.md` — источник истины по структуре MIRA-TV 1.0.0.
- `docs/TV-PLAYER-OFFLINE-FIRST.md` — Last Known Good, локальное состояние, media-cache и восстановление связи.
- `docs/REALTIME-SYNC.md` — WebSocket + stateless REST component delta.
- `docs/RESOURCE-BUDGET.md` — обязательные правила и CI-инварианты экономии ресурсов ТВ.
- `docs/BRANDING.md` — бренд MIRA-TV и визуальные assets.
