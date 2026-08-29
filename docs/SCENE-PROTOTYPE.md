# Статус ветки prototype

Ветка `prototype` используется только для новой архитектуры Scene Editor и не является релизной веткой.

Точка ответвления: стабильный `main` MIRA-TV 1.0.3.

## Реализовано сейчас

### Конструктор

- раздел «Сцены» и библиотека сцен;
- отдельный `scene-editor`;
- несколько Slides в одной Scene;
- Canvas на 1–6 Full HD TV в горизонтальном ряду;
- направляющие физических TV;
- элементы: таблица, текст, изображение, логотип, видео, погода, часы, фигура;
- drag/resize, X/Y/размер, слои;
- базовые текстовые и визуальные свойства;
- тень и свечение;
- каркас Entrance/Loop/Exit;
- фон слайда;
- Preview;
- общий `scene-runtime/renderer.js` для Editor Preview и нового Player runtime;
- Editor добавляет поверх renderer-ноды только selection, drag, resize и Inspector.

### Draft и серверное хранение

- Scene Draft хранится в PostgreSQL как JSONB;
- библиотека получает лёгкие summary, полный Scene Graph загружается только при открытии;
- `server_revision` защищает от тихого перезаписывания из другой вкладки;
- autosave сериализован и не допускает, чтобы медленный старый ответ заменил более свежую правку;
- уход со страницы при реально несохранённых изменениях защищён;
- autosave Draft не создаёт audit-событие на каждое движение объекта.

### Публикация

- `Scene Revision` уже реализована как отдельный immutable snapshot;
- кнопка «Опубликовать» сама дожидается подтверждённого сохранения Draft и после этого создаёт новую опубликованную ревизию;
- последующее редактирование Draft не изменяет уже опубликованную ревизию;
- публикация и назначение являются значимыми audit-событиями.

### Назначение и TV Player

- опубликованная ревизия назначается существующему монитору через отдельный Assignment;
- на странице мониторов видна текущая Scene Revision, её можно заменить или снять;
- одиночному монитору разрешено назначать только `display_count = 1`;
- панорамная Scene 2–6 TV не имитируется сжатием в один TV и ожидает полноценный Display Group;
- Assignment уведомляет подключённый TV через realtime;
- Player Context содержит Scene как отдельный hash-компонент;
- изменение Scene не заставляет передавать неизменившиеся legacy-компоненты;
- Player отображает Published Scene тем же shared Renderer, что используется Preview;
- Published Scene имеет отдельный fullscreen Player layer;
- authoring `aspect-ratio` не навязывается физическому Player viewport;
- при активной Published Scene legacy menu/motion runtime останавливается и его слои скрываются;
- после снятия Assignment legacy runtime восстанавливается;
- несколько Slides переключаются одним таймером без постоянного JavaScript render-loop;
- при скрытой странице таймер слайдов не работает.

### Каталог

- Table Element подключён к реальному `/api/catalog/products`;
- поддерживаются реальные названия, производитель, крепость, цвет и фильтрация;
- пользователь задаёт произвольные объёмы, например `0,33; 0,5; 1; 1,5`;
- цена рассчитывается пропорционально существующей базовой цене за 1 литр;
- каталог передаётся Published Scene в Player только если Scene действительно содержит Table Element с catalog binding.

### Realtime, offline и диагностика

- realtime для TV реализован авторизованным WebSocket `/ws/device`, а не webhook;
- WebSocket сообщает о факте изменения, после чего Player забирает актуальный delta по HTTPS;
- при восстановлении интернет-соединения Player немедленно выполняет HTTP reconciliation независимо от того, успел ли восстановиться WebSocket;
- fallback HTTP polling не выполняется, пока браузер сообщает offline;
- события `network.offline`, `network.online`, `network.reconciled`, `websocket.connected` и `websocket.disconnected` попадают в локальный журнал Player;
- диагностические события сохраняются в IndexedDB;
- локальные log-write сериализованы, поэтому upload не может обогнать незавершённую запись;
- подтверждённые сервером события удаляются локально только до `accepted_through`;
- серверная запись идемпотентна по `(device_id, boot_id, seq)`;
- неудачная отправка логов после восстановления сети автоматически повторяется;
- Last Known Good хранится локально;
- offline shell содержит модули и CSS Published Scene Renderer, поэтому cold restart без сети не должен зависеть от уже загруженных в память модулей.

### Проверки

`prototype-check` проверяет Node 24, синтаксис всего JavaScript, unit/integration tests, `mira-tv.sh` и реальную Compose-конфигурацию.

Есть отдельные тесты для:

- Scene Schema и server revision;
- shared Renderer boundary;
- immutable publication/Assignment;
- PostgreSQL-пути `Draft → Revision → Assignment → Player Context → unassign`;
- независимого Scene delta hash;
- publish/assignment UX;
- fullscreen Player geometry;
- WebSocket reconnect lifecycle;
- offline log queue и повторной отправки после восстановления сети;
- offline Published Scene shell.

## Текущее серверное хранение

На стадии прототипа используются:

- `scenes` — редактируемый Draft;
- `scene_revisions` — неизменяемые опубликованные снимки;
- `screen_scene_assignments` — назначение точной опубликованной ревизии одному монитору.

`server_revision` относится только к конкурентному редактированию Draft и не заменяет номер Published Scene Revision.

## Временные решения

Table Element пока использует существующий legacy API продукции как bridge к будущему универсальному Catalog Service.

Weather пока демонстрационный. Image/Logo/Video в новом Scene Editor пока являются объектами конструктора без финальной Media Library и Asset Store.

Draft пока сохраняется одним JSONB-документом. Для UX-прототипа это намеренно: перемещение элемента не должно порождать множество мелких SQL-записей.

## Ещё не реализовано

- Media Library и реальные Scene image/logo/video assets;
- Weather Provider;
- финальная универсальная Catalog Schema;
- ручные price override для конкретной позиции и объёма;
- Display Group для 2–6 TV;
- синхронизация нескольких физических TV одной панорамы;
- Playlist/Schedule новой модели;
- полноценный Runtime Compiler для оптимизированных immutable snapshots;
- UI истории опубликованных ревизий и rollback;
- реальное browser/TV испытание обрыва сети на VPS.

## Неприкосновенные принципы

- Scene не принадлежит физическому TV;
- несколько TV — только горизонтальный ряд;
- одна Scene может иметь несколько Slides;
- элементы редактируются на свободном Canvas;
- Preview и Player используют один runtime renderer;
- TV никогда не читает Draft — только опубликованную ревизию;
- UI минимизирует количество действий и даёт мгновенный визуальный отклик;
- скрытая или неизменившаяся работа не должна расходовать CPU/сеть без необходимости;
- Draft не теряет изменения из-за autosave race;
- AI не добавляется до завершения и эксплуатационной репетиции ручного конструктора.

## Следующая контрольная точка

Для одного TV программный путь `создать → сохранить Draft → опубликовать → назначить → получить delta → показать shared Renderer → снять назначение` уже замкнут и покрыт тестами.

Следующий этап перед расширением архитектуры — подготовка prototype к установке на отдельный VPS и реальная приёмка в браузере/на TV, включая физический обрыв и восстановление интернета. После этого исправляются найденные эксплуатационные дефекты, и только затем продолжается Display Group/Media/Weather.
