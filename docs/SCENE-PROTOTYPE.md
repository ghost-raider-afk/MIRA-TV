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
- Undo/Redo с группировкой непрерывных действий и дублированием элементов;
- свойства активного Slide: название, длительность, переход, дублирование, удаление;
- базовые текстовые и визуальные свойства;
- тень и свечение;
- Entrance/Loop/Exit элементов исполняются runtime, а не остаются только настройками;
- Slide transitions: fade, crossfade, slide, zoom, wipe;
- фон слайда: цвет, изображение или видео;
- Preview;
- общий `scene-runtime/renderer.js` для Editor Preview и нового Player runtime;
- общий `scene-runtime/playback.js` для Editor Preview и TV Player;
- Editor добавляет поверх renderer-ноды только selection, drag, resize и Inspector.

### Draft и серверное хранение

- Scene Draft хранится в PostgreSQL как JSONB;
- библиотека получает лёгкие summary, полный Scene загружается только при открытии;
- `server_revision` защищает от тихого перезаписывания из другой вкладки;
- autosave сериализован и не допускает, чтобы медленный старый ответ заменил более свежую правку;
- уход со страницы при реально несохранённых изменениях защищён;
- autosave Draft не создаёт audit-событие на каждое движение объекта.

### Публикация

- `Scene Revision` реализована как отдельный immutable snapshot;
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
- Preview и Player используют один `ScenePlaybackRuntime` для Slide timeline, переходов, Clock ticks и media pause/resume;
- Preview не изменяет `active_slide_id` Draft во время просмотра;
- Published Scene имеет отдельный fullscreen Player layer;
- authoring `aspect-ratio` не навязывается физическому Player viewport;
- при активной Published Scene legacy menu/motion runtime останавливается и его слои скрываются;
- после снятия Assignment legacy runtime восстанавливается;
- при переходе outgoing и incoming Slide существуют одновременно до завершения эффекта, поэтому видео предыдущего Slide не уничтожается раньше времени;
- переходы и Entrance/Exit используют WAAPI и не требуют постоянного JavaScript `requestAnimationFrame`;
- учитывается `prefers-reduced-motion`;
- несколько Slides переключаются одним таймером без постоянного JavaScript render-loop;
- при скрытой странице таймеры Slide, Clock и Weather не выполняют бесполезную работу.

### Каталог

- Table Element подключён к реальному `/api/catalog/products`;
- поддерживаются реальные названия, производитель, крепость, цвет и фильтрация;
- пользователь задаёт произвольные объёмы, например `0,33; 0,5; 1; 1,5`;
- цена рассчитывается пропорционально существующей базовой цене за 1 литр;
- каталог передаётся Published Scene в Player только если Scene действительно содержит Table Element с catalog binding.

### Media Library

- Image, Logo и Video используют отдельный Asset Store и сохраняют `asset_id`, а не произвольный URL;
- Media API принимает файлы потоково и проверяет тип, контейнер, разрешение и `.env`-лимиты;
- Draft и Published Revision имеют защищённые ссылки на используемые assets, поэтому используемый файл нельзя удалить из-под опубликованной сцены;
- изображение и видео можно использовать как фон Slide;
- Player получает только assets, используемые назначенной Published Scene;
- критичные assets подготавливаются до принятия нового Last Known Good;
- активные assets кэшируются для offline Player;
- скрытое видео ставится на паузу;
- runtime Docker содержит `ffprobe`, поэтому проверка видео не зависит от наличия утилиты только на CI-хосте.

### Погода и часы

- Weather имеет собственное поле `weather.location` в Scene Schema;
- Editor получает погоду через защищённый API MIRA-TV, TV не обращается к внешнему провайдеру напрямую;
- Weather Provider выполняет geocoding и forecast на сервере, кэширует ответ и объединяет одновременные запросы одного места;
- при временной ошибке провайдера может использоваться последняя известная погода с пометкой stale;
- одинаковые данные погоды не изменяют Player hash только из-за нового времени загрузки;
- погода передаётся в Published Scene как `weather_by_element` и обновляется существующим Player state-sync;
- если в Scene нет настроенного Weather, weather subsystem и отдельный refresh timer не запускаются;
- при offline погодный refresh останавливается и восстанавливается после reconciliation;
- Weather варианты: компактный, только температура, прогноз, минималистичный;
- Clock варианты: цифровой, только время, с секундами, время с полной датой, аналоговый;
- обычные часы обновляются по минутной границе, часы с секундами и аналоговые — раз в секунду;
- обновление Clock и Weather меняет только соответствующие DOM-узлы и не пересоздаёт видео или остальные элементы Scene.

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
- offline shell содержит Renderer, Animation и ScenePlaybackRuntime, поэтому cold restart без сети не должен зависеть от уже загруженных в память модулей.

### Проверки

`prototype-check` проверяет Node 24, синтаксис всего JavaScript, unit/integration tests, `mira-tv.sh` и реальную Compose-конфигурацию.

Есть отдельные тесты для:

- Scene Schema и server revision;
- shared Renderer boundary;
- Preview/Player `ScenePlaybackRuntime` parity;
- Slide transitions и Entrance/Exit runtime;
- immutable publication/Assignment;
- PostgreSQL-пути `Draft → Revision → Assignment → Player Context → unassign`;
- независимого Scene delta hash;
- publish/assignment UX;
- Media Asset Store и ссылочной целостности;
- Weather Provider, cache/coalescing/stale fallback и Player weather data;
- Clock/Weather runtime без полной перерисовки Scene;
- fullscreen Player geometry;
- WebSocket reconnect lifecycle;
- offline log queue и повторной отправки после восстановления сети;
- offline Published Scene shell.

## Текущее серверное хранение

На стадии прототипа используются:

- `scenes` — редактируемый Draft;
- `scene_revisions` — неизменяемые опубликованные снимки;
- `screen_scene_assignments` — назначение точной опубликованной ревизии одному монитору;
- отдельный Media Asset Store и ссылки Scene/Revision → Asset.

`server_revision` относится только к конкурентному редактированию Draft и не заменяет номер Published Scene Revision.

## Временные решения

Table Element пока использует существующий API продукции как bridge к будущему универсальному Catalog Service.

Draft пока сохраняется одним JSONB-документом. Для UX-прототипа это намеренно: перемещение элемента не должно порождать множество мелких SQL-записей.

## Ещё не реализовано

- финальная универсальная Catalog Schema;
- ручные price override для конкретной позиции и объёма;
- Display Group для 2–6 TV;
- синхронизация нескольких физических TV одной панорамы;
- Playlist/Schedule новой модели;
- полноценный Runtime Compiler для оптимизированных immutable snapshots;
- UI истории опубликованных ревизий и rollback;
- реальное browser/TV испытание обрыва сети на VPS.

Эти пункты не блокируют первую эксплуатационную приёмку single-TV прототипа и не должны добавляться до неё без необходимости.

## Неприкосновенные принципы

- Scene не принадлежит физическому TV;
- несколько TV — только горизонтальный ряд;
- одна Scene может иметь несколько Slides;
- элементы редактируются на свободном Canvas;
- Preview и Player используют один Renderer и один ScenePlaybackRuntime;
- TV никогда не читает Draft — только опубликованную ревизию;
- UI минимизирует количество действий и даёт мгновенный визуальный отклик;
- скрытая или неизменившаяся работа не должна расходовать CPU/сеть без необходимости;
- Draft не теряет изменения из-за autosave race;
- AI не добавляется до завершения и эксплуатационной репетиции ручного конструктора.

## Следующая контрольная точка — VPS-приёмка

Single-TV программный путь `создать → сохранить Draft → Preview → опубликовать → назначить → получить delta → показать тот же ScenePlaybackRuntime → снять назначение` замкнут и покрыт тестами.

Ветка `prototype` готова к первой установке на отдельный VPS. До окончания этой приёмки новые архитектурные функции не добавляются: сначала проверяем реальное поведение и исправляем найденные эксплуатационные дефекты.

Обязательная VPS/TV-проверка: чистая установка, вход, каталог, создание Scene, несколько Slides, Table/Image/Logo/Video/Weather/Clock, Preview, публикация, назначение на TV, визуальное совпадение Preview и Player, переходы и Entrance/Exit, перезапуск контейнеров, Last Known Good, холодный offline restart, физический обрыв сети, восстановление HTTP/WebSocket, доставка накопленных Player logs без дублей и отсутствие влияния на посторонние Docker-проекты.
