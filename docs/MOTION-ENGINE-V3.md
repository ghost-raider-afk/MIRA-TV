# Motion Engine v3

## Назначение

Motion Engine v3 — внутренний runtime-контур анимации TV Menu 2. Он отделяет структуру сцены, поведение и сценарий движения от конкретного renderer/API. Формат сохранённых пользовательских animation settings пока остаётся `motion_version: 2`; это отдельная persistence boundary.

## Целевой TV runtime после v1.8.2

Motion Engine остаётся renderer-agnostic, но TV runtime разделяется по ответственности:

```text
MIRA Scene
├── Flat Menu Renderer  → одна статичная menu surface
├── Menu Motion Driver  → compatibility до GPU migration
├── Actor Runtime       → Object+/Story
├── Promo/Content       → временные scene layers
└── Scene Playlist      → orchestration / master timeline
```

Главное правило производительности: обычные строки меню не должны порождать постоянную O(N) покадровую работу. После GPU migration динамический budget определяется количеством активных scene layers, а не количеством строк меню.

`LiveMenuMotion` владеет только menu motion. `entity` имеет отдельный runtime owner и не должен одновременно компилироваться вторым runtime для того же DOM target. В дальнейшем оба владельца подключаются через единый TV Scene Coordinator, но channel ownership остаётся раздельным.

`FlatMenuRenderer` является renderer adapter/runtime boundary, а не новым источником layout. Он получает результат canonical renderer и превращает статичную Menu Scene в одну canvas/texture surface. При отсутствии поддержки raster path player обязан безопасно вернуться к DOM compatibility output без изменения данных.

Scene Playlist и Actor Story добавляются через новые SceneProgram/Coordinator слои. Они не должны добавлять условные ветки внутрь core Scene Graph или связывать core с DOM.

## Главный поток

```text
Canonical Menu Renderer
        ↓
Renderer Adapter
        ↓
Scene Graph
        ↓
Independent Scene Compilers
        ↓
Scene Composer
        ↓
Scene Runtime
        ↓
Motion Timeline
        ↓
Motion Driver
        ↓
Concrete Renderer Runtime
```

Текущая реализация:

```text
SVG/DOM menu
   ↓
dom-scene-adapter.js
   ↓
scene-graph.js
   ↓
menu-motion + atmosphere compilers
   ↓
scene-composer.js
   ↓
scene-runtime.js
   ↓
timeline.js
   ↓
drivers/waapi-driver.js
   ↓
Web Animations API
```

Будущие реализации не должны менять Scene Graph/Composer/Timeline ради подключения другого renderer:

```text
Scene Graph
   ↓
Menu / Atmosphere / Entity / GPU compilers
   ↓
Scene Composer + Runtime
   ↓
Timeline
   ├── WAAPI Driver → SVG/DOM
   ├── Pixi Driver  → GPU 2.5D
   └── Three Driver → GPU 3D / Live Entity
```

## Scene Graph

`scene-graph.js` не знает о DOM, SVG, Canvas, Pixi, Three.js, WebGL или WebGPU.

Scene node содержит:
- `id` — стабильная идентичность внутри сцены;
- `kind` — семантический тип объекта;
- `layer` — слой сцены;
- `target` — opaque render target, смысл которого знает только соответствующий adapter/driver;
- `order/count` — положение в последовательности;
- `depth` — логическая глубина;
- `transformOwner` — явный владелец transform на уровне scene node;
- `metadata` — расширяемые данные.

Текущие layers:
- `background`;
- `menu`;
- `atmosphere`;
- `entity`.

`entity` резервируется уже сейчас, но обычный menu motion compiler не имеет права автоматически применять к нему `item_effect`.

## Renderer adapters

Adapter связывает конкретное представление с renderer-neutral scene graph.

`dom-scene-adapter.js` — единственное место Motion Engine core, которое знает selectors готового SVG/DOM меню. Он:
- находит section/item/promotion/price/background/atmosphere targets;
- создаёт scene nodes;
- сохраняет phase/order для связанных объектов;
- размечает DOM диагностическими `data-motion-*` атрибутами.

`screen-preview.js` не создаёт Scene Graph и не знает Motion Runtime. Он отвечает только за визуальный renderer. Binding выполняется после рендера через adapter.

Будущий GPU adapter должен создавать те же scene node contracts, но `target` может быть, например, `Pixi.Container` или `Three.Object3D`.

## Scene programs и compilers

Каждая независимая подсистема компилирует свой `SceneProgram`.

Сейчас существуют:
- `menu-motion` — section/item/promotion/price/background;
- `atmosphere` — отдельные атмосферные эффекты.

В будущем таким же образом добавляются:
- `entity-behavior`;
- `gpu-atmosphere`;
- cinematic scene program;
- другие независимые behavior-компиляторы.

Compiler получает общий Scene Graph и runtime context, но не управляет Timeline и не вызывает driver напрямую.

## Channel ownership

Каждый track обязан заранее объявить `claims` — каналы render target, которыми он пишет:
- `transform`;
- `opacity`;
- `appearance`.

`scene-composer.js` проверяет ownership до запуска анимации. Два track не могут одновременно владеть одним каналом одного scene node — даже если они принадлежат одному program.

Пример допустимой композиции:

```text
node X
├── program A → transform
└── program B → appearance
```

Пример запрещённой композиции:

```text
node X
├── program A → transform
└── program B → transform   ← ownership conflict
```

Такой конфликт должен завершиться явной ошибкой до вызова renderer driver, а не проявляться случайным визуальным дёрганием.

WAAPI driver сериализует только заявленные track claims. Если track владеет только `transform`, он не имеет права одновременно записывать `opacity` или `filter`.

## Transform ownership

Один render target не должен получать конкурирующие transform writers в одном канале.

Плашка «Акция» является отдельным sibling scene node относительно `table-item-content`, поэтому scale строки не применяется второй раз к `path + text` плашки. Оба sibling node получают одинаковую row phase, но каждый владеет собственным transform.

Price может иметь собственный node, потому что его дополнительный transform является намеренной дочерней анимацией.

Новые слои/сущности обязаны явно объявлять ownership через scene node и track claims.

## Motion Plan state

Motion compiler формирует renderer-neutral keyframe state.

В state запрещены browser-specific CSS transform/filter strings. Keyframe state хранится числами:
- `x/y/z`;
- `xPercent`;
- `scale`;
- `skewXDeg`;
- `opacity`;
- `brightness`;
- `glowRadius/glowColor`;
- transform composition order.

Timing также семантический:
- `duration`;
- `delay`;
- `easing`;
- `loop`.

CSS `translate3d(...)`, `drop-shadow(...)`, `cubic-bezier(...)` формирует только WAAPI driver.

## Scene Composer

`scene-composer.js`:
- принимает несколько независимых SceneProgram;
- проверяет уникальность program id;
- проверяет, что track ссылается на canonical scene node;
- проверяет channel ownership;
- объединяет tracks;
- формирует один master scene plan и master clock.

Composer не знает DOM, CSS и конкретный animation API.

## Scene Runtime

`scene-runtime.js` является orchestration boundary.

Runtime:
1. получает Scene Graph и context;
2. вызывает подключённые compilers независимо;
3. передаёт programs в Scene Composer;
4. загружает итоговый plan в Motion Timeline;
5. предоставляет единый lifecycle `play/pause/replay/seek/destroy`.

Добавление нового behavior должно происходить через новый compiler в runtime, а не через новые условные ветки внутри UI-player.

## Motion Timeline

`timeline.js` не знает renderer и не требует DOM root. Он управляет:
- load;
- play;
- pause;
- replay;
- seek;
- currentTime;
- destroy.

Все операции делегируются driver contract.

## Driver contract

Driver обязан реализовать:
- `createTrack(track)`;
- `createClock(root, clock)`;
- `play(handle)`;
- `pause(handle)`;
- `cancel(handle)`;
- `seek(handle, milliseconds)`;
- `currentTime(handle)`;
- `playState(handle)`.

Текущий `WaapiMotionDriver` является первым runtime driver и единственным местом, где вызывается `Element.animate()` и выполняется CSS serialization.

## Live Entity boundary

Live Entity — отдельная runtime-система, а не новый item preset.

Будущий entity runtime должен иметь:
- собственный scene adapter;
- собственный state machine;
- собственный behavior/scene compiler;
- собственный SceneProgram;
- возможность использовать общий Scene Composer/Timeline contract;
- отдельный driver либо общий GPU driver;
- независимый lifecycle от критичного menu renderer.

Default compilers игнорируют неизвестные `kind`, включая `entity`, пока для него явно не подключён отдельный compiler.

## Что намеренно НЕ делаем сейчас

На этом этапе не вводятся:
- FPS limits;
- asset budgets;
- device tiers;
- automatic quality degradation;
- PixiJS/Three.js dependencies;
- WebGL/WebGPU runtime;
- новые persistence migrations.

Эти решения будут приниматься отдельными этапами после появления реальных GPU-сцен и измерений.

## Неподвижные архитектурные правила

1. Canonical menu renderer остаётся источником читаемого меню.
2. Renderer не зависит от Motion Runtime.
3. Scene Graph не зависит от renderer.
4. Каждый behavior компилируется в независимый SceneProgram.
5. Scene Composer запрещает конкурирующее владение каналами одного node.
6. Motion state не содержит CSS/WebGL/Three/Pixi-specific serialization.
7. Timeline не зависит от renderer.
8. Concrete driver — единственное место сериализации состояния под конкретный runtime.
9. Live Entity не наследует menu behavior неявно.
10. GPU/Entity никогда не должны становиться обязательным условием отображения основного меню.


## TV compositor runtime

Motion Studio и TV Player разделяют semantic scene contracts, но не обязаны использовать один concrete renderer path. TV Player оптимизирован для длительного воспроизведения на Smart TV:

```text
Canonical Menu Model
        ↓
   Flat Menu Surface
        +
PlayerSceneLayerComposer
        ↓
   GpuSceneRuntime
        ↓
Browser compositor / WAAPI
```

Инварианты TV runtime:
- количество постоянных menu-motion targets — `O(1)`, а не `O(number of rows)`;
- нет row-by-row `requestAnimationFrame` цикла;
- нет покадровых `filter`, `blur` и `drop-shadow` для базового menu motion;
- профиль компилируется в одну coarse `transform/opacity` animation;
- `Entity / Object+` сохраняет отдельного runtime-владельца;
- будущие `Promo`, `Content` и `Story` добавляются как независимые крупные слои через `PlayerSceneLayerComposer`.

`WasmMotionDriver` остаётся допустимым Studio/legacy driver, но больше не является зависимостью TV offline shell.
