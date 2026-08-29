# MIRA-TV

**MIRA-TV 1.0.0.1** — система централизованного управления меню и контентом на телевизорах.

Основной принцип TV Player: **максимально экономить ресурсы телевизора**. Статические слои рендерятся только при изменении входных данных; сеть используется для синхронизации, а не для постоянной трансляции кадров.

## Runtime
- Node.js 24+ / Express 5
- PostgreSQL 17
- HTML5 / ES Modules / Canvas 2D / WAAPI
- Service Worker + Cache Storage
- IndexedDB для durable Player state (этап 1.0.0.1)
- WebSocket для invalidation/control (этап 1.0.0.1)

файловый транспорт/ отсутствуют. Телевизор получает состояние и медиа по HTTPS и рендерит локально.

## Установка
```bash
curl -fsSLo /tmp/mira-tv.sh https://raw.githubusercontent.com/ghost-raider-afk/MIRA-TV/main/mira-tv.sh && sudo bash /tmp/mira-tv.sh install
```

Рабочий каталог: `/opt/MIRA-TV`. Launcher: `/usr/local/bin/mira-tv`.

Подробности: `docs/ARCHITECTURE.md`, `docs/INSTALLATION.md`, `docs/TV-PLAYER-OFFLINE-FIRST.md`, `docs/RESOURCE-BUDGET.md`.
