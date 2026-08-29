# Архитектура MIRA-TV 1.0.0

## Главный принцип

TV Player должен максимально экономить ресурсы телевизора. Если входные данные не изменились, Player не должен повторно перестраивать статические слои, постоянно опрашивать сервер или выполнять ненужную работу на CPU/GPU.

Сервер хранит authoritative state. Телевизор хранит Last Known Good и необходимые assets локально, начинает показ из локального состояния и синхронизируется при появлении связи.

## Сервер

### PostgreSQL

Хранит конфигурацию, каталог, торговые точки, экраны, устройства, настройки сцен, Device Sessions, серверный журнал событий и принятые диагностические события Player.

Player protocol не требует отдельной бесконечной таблицы delta history. Точная revision текущего Player state вычисляется детерминированно из component hashes.

### Node.js / Express

Отвечает за:

- REST API;
- авторизацию администраторов и TV Device Sessions;
- построение authoritative Player state;
- stateless component delta по известным TV hashes;
- WebSocket control/invalidation channel;
- загрузку и безопасную выдачу изображений/видео;
- приём идемпотентных пакетных диагностических логов TV Player.

## TV Player

Player работает локально в браузере телевизора:

- Canvas 2D / bitmap — статическое меню;
- DOM media — изображения и видео;
- WAAPI/compositor — только необходимые лёгкие `transform/opacity` эффекты;
- Service Worker + Cache Storage — shell и тяжёлые media assets;
- IndexedDB — Last Known Good, его component hashes и bounded локальный журнал событий.

Видео декодируется штатным browser/hardware decoder. Player не выполняет программное покадровое декодирование через Canvas и не копирует целый cached video в JavaScript память ради Range-запросов.

`player.js` является владельцем глобального lifecycle Player: active/inactive и page visible/hidden. Отдельные runtimes не должны самостоятельно определять или дублировать глобальное состояние видимости.

## Player state и delta

Authoritative state разделён на независимые компоненты:

- `screen`;
- `menu`;
- `animation`;
- `environment`;
- `scene_playlist`;
- `entity`;
- `brand`;
- `announcement`;
- `runtime`.

Для каждого компонента сервер вычисляет SHA-256 hash. Top-level `revision` — digest `schema_version + hashes`; это идентификатор точного состояния, а не монотонный счётчик.

TV отправляет свои известные hashes в `/api/device/player-delta`. Сервер возвращает только компоненты, hashes которых отличаются. Если schema несовместима, возвращается полный snapshot.

Благодаря этому WebSocket не требует replay: даже после долгого offline TV сравнивается непосредственно с текущим authoritative state.

## Render-on-change

Слои Environment, Menu, FX, Content, Entity, Brand и Announcement имеют независимое владение. Изменение одного слоя не должно заставлять перестраивать остальные.

Статический слой рендерится при старте или изменении его входных данных и затем остаётся неизменным до следующего изменения соответствующего component hash.

Unchanged delta не заменяет готовый Canvas. Menu-only delta не пересоздаёт неизменённый Entity media node.

Entity runtime событийный: он не наблюдает весь DOM через `MutationObserver` и не использует `requestAnimationFrame` для поиска изменений. Новый Entity binding запускается только после явного события владельца Entity layer.

## Visibility lifecycle

Работа, пиксели которой не видны, должна быть остановлена:

- при скрытии самого Player базовый Entity video ставится на pause;
- Entity WAAPI ставится на pause при inactive Player, hidden page и fullscreen Playlist;
- GPU menu effects ставятся на pause при inactive Player, hidden page и fullscreen Playlist;
- CSS-анимации базовых Environment/Brand/Announcement слоёв получают `animation-play-state: paused` при inactive/hidden состоянии;
- fullscreen временная сцена не останавливается этим правилом, потому что именно она в этот момент видима.

## Offline-first запуск

1. Player загружает локальный shell.
2. Читает Last Known Good из IndexedDB.
3. Немедленно начинает показ последнего подтверждённого рабочего состояния.
4. Параллельно проверяет Device Session и выполняет REST reconciliation.
5. Подключает authenticated WebSocket и делает ещё одну reconciliation для закрытия race-window подключения.
6. После связи отправляет накопленные логи bounded batch-ами.
7. При изменении запрашивает component delta по известным hashes.
8. Подготавливает критические изменившиеся assets.
9. Применяет только dirty layers.
10. Только после успешного render сохраняет candidate как новый Last Known Good.
11. После фиксации LKG передаёт Service Worker manifest всех активных assets.
12. Service Worker последовательно гарантирует наличие активных assets в Cache Storage.
13. Только после успешного ensure Service Worker удаляет больше не используемые cached assets.

Если critical asset не готов, предыдущий LKG остаётся и в IndexedDB, и на экране.

## Realtime sync

WebSocket используется как дешёвый канал invalidation, а не как транспорт состояния или media. После успешного DB commit сервер отправляет адресным TV маленькое `context.changed`. Актуальное состояние или delta Player получает через REST.

Если WebSocket недоступен, включается редкий fallback polling с интервалом из `.env`. После восстановления WebSocket fallback выключается. Reconnect использует exponential backoff + jitter и не сдвигает независимый fallback timer.

Server heartbeat — native WebSocket ping раз в 60 секунд без application JSON и без записи PostgreSQL.

Пустой локальный журнал не должен повторно сканироваться при каждом unchanged fallback. После успешного опустошения очередь помечается чистой в памяти и IndexedDB не открывается снова до появления нового события.

## Media cache

Фоны и Entity assets имеют уникальные immutable URL при каждой загрузке. Cache-first поэтому безопасен: новый asset не делит URL со старым содержимым.

Service Worker — единственный владелец прогрева LKG media-cache. Page runtime не дублирует скачивание Entity/background после фиксации состояния.

Активные assets обеспечиваются последовательно, а не параллельным скачиванием нескольких тяжёлых файлов. Если ensure хотя бы одного активного asset завершается ошибкой, старый cache не очищается.

Полный cached MP4/WebM возвращается браузеру как исходный streaming `200 Response`. Service Worker не создаёт `ArrayBuffer` всего ролика и не режет byte ranges в JavaScript. Uncached Range запрос обслуживается сервером нативно, а частичный `206` не маскируется под полный cached asset.

## Docker runtime

Вся серверная часть MIRA-TV управляется одним `compose.yaml` и одним Compose project `mira-tv`:

- `proxy` — HTTPS reverse proxy;
- `app` — Node.js application;
- `db` — PostgreSQL;
- `site-assets-init` — одноразовая подготовка volume.

Все сети и volumes создаются самим Docker Compose. Внешняя ручная инициализация Docker network не требуется.

## Удалённые подсистемы

В MIRA-TV нет отдельного файлового транспорта, отдельной публикации JPEG на файловый сервер и дополнительного файлового сервиса. TV Player получает данные и media assets через HTTPS и хранит нужное локально.
