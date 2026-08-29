# MIRA-TV TV resource budget

## Неприкосновенное правило

TV Player должен по максимуму экономить CPU, GPU, RAM, сеть, storage I/O и энергию телевизора.

Контрольный вопрос для любой новой функции:

> Что эта функция делает на телевизоре в течение часа, когда входные данные не меняются?

Для большинства подсистем правильный ответ: **почти ничего**.

## Обязательные правила

- Статический слой рендерится только при изменении его входных данных.
- Изменение одного слоя не пересобирает независимые слои.
- Нет постоянного polling при рабочем WebSocket.
- Fallback polling редкий и включается только при потере realtime channel.
- Нет постоянного `requestAnimationFrame`, если задачу можно решить событием, CSS/WAAPI или compositor.
- Entity runtime не наблюдает весь Player DOM через `MutationObserver`.
- Невидимые/перекрытые fullscreen-сценой анимации и media приостанавливаются.
- При inactive Player или hidden page базовые Entity/GPU/CSS animations не продолжают расходовать ресурсы.
- Видео декодируется штатным hardware/browser decoder, а не вручную через Canvas.
- Service Worker не должен материализовывать весь MP4/WebM в `ArrayBuffer` для обработки Range-запросов или выполнять byte slicing в JavaScript.
- Cached video возвращается media stack как исходный streaming `Response`; uncached Range остаётся нативным HTTP-запросом.
- Media assets повторно не загружаются, если immutable asset URL уже присутствует в валидном Cache Storage.
- Service Worker — единственный владелец прогрева LKG media-cache; page runtime не дублирует скачивание.
- Активные LKG assets обеспечиваются последовательно, чтобы не создавать параллельный тяжёлый download на ТВ.
- Last Known Good меняется только после подготовки критических assets и успешного render candidate.
- Cache GC запускается только после фиксации нового LKG и успешного ensure активных assets.
- Если ensure активного asset завершился ошибкой, старый cache не очищается.
- Логи отправляются bounded batch-ами, а не по одному событию.
- Один log batch содержит события только одного `boot_id`.
- Пустая локальная log queue не должна повторно сканироваться при каждом unchanged fallback.
- Heartbeat не должен создавать постоянную запись в PostgreSQL.
- Reconnect использует exponential backoff + jitter и не должен откладывать независимый fallback sync.
- IndexedDB хранит только данные, необходимые конкретному Player.
- Cache Storage хранит тяжёлые assets; IndexedDB не используется как видеохранилище.

## Целевое idle-состояние

Если сцена статична и серверных изменений нет:

- JavaScript event loop почти простаивает;
- статический render не повторяется;
- нет DOM observer, который постоянно следит за Player stage;
- сеть молчит, кроме native WebSocket keepalive;
- серверный WebSocket ping идёт не чаще одного раза в 60 секунд и не несёт application payload;
- при рабочем WebSocket REST polling отсутствует;
- при fallback unchanged sync нет лишней записи LKG и нет пустого повторного IndexedDB log scan;
- disk I/O отсутствует;
- GPU работает только для действительно видимых активных эффектов или видео.

## Проверки, которые обязаны защищать бюджет

CI должен падать, если возвращается архитектура, создающая постоянную работу на телевизоре. В частности, сейчас проверяются:

- отсутствие старого Player refresh-loop;
- dirty-component rendering;
- unchanged delta не заменяет Canvas;
- menu-only delta не пересоздаёт Entity media;
- неудачный critical asset не заменяет Last Known Good;
- WebSocket reconnect не блокирует редкий REST fallback;
- cached video path не использует `arrayBuffer()`/byte `slice()` для Range;
- Entity runtime не использует `MutationObserver`/`requestAnimationFrame`;
- скрытый Entity video получает `pause()`;
- Entity/GPU runtime приостанавливается при невидимости;
- CSS-анимации базовых слоёв приостанавливаются при inactive/hidden/fullscreen suppression;
- GPU scene runtime не использует постоянный `requestAnimationFrame`.

Оптимизация TV Player важнее удобства реализации на сервере: тяжёлую подготовительную работу по возможности выполнять вне телевизора.
