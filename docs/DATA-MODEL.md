# Целевая модель данных

Этот документ описывает доменные сущности новой архитектуры. Это не готовая SQL-миграция. Финальная схема PostgreSQL должна создаваться только после утверждения UX и Scene Schema.

## Scene domain

```text
scenes
scene_drafts
scene_revisions
scene_slides
scene_elements
scene_revision_assets
```

`scene_drafts` — изменяемая рабочая версия. `scene_revisions` — опубликованные неизменяемые снимки, если после UX-репетиции будет утверждено версионирование публикаций.

## Media domain

```text
media_assets
```

Metadata включает тип, MIME, размеры, длительность, размер файла, hash и служебные производные ресурсы.

Файлы не хранятся как BLOB в PostgreSQL.

## Catalog domain

```text
catalog_categories
catalog_items
catalog_price_variants
```

Основные универсальные поля остаются реляционными. Специализированные свойства категории могут храниться в проверяемом JSONB.

## Operations domain

```text
locations
display_groups
display_slots
devices
device_bindings
assignments
playlists
playlist_items
schedules
schedule_rules
```

Физический Device отделён от логического Display Slot, чтобы заменить TV без перестройки дизайна и назначения.

## Runtime и telemetry

```text
player_sessions
player_telemetry
activity_events
```

Конкретное объединение с существующими таблицами определяется отдельной миграцией после утверждения новой модели.

## Scene Element

Минимальный логический контракт:

```json
{
  "id": "element-id",
  "type": "text",
  "x": 100,
  "y": 100,
  "width": 800,
  "height": 160,
  "z_index": 2,
  "opacity": 1,
  "visible": true,
  "locked": false,
  "style": {},
  "data_binding": null,
  "effects": {},
  "animation": {}
}
```

Схема должна быть версионирована до первой рабочей миграции.

## Asset references

Удаление медиа должно основываться на явных ссылках, а не на предположении по URL. Файл физически удаляется только когда на него больше нет рабочих ссылок и выполнены правила безопасной очистки.

## Persistent state

PostgreSQL, Asset Storage и конфигурация, необходимая для доступа к этим данным, составляют единое постоянное состояние приложения. Update/rollback/remove не должны сохранять одну часть и уничтожать необходимую для неё другую.
