# Changelog

## [1.0.0] - 2026-08-29

### MIRA-TV baseline

- Новый самостоятельный репозиторий `ghost-raider-afk/MIRA-TV` и новая продуктовая нумерация с версии 1.0.0.
- Полный ребрендинг runtime, Docker, путей установки, cache/storage namespaces, QR namespace и installer в MIRA-TV.
- Удалён отдельный файловый transport/JPEG delivery pipeline; TV Player получает состояние и media assets через HTTPS.
- Весь серверный runtime объединён в один Docker Compose project `mira-tv`: proxy, app, PostgreSQL и init service.
- Стандартное управление после установки выполняется из `/opt/MIRA-TV` обычными командами `docker compose` без дополнительных `-p`, `-f` и `--env-file`.
- TV Player развивается как offline-first: Last Known Good, IndexedDB durable state, Cache Storage, WebSocket invalidation/control, REST delta/snapshot и bounded локальный журнал.
- Архитектурный приоритет Player: минимальный расход CPU, GPU, RAM, сети, storage I/O и энергии телевизора.
- Статические слои используют render-on-change; независимые слои не должны пересобираться без изменения собственных входных данных.
- Документация установки, архитектуры, realtime sync, offline-first и resource budget актуализирована под MIRA-TV 1.0.0.
