# Архитектура MIRA-TV 1.0.0.1

## Принцип
Сервер хранит authoritative state. TV Player хранит Last Known Good и ассеты локально, рендерит только изменившиеся слои и в нормальном состоянии простаивает.

## Компоненты
1. PostgreSQL — конфигурация, каталог, устройства, версии состояния и журналы.
2. Node.js/Express — REST API, авторизация, delta/snapshot API и WebSocket control plane.
3. TV Player — локальный renderer: Canvas 2D для статического меню, DOM media для изображений/видео, WAAPI/compositor для лёгких эффектов.
4. IndexedDB — Last Known Good, component hashes, sync metadata и локальная очередь логов.
5. Cache Storage — JS/CSS, изображения и видео.

## Нет файловый транспорт
, файловый транспорт credentials, каталоги доставки JPEG и отдельная публикация файлов удалены. Сохранённое состояние экрана является состоянием Player.

## Render-on-change
Environment, Menu, FX, Content, Entity, Brand и Announcement имеют независимое владение. Неизменившийся слой не перестраивается.
