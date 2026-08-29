# Changelog

## [1.0.0.1] - 2026-08-29

### MIRA-TV
- Новый самостоятельный репозиторий и новая нумерация продукта.
- Полный ребрендинг runtime, Docker, путей, cache/storage keys и installer в MIRA-TV.
-  и весь файловый транспорт/JPEG delivery pipeline удалены: телевизоры работают через MIRA-TV Player по HTTPS.
- Архитектурный приоритет TV Player: минимальный расход CPU, GPU, RAM, сети и диска.
- Подготовлена база для offline-first запуска, локального Last Known Good, WebSocket invalidation, delta sync и пакетной отправки логов.
