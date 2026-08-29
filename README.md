# MIRA-TV

**MIRA-TV 1.0.0** — система централизованного управления меню и медиаконтентом на телевизорах.

Главный принцип TV Player: **максимально экономить ресурсы телевизора**. Статические слои рендерятся только при изменении входных данных; сеть используется для синхронизации состояния и медиа, а не для постоянной передачи кадров.

## Технологии

- Node.js 24+ / Express 5
- PostgreSQL 17
- HTML5 / ES Modules / Canvas 2D / WAAPI
- Service Worker + Cache Storage
- IndexedDB для Last Known Good, sync metadata и локального журнала Player
- WebSocket как control/invalidation channel с редким REST fallback
- HTTPS REST для snapshot/delta и медиа
- Docker Compose для всего серверного runtime

Отдельного файлового транспорта нет. Телевизор получает состояние и медиа по HTTPS и рендерит сцену локально.

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
- `docs/ARCHITECTURE.md` — актуальная архитектура MIRA-TV.
- `docs/TV-PLAYER-OFFLINE-FIRST.md` — Last Known Good, локальное состояние и восстановление связи.
- `docs/REALTIME-SYNC.md` — WebSocket + REST delta/snapshot.
- `docs/RESOURCE-BUDGET.md` — обязательные правила экономии ресурсов ТВ.
- `docs/BRANDING.md` — бренд MIRA-TV и визуальные assets.
