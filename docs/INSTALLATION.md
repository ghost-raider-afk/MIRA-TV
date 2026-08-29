# Установка MIRA-TV

- Репозиторий: `ghost-raider-afk/MIRA-TV`
- Каталог: `/opt/MIRA-TV`
- Docker project: `mira-tv`
- Контейнеры: `mira-tv`, `mira-tv-db`, `mira-tv-site-assets-init`
- Volumes: `mira-tv-db-data`, `mira-tv-site-assets`
- Proxy network: `mira-tv-proxy`

Установщик не создаёт отдельный файловый transport service и не открывает дополнительный transport-порт. Все TV данные идут через HTTPS.
