# Архитектура TV Menu 2.0 — 1.2.0

## Целевая TV Scene Architecture (утверждено 2026-08-28)

Текущий canonical menu model сохраняется, но TV Player получает отдельный renderer path, оптимизированный под длительное воспроизведение на Smart TV.

```text
Canonical Screen Model
        ↓
     MIRA Scene
        ↓
 ┌──────┴────────┐
 ↓               ↓
Flat Menu     Dynamic Scene Layers
Renderer          ↓
 ↓          GPU Scene Engine
Menu Surface      ↓
 └──────┬─────────┘
        ↓
   TV Compositor
```

### Flat TV Renderer

Статичная часть `Menu Scene` должна быть сведена в одну raster/canvas/texture surface. Количество строк, цен, разделов и декоративных SVG-узлов после flatten не должно увеличивать число постоянно анимируемых render targets.

Canonical DOM/SVG renderer остаётся источником геометрии и редакторского preview. Flat renderer использует тот же render model и не имеет отдельной бизнес-логики.

TV Player больше не использует row-by-row DOM/WASM motion. Обычное меню всегда идёт через Flat renderer:

- animation profile выключен → одна `Flat Menu Surface`;
- animation profile включён → `Flat Menu Surface` + один coarse compositor FX layer;
- DOM/WASM row motion остаётся только Studio/legacy capability и не входит в TV offline shell.

`GpuSceneRuntime` компилирует профиль в compositor-friendly WAAPI keyframes. Для постоянного menu motion разрешены только `transform` и `opacity`: runtime не держит собственный `requestAnimationFrame`, не пишет `filter` покадрово и не увеличивает число animated targets вместе с количеством строк меню.

### Dynamic Scene Layers

Движущиеся сущности не встраиваются обратно в Flat Menu Surface:

- `Brand`;
- `Actor / Object+`;
- `Promo`;
- `Content` (image/video/text);
- `Announcement`;
- `FX`;
- `Widget`.

Каждый слой имеет явный lifecycle и channel ownership. Один объект не должен одновременно управляться несколькими независимыми runtime.

### Scene Playlist

`Screen` получает последовательность сцен, а не только один вечный экран:

```text
Menu Scene
  ↓
Promo Scene (8 s)
  ↓
Menu Scene
  ↓
Object Story Scene (10 s)
  ↓
Menu Scene
```

Временная сцена может работать как overlay, split-layout или fullscreen replacement. Базовая Menu Scene остаётся canonical fallback и гарантированной точкой возврата.

### Object+ Actor model

Object+ развивается в Actor, а не в набор несвязанных CSS-анимаций. Минимальный actor lifecycle:

`enter → idle → action/focus → exit`

Story Engine компилирует Actor behavior в SceneProgram и использует общий master timeline.

### Screen Asset Cache

Player должен хранить локальный manifest и immutable assets: menu surface, backgrounds, images, video, actor assets, fonts и scene definitions. Сервер передаёт только изменившиеся версии. Offline player продолжает воспроизведение последнего полностью валидного manifest.

### Интеграции

Внешние ресторанные системы подключаются через adapter boundary:

```text
iiko / R_keeper / QuickResto / ...
                 ↓
          Catalog Adapter
                 ↓
          MIRA Catalog
                 ↓
        Screen / Menu Scene
```

Внешний источник не должен писать напрямую в renderer state конкретного телевизора.


## 1. Доменная модель

Runtime-модель приложения намеренно упрощена до одной цепочки:

```text
Location
└── Screen
    ├── ScreenDraft
    │   ├── rows
    │   └── settings
    └── Publication state
```

### Location

Торговая точка хранит собственные реквизиты и при необходимости SFTP-привязку. Удаление точки каскадно удаляет её мониторы и черновики, но SFTP-доступ перед удалением должен быть явно отключён.

### Screen

`Screen` — самостоятельный монитор. Он хранит идентичность и состояние доставки:
- `location_id`;
- локальный номер внутри точки;
- `name`;
- `resolution`;
- `status`;
- `active`;
- `delivery_filename`;
- prepared/publishing/published SHA-256 и revision;
- timestamps.

Имя файла публикации определяется номером монитора внутри торговой точки (`monitor-1.jpg`, `monitor-2.jpg`), а не глобальным PostgreSQL ID.

### ScreenDraft

`screen_drafts` — единственный источник редактируемого содержимого монитора:
- `rows_json`;
- `settings_json`;
- `revision`;
- `updated_at`.

`revision` используется для optimistic locking. Сохранение с устаревшей revision отклоняется с конфликтом.

## 2. Настройки монитора

`settings_json` содержит canonical presentation state:

```text
background_color
background_image_url
accent_color
text_color
font_scale_percent
font_family
table_x
table_y
table_width_px
table_height_px
```

Renderer, preview и финальный JPEG используют эти же значения. Отдельного layout слоя для JPEG нет.

Фоновое изображение хранится в:

```text
/site-assets/screens/background-<uuid>.<ext>
```

Разрешены PNG, JPEG и WebP. Максимальный размер берётся только из:

```env
SCREEN_BACKGROUND_MAX_BYTES
```

Релизное значение 1.2.0 — `20971520` байт.

## 3. Отказ от отдельного слоя оформления

В runtime нет отдельной сущности для переиспользуемого оформления. Оформление принадлежит монитору напрямую.

Для обновления старых установок существует только одноразовая migration boundary:

```text
legacy assigned presentation
        ↓ materialize
screen_drafts.rows_json/settings_json
        ↓
drop obsolete foreign key/column/table
```

Этот compatibility-код не участвует в обычных API/UI операциях после старта обновлённой базы.

## 4. Клонирование

### Monitor clone

Копируются:
- rows;
- settings;
- resolution;
- active state.

Не копируются:
- screen ID;
- prepared asset;
- publication pending state;
- published SHA/revision/timestamp;
- delivery filename identity.

Новая запись получает собственную revision и lifecycle публикации.

### Location clone

Копируются:
- name/address задаются пользователем для новой точки;
- все мониторы;
- rows/settings каждого монитора.

Не копируются:
- location ID;
- SFTP directory binding;
- SFTP username/password;
- publication state мониторов.

## 5. Frontend

### Persistent application shell

После авторизации frontend работает как одно постоянное приложение. Полный HTML document не перезагружается при переходах между основным меню, подменю и рабочими разделами.

Постоянное ядро:
- `core/router.js` — History API, route cache, prefetch, mount/unmount lifecycle;
- `components/sidebar.js` — основное меню;
- `components/context-panel.js` — подменю текущего раздела;
- `components/header.js` — заголовок, профиль, уведомления, тема;
- `components/shell.js` — связывает постоянные части shell;
- `core/navigation.js` — логическая карта разделов.

Переход выполняется так:

```text
click internal route
      ↓
core/router.js
      ↓
History API (pushState/popstate)
      ↓
replace only .main-content contents
      ↓
refresh active shell state
      ↓
mount page module
```

Sidebar, context panel, header, notification polling и загруженный authenticated context остаются в памяти. На каждой странице больше не выполняется повторная загрузка shell и повторный bootstrap пользователя.

HTML-файлы разделов сохраняются как direct-entry/fallback route documents и как лёгкие view templates. Это позволяет открыть `/screens.html`, `/catalog.html`, `/settings.html` или editor URL напрямую после F5, но обычная навигация внутри приложения использует client-side router.

Основные route documents предварительно загружаются в фоне и после первого получения хранятся в памяти текущей вкладки. JS-модули также повторно не загружаются благодаря native ES module cache.

Каждый page module может вернуть lifecycle:

```text
canLeave()  — разрешить/запретить переход
dispose()   — удалить глобальные listeners/resources
```

Редактор монитора использует lifecycle для защиты несохранённых изменений и снимает свои `keydown`/`beforeunload` listeners при уходе со страницы.

Страница входа остаётся отдельной security boundary и не входит в authenticated SPA shell.

### Compact geometry

Компактная геометрия задаётся базовыми tokens, а не page-specific override слоями:
- rail: 64 px;
- context: 250 px;
- control height: 32 px;
- уменьшенные page/card gaps и paddings.

### Catalog

В подменю `Каталог` один пункт — `Продукция`. На самой странице остаются оба рабочих блока: продукция и тара. Отдельный пункт подменю `Тара` отсутствует.

### Monitor editor

`screen-editor.html` построен вокруг sticky command bar:
- Monitor;
- Table;
- Appearance;
- справа `Сохранить → Опубликовать`.

SFTP-путь отображается рядом с идентичностью точки/монитора. Отдельной вкладки `Доставка` нет.

Действия добавления строк (`+ Раздел`, `+ Продукция`, `+ Тара`) находятся в верхней части блока содержимого меню. Основное рабочее пространство содержит compact semantic row editor и preview.

## 6. Renderer

Canonical renderer:

```text
Editor State
   ↓
buildRenderModel
   ↓
buildDisplayLines
   ↓
buildRenderLayout
   ↓
buildTableSvg
   ├── browser preview
   └── final JPEG canvas pipeline
```

TV Menu 1 reference defaults для 1920×1080:
- table X = 56;
- table Y = 15;
- width = 1374;
- height = 925.

Каждый монитор может менять эти значения. Цена остаётся правовыровненной внутри текущей ширины таблицы.

## 7. PostgreSQL

Критичные свойства:
- FK `screens.location_id → locations.id ON DELETE CASCADE`;
- PK `screen_drafts.screen_id → screens.id ON DELETE CASCADE`;
- unique `(location_id, name)`;
- transaction wrapper для multi-step mutations;
- optimistic locking по `screen_drafts.revision`;
- PostgreSQL `BIGINT` revision нормализуется на DB boundary перед сравнением в JavaScript.

## 8. JPEG consistency

Prepared JPEG связан с:
- asset key;
- SHA-256;
- byte size;
- draft revision.

Изменение черновика инвалидирует prepared asset. Публикация проверяет SHA и revision перед внешней SFTP-операцией.

## 9. SFTP publication

Публикация выполняется через staging:
1. validate/decode JPEG;
2. stage file;
3. record prepared SHA/revision;
4. mark publication started inside DB transaction;
5. atomically publish through SFTP service;
6. finalize DB state;
7. cleanup staging.

Startup reconciliation восстанавливает незавершённые операции. HTTP calls к SFTPGo ограничены timeout из `.env`.

## 10. Site settings

`site_settings` хранит:
- application name;
- accent;
- logo/favicon names;
- timezone/date format;
- dashboard refresh;
- default monitor resolution;
- `signin_logo_size` от 1 до 7.

Уровень `1` — минимальный исходный размер логотипа страницы входа.

## 11. Runtime configuration

`.env` — единственный источник изменяемых runtime limits/security settings. В частности:
- HTTP/body limits;
- session/login limits;
- password limits;
- PostgreSQL pool/timeouts;
- SFTP timeout/staging age;
- screen resolution limits;
- image pixel limits;
- site asset limits;
- monitor background limit;
- Docker memory/PID limits для приложения, PostgreSQL и SFTPGo.

CPU-квоты контейнеров не задаются. Ключи `*_CPU_LIMIT` считаются устаревшими и удаляются установщиком из существующего `.env`; ограничения памяти и количества процессов остаются обязательной частью hardening.

Код не должен иметь второй production-default для значения, которое объявлено в `.env`.

## 12. Frontend caching

HTML direct-entry documents возвращаются с `Cache-Control: no-store`, но сервер не должен отправлять `Clear-Site-Data: "cache"` при обычной навигации. JS/CSS используют revalidation (`no-cache, must-revalidate`).

Client-side router дополнительно держит view templates в памяти текущей вкладки. Поэтому после запуска приложения переходы по уже загруженным разделам не требуют повторного HTTP-запроса за HTML.

## 13. Release gates

Merge разрешён только после:
- `node-check`;
- `clean-install-smoke`;
- `browser-visual`.

Browser checks обязаны тестировать:
- реальные DOM/SVG метрики редактора;
- отсутствие полного document reload при переходах меню/подменю;
- History API back/forward;
- login presentation без неправильного первого кадра.
