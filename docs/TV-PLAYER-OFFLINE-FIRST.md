# MIRA-TV TV Player: offline-first

## Цель

Телевизор должен начинать показ максимально быстро и не зависеть от доступности сервера для продолжения уже подтверждённой трансляции.

## Владельцы состояния

**IndexedDB** хранит только durable runtime-данные конкретного Player:

- Last Known Good snapshot;
- `schema_version` и component hashes этого snapshot;
- локальную очередь диагностических событий;
- служебные счётчики bounded-журнала.

Это не копия PostgreSQL.

**Cache Storage** хранит shell Player и тяжёлые assets: CSS, JS, изображения и видео.

**Service Worker** является единственным владельцем прогрева и очистки LKG media-cache.

**PostgreSQL** остаётся единственным authoritative состоянием меню/сцен/привязок.

## Запуск

1. Player открывает IndexedDB.
2. Если Last Known Good найден, он применяется немедленно — до проверки Device Session и сети.
3. Статические слои рендерятся один раз для найденного состояния.
4. Player параллельно проверяет сохранённую Device Session и выполняет REST synchronization.
5. После этого подключается WebSocket invalidation channel.
6. Отсутствие сети не останавливает уже работающий показ.

## Last Known Good

Полученный JSON не становится Last Known Good автоматически.

Фактическая последовательность применения candidate:

1. получить delta/snapshot;
2. подготовить критические assets candidate;
3. применить только изменившиеся слои;
4. убедиться, что render завершился успешно;
5. сохранить candidate в IndexedDB как новый Last Known Good;
6. передать Service Worker manifest всех assets нового LKG;
7. Service Worker последовательно проверяет Cache Storage и догружает отсутствующие активные assets;
8. только если ensure завершился успешно, Service Worker удаляет больше не используемые cached assets.

Сейчас критическим media asset candidate является фон меню. Entity image/video не блокирует читаемое меню до фиксации candidate, но после фиксации LKG Service Worker обязан обеспечить его наличие в локальном cache как часть активного manifest.

Если критический asset не получен или render candidate завершается ошибкой, предыдущий Last Known Good не перезаписывается и продолжает показываться. Этот сценарий закреплён browser regression-тестом.

IndexedDB и Cache Storage не имеют общей транзакции, поэтому manifest публикуется только **после** успешного сохранения LKG. При ошибке ensure активных assets cache GC не выполняется, поэтому ранее рабочие файлы остаются доступными.

Page runtime не выполняет второй независимый прогрев Entity/background после фиксации LKG: владельцем этой операции остаётся только Service Worker.

## Render-on-change

Player получает независимые hashes компонентов. При delta он вызывает renderer только для реально изменившихся владельцев сцены.

Следствия:

- изменение Brand не растрирует Menu повторно;
- изменение Announcement не перестраивает Menu;
- menu-only delta не пересоздаёт неизменённый Entity media element;
- unchanged delta не трогает уже готовый Canvas;
- пропущенное WebSocket-сообщение безопасно: REST delta сравнивает известные hashes с текущим authoritative state.

## Visibility lifecycle

`player.js` владеет глобальным состоянием видимости Player. Подсистемы получают явные события и не наблюдают весь DOM.

- Entity binding обновляется событием `mira:entity-rendered`, без `MutationObserver` и без frame-loop;
- inactive Player останавливает базовое Entity video и Entity WAAPI;
- hidden browser page ставит Entity и GPU animations на pause;
- fullscreen Playlist ставит на pause скрытые базовые Entity/GPU эффекты;
- базовые CSS-анимации Environment/Brand/Announcement также приостанавливаются, когда их пиксели не видны.

## Локальный журнал

Журнал append-only и содержит уникальный `boot_id` + монотонный `seq` внутри одного boot. Один HTTP batch всегда относится ровно к одному `boot_id`.

Очередь ограничена одновременно количеством записей и размером из `.env`. При переполнении старые `info` удаляются раньше `warn/error`.

После восстановления связи Player отправляет события пакетами. Сервер идемпотентно принимает их по `(device_id, boot_id, seq)` и возвращает `accepted_through`. Только подтверждённые записи удаляются локально.

Не логируются кадры, animation ticks, каждый heartbeat или каждый unchanged sync.

После успешного опустошения очереди Player хранит in-memory признак чистого журнала. Пока новое событие не появилось, очередной unchanged fallback не открывает IndexedDB только ради проверки пустоты.

## Cache Storage и video

Все загружаемые фоны и Entity assets имеют immutable URL, поэтому cache-first не может вернуть старое содержимое по новому состоянию.

Активные assets обеспечиваются Service Worker последовательно. Это исключает одновременный прогрев нескольких тяжёлых media-файлов на слабом ТВ.

Для cached MP4/WebM Service Worker **не** преобразует весь ролик в `ArrayBuffer` ради каждого Range-запроса. Если полный asset уже cached, браузеру возвращается исходный streaming `200 Response`; HTTP Range допустимо игнорировать. Это оставляет чтение/декодирование штатному media stack и исключает повторные JS-копии десятков мегабайт.

Если video ещё не cached и браузер запросил Range, запрос проходит на сервер нативно; частичный `206` не сохраняется как будто это полный asset.

## Экономия ресурсов

В offline режиме запрещены агрессивные циклы reconnect. Используется exponential backoff с jitter. Редкий REST fallback работает независимо от reconnect-loop и отключается при восстановлении WebSocket.

Статическое меню не должно повторно рендериться без изменения входных данных. Любая невидимая непрерывная работа должна быть остановлена.
