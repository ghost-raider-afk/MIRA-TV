# MIRA-TV Player новой архитектуры

## Роль Player

Player не является редактором и не должен содержать бизнес-логику конструктора. Его задача — надёжно и экономно показывать назначенную опубликованную Scene Revision.

TV никогда не читает редактируемый Draft.

## Текущий поток prototype

```text
Scene Draft
    ↓ Publish
Immutable Scene Revision
    ↓ Assignment
Monitor / Device Session
    ↓ Player Context + delta
Shared Scene Renderer
    ↓
TV
```

В будущем между Published Revision и Player появится отдельный Runtime Compiler, если измерения покажут необходимость более компактного runtime snapshot.

## Realtime

Основной realtime-канал TV — авторизованный WebSocket `/ws/device`.

Webhook для доставки состояния на TV не используется.

WebSocket передаёт только сигнал `context.changed`. Само состояние Player получает по HTTPS через delta API. Поэтому потеря отдельного WebSocket-сообщения не является потерей состояния.

При отсутствии WebSocket работает редкий fallback poll.

## Восстановление интернет-соединения

Событие браузера `online` является самостоятельным триггером восстановления и не зависит от того, успел ли WebSocket снова подключиться.

После восстановления сети Player:

1. фиксирует `network.online` в локальном журнале;
2. немедленно выполняет HTTP reconciliation;
3. применяет изменившиеся компоненты;
4. фиксирует `network.reconciled` с результатом;
5. отправляет накопленные диагностические события;
6. параллельно WebSocket восстанавливается со своим backoff.

Пока `navigator.onLine === false`, fallback HTTP polling не выполняется.

## Один Renderer

Editor Preview и Published Scene Player используют общий `scene-runtime/renderer.js` и общий `scene-renderer.css`.

Editor владеет только authoring-поведением: selection, drag, resize и Inspector.

Player предоставляет Renderer фиксированный fullscreen host. Authoring `aspect-ratio` не должен менять геометрию физического viewport.

Если одна и та же опубликованная сцена выглядит по-разному в Preview и на TV, это архитектурный дефект.

## Legacy fallback в prototype

Пока старая экранная модель ещё существует, Assignment новой Published Scene имеет приоритет.

Когда Published Scene активна:

- legacy menu/motion runtime останавливается;
- его слои очищаются и скрываются;
- работает отдельный fullscreen Published Scene layer.

После снятия Assignment Published Scene runtime уничтожается, а legacy слои строятся заново.

Это временный мост миграции, а не целевая двойная архитектура.

## Viewport

Для одного TV весь Scene Canvas масштабируется в физический viewport без изменения относительной геометрии элементов.

Для будущей горизонтальной группы каждый TV будет получать свой Slot/viewport глобального Canvas. Сейчас панорамную Scene 2–6 TV нельзя назначить одиночному Monitor.

## Несколько TV

Целевая модель предусматривает только горизонтальный ряд.

Все TV группы используют одну временную шкалу. Master TV отсутствует.

Каждый Player получит:

- идентификатор Display Group;
- Slot/viewport;
- версию сцены;
- общий timeline epoch или эквивалентный источник времени.

Эта часть ещё не реализована в prototype.

## Last Known Good

Player сохраняет последнее успешно применённое состояние в IndexedDB.

Новая версия становится активной только после подготовки обязательных данных/ресурсов. Сбой сети не должен заменять рабочий экран пустым состоянием.

## Offline shell

Service Worker кэширует Player shell и зависимости нового Scene Runtime, включая:

- `player.html`;
- Player CSS;
- `scene-renderer.css`;
- `published-scene-runtime.js`;
- `scene-runtime/renderer.js`;
- зависимости Table Element;
- legacy runtime, пока он нужен миграционному fallback.

Версия shell cache меняется при изменении обязательного module graph, чтобы старый неполный cache не считался актуальным.

## Offline Assets

Активные site-assets кэшируются отдельно от shell.

Большие video assets прогреваются последовательно, а не параллельно. Cached video не копируется целиком в JavaScript ради обработки Range-запросов.

Новая медиатека хранит изображения и видео как независимые Asset. В Player передаются только файлы, реально используемые назначенной Published Scene; подключение их к Renderer и offline manifest выполняется в текущем prototype-срезе.

## Delta-обновления

Player State состоит из независимых hash-компонентов. В prototype среди них есть отдельный `scene`.

Если изменилось только назначение Scene, сервер передаёт только Scene component. Неизменившиеся legacy menu, brand, environment и другие компоненты повторно не пересылаются.

После снятия Assignment `scene` становится `null`, что заставляет Player корректно вернуться к legacy runtime.

## Слайды

Published Scene с несколькими Slides использует один `setTimeout` на текущий слайд.

Постоянного JavaScript render-loop нет. При скрытой странице slide timer останавливается.

## Диагностический журнал

События Player хранятся локально в IndexedDB с ограничением количества записей и общего размера.

Ключ локального события включает `boot_id + seq`.

Локальные записи сериализованы: upload всегда ждёт завершения всех предыдущих append, поэтому reconnect не может отправить очередь раньше, чем событие фактически записано.

Сервер принимает пакет через `/api/device/player-logs` и отвечает `accepted_through`.

Серверная запись идемпотентна по `(device_id, boot_id, seq)`, поэтому повторная передача одного события безопасна.

Локально события удаляются только после подтверждения `accepted_through`.

Если после восстановления сети endpoint журналов временно недоступен, очередь остаётся в IndexedDB и отправка повторяется.

Сейчас журналируются, среди прочего:

- `player.boot`;
- `state.restored`;
- `state.applied`;
- `sync.failed`;
- `network.offline`;
- `network.online`;
- `network.reconciled`;
- `websocket.connected`;
- `websocket.disconnected`.

## Нагрузка

Если Scene статична и ничего не меняется, Player почти ничего не делает:

- не выполняет постоянный render-loop;
- не выполняет fallback poll при offline;
- не пересылает неизменившиеся hash-компоненты;
- не держит legacy motion runtime под активной Published Scene;
- не запускает slide timer для одного слайда;
- не запускает slide timer в скрытой вкладке.

Это обязательный performance-инвариант, а не будущая оптимизация.

## Обязательная VPS/TV-приёмка

Статические и интеграционные тесты не заменяют физическую проверку браузера/TV.

На VPS необходимо отдельно проверить:

- WebSocket disconnect/reconnect;
- обрыв интернет-соединения на работающем TV;
- продолжение показа Last Known Good;
- накопление диагностических событий offline;
- восстановление HTTP delta до восстановления WebSocket;
- появление `network.online` и `network.reconciled` на сервере после reconnect;
- отсутствие дублей при повторной отправке;
- cold restart Player без сети;
- применение новой Published Scene после восстановления связи.
