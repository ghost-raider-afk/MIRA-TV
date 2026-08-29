# Целевая модель данных

Этот документ описывает доменные сущности новой архитектуры и отдельно отмечает текущую реализацию ветки `prototype`.

## Scene domain — текущий prototype

Для UX-репетиции уже используется минимальная серверная таблица:

```text
scenes
```

Она хранит:

```text
id
name
schema_version
scene_json JSONB
revision
created_by
updated_by
created_at
updated_at
```

Полный изменяемый Draft Scene хранится одним JSONB-документом. Это сознательно уменьшает количество мелких записей при drag/resize и позволяет менять Scene Schema, пока UX ещё отрабатывается.

`revision` — технический optimistic-concurrency counter. Он не является опубликованной Scene Revision.

## Scene domain — целевая публикационная модель

После стабилизации UX и Scene Schema текущий Draft-контракт должен эволюционировать к модели, где редактируемая Scene отделена от опубликованных неизменяемых снимков:

```text
scenes
scene_drafts
scene_revisions
scene_revision_assets
```

При необходимости отдельные индексы или нормализованные таблицы для слайдов/элементов добавляются только если это реально требуется запросами сервера. Нельзя дробить Draft на множество таблиц только ради «нормализации», если это ухудшает атомарность сохранения и усложняет Editor.

`scene_revisions` — опубликованные неизменяемые снимки для назначения на TV и rollback.

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

Схема должна оставаться версионированной. Сервер валидирует Scene до записи и сам рассчитывает канонические размеры Canvas по числу TV, а не доверяет присланным `canvas_width/canvas_height`.

## Конкурентное редактирование Draft

Каждый успешный update увеличивает серверный `revision`.

Клиент отправляет revision, на основе которого редактировал Scene. Update выполняется только если он совпадает с текущим значением в PostgreSQL.

Если revision устарел, сервер отвечает конфликтом вместо тихого перезаписывания данных.

## Asset references

Удаление медиа должно основываться на явных ссылках, а не на предположении по URL. Файл физически удаляется только когда на него больше нет рабочих ссылок и выполнены правила безопасной очистки.

## Persistent state

PostgreSQL, Asset Storage и конфигурация, необходимая для доступа к этим данным, составляют единое постоянное состояние приложения. Update/rollback/remove не должны сохранять одну часть и уничтожать необходимую для неё другую.
