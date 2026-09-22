import { api } from '../core/api.js';
import { addSceneElement, removeSceneElement, replaceSceneElement, selectSceneElement, updateSceneElement } from './commands.js';

export const SCENE_ELEMENT_TYPE_OPTIONS = Object.freeze([
  ['text', 'Текстовое поле'],
  ['weather', 'Погода'],
  ['image', 'Картинка'],
  ['video', 'Видео'],
  ['logo', 'Логотип']
]);

const SCENE_ELEMENT_TYPE_ICONS = Object.freeze({
  text: 'T',
  weather: '☁',
  image: '▧',
  video: '▶',
  logo: '◈'
});

const FONTS = Object.freeze([
  ['arial-narrow', 'Arial Narrow'],
  ['tahoma-bold', 'Tahoma Bold'],
  ['arial', 'Arial'],
  ['dejavu-condensed', 'DejaVu Sans Condensed'],
  ['liberation-narrow', 'Liberation Sans Narrow'],
  ['system-sans', 'Системный sans-serif']
]);

function uid() {
  return globalThis.crypto?.randomUUID
    ? `element-${crypto.randomUUID()}`
    : `element-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultText() {
  return {
    runs: [{
      value: 'Текст',
      font_family: 'system-sans',
      font_size_px: 64,
      font_weight: 700,
      italic: false,
      color: '#FFFFFF',
      opacity: 1,
      tracking_px: 0,
      leading_percent: 120,
      horizontal_scale_percent: 100,
      vertical_scale_percent: 100,
      baseline_shift_px: 0,
      text_transform: 'none'
    }],
    paragraph: { align: 'left', vertical_align: 'top', wrap: true },
    effects: {
      fill: { enabled: true, mode: 'solid', color: '#FFFFFF', opacity: 1 },
      stroke: { enabled: false, width_px: 1, color: '#000000', opacity: 1 },
      shadow: { enabled: false, offset_x_px: 0, offset_y_px: 4, blur_px: 12, color: '#000000', opacity: .5 },
      glow: { enabled: false, blur_px: 18, spread_px: 0, color: '#FFFFFF', opacity: .5 }
    }
  };
}

function defaultWeather() {
  return {
    mode: 'current-and-forecast',
    location_name: '',
    latitude: null,
    longitude: null,
    timezone: 'auto',
    refresh_minutes: 15,
    show_location: true,
    show_condition: true,
    show_feels_like: true,
    show_humidity: true,
    show_wind: true,
    show_forecast: true,
    forecast_items: 3,
    temperature_font_family: 'arial',
    temperature_size_percent: 100,
    location_size_percent: 100,
    animation_enabled: true,
    animation_speed: 1,
    animation_intensity: 1,
    widget_motion_enabled: true
  };
}

function defaultMedia(video = false) {
  return {
    source_url: '',
    fit: 'contain',
    position_x_percent: 50,
    position_y_percent: 50,
    ...(video ? { loop: true, muted: true, playback_rate: 1 } : {})
  };
}

export function createSceneElement(type = 'text', index = 0) {
  const width = type === 'text' ? 720 : 520;
  const height = type === 'text' ? 220 : 360;
  const common = {
    id: uid(),
    enabled: true,
    type,
    x: 120 + (index % 5) * 32,
    y: 120 + (index % 5) * 32,
    width,
    height,
    z_index: index,
    opacity: 1,
    rotation_deg: 0,
    content_auto_scale: true,
    content_scale_percent: 100,
    content_reference_width: width,
    content_reference_height: height
  };
  if (type === 'text') return { ...common, text: defaultText() };
  if (type === 'weather') return { ...common, weather: defaultWeather() };
  if (type === 'video') return { ...common, media: defaultMedia(true) };
  return { ...common, media: defaultMedia(false) };
}

export function appendSceneElement(state, type = 'text') {
  const allowed = new Set(SCENE_ELEMENT_TYPE_OPTIONS.map(([value]) => value));
  const nextType = allowed.has(type) ? type : 'text';
  const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
  if (nextType === 'weather' && elements.some((item) => item?.type === 'weather')) return null;
  if (nextType === 'video' && elements.filter((item) => item?.type === 'video' && item.enabled !== false).length >= 2) return null;
  const element = createSceneElement(nextType, elements.length);
  addSceneElement(state, element);
  return element;
}

function label(text, control, className = 'field') {
  const node = document.createElement('label');
  node.className = className;
  const caption = document.createElement('span');
  caption.textContent = text;
  if (control instanceof HTMLElement && !control.hasAttribute('aria-label')) control.setAttribute('aria-label', text);
  node.append(caption, control);
  return node;
}

function input(type, value, options = {}) {
  const node = document.createElement('input');
  node.type = type;
  if (value !== undefined && value !== null) node.value = String(value);
  if (options.min !== undefined) node.min = String(options.min);
  if (options.max !== undefined) node.max = String(options.max);
  if (options.step !== undefined) node.step = String(options.step);
  if (options.placeholder) node.placeholder = options.placeholder;
  if (options.accept) node.accept = options.accept;
  return node;
}

function select(value, options) {
  const node = document.createElement('select');
  options.forEach(([optionValue, title, disabled = false]) => {
    const option = new Option(title, optionValue);
    option.disabled = disabled === true;
    node.append(option);
  });
  node.value = String(value ?? '');
  return node;
}

function check(value) {
  const node = input('checkbox');
  node.checked = value === true;
  return node;
}

function begin(control, callback) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    callback?.();
  };
  control.addEventListener('focus', run, { once: true });
  control.addEventListener('pointerdown', run, { once: true });
}

function bind(control, event, change, options) {
  begin(control, options.onBeforeMutate);
  control.addEventListener(event, () => {
    change();
    options.onVisualChange?.();
  });
  return control;
}

function elementById(state, id) {
  return state.scene?.elements?.find((entry) => entry.id === id) || null;
}

function numberValue(control, fallback = 0) {
  const value = Number(control.value);
  return Number.isFinite(value) ? value : fallback;
}

function patch(state, id, value) {
  updateSceneElement(state, id, value);
}

function mutateText(state, id, mutate) {
  const next = structuredClone(elementById(state, id)?.text || defaultText());
  mutate(next);
  patch(state, id, { text: next });
}

function mutateWeather(state, id, mutate) {
  const next = structuredClone(elementById(state, id)?.weather || defaultWeather());
  mutate(next);
  patch(state, id, { weather: next });
}

function mutateMedia(state, id, video, mutate) {
  const next = structuredClone(elementById(state, id)?.media || defaultMedia(video));
  mutate(next);
  patch(state, id, { media: next });
}

function section(title, description = '') {
  const block = document.createElement('section');
  block.className = 'editor-element-settings-section';
  const head = document.createElement('div');
  head.className = 'editor-element-settings-head';
  const strong = document.createElement('strong');
  strong.textContent = title;
  head.append(strong);
  if (description) {
    const small = document.createElement('small');
    small.textContent = description;
    head.append(small);
  }
  block.append(head);
  return block;
}

function typeLabel(type) {
  return SCENE_ELEMENT_TYPE_OPTIONS.find(([value]) => value === type)?.[1] || type;
}

function typeIcon(type) {
  return SCENE_ELEMENT_TYPE_ICONS[type] || '•';
}

function commonSettings(state, element, options) {
  const block = section('Трансформация', 'Координаты сцены 1920×1080');
  const grid = document.createElement('div');
  grid.className = 'geometry-grid';

  for (const [caption, key, min, max] of [
    ['X', 'x', 0, 1919],
    ['Y', 'y', 0, 1079],
    ['Ширина', 'width', 1, 1920],
    ['Высота', 'height', 1, 1080],
    ['Слой', 'z_index', -1000, 1000],
    ['Поворот, °', 'rotation_deg', -360, 360]
  ]) {
    const control = input('number', element[key], { min, max, step: 1 });
    bind(control, 'input', () => patch(state, element.id, { [key]: numberValue(control, element[key]) }), options);
    grid.append(label(caption, control));
  }
  block.append(grid);

  const opacity = input('range', element.opacity ?? 1, { min: 0, max: 1, step: .01 });
  bind(opacity, 'input', () => patch(state, element.id, { opacity: numberValue(opacity, 1) }), options);
  block.append(label('Прозрачность элемента', opacity));

  if (element.type === 'text') {
    const contentGrid = document.createElement('div');
    contentGrid.className = 'compact-form-grid scene-editor-content-scale-grid';

    const autoScale = check(element.content_auto_scale !== false);
    bind(autoScale, 'change', () => patch(state, element.id, { content_auto_scale: autoScale.checked }), options);

    const contentScale = input('number', element.content_scale_percent ?? 100, { min: 10, max: 300, step: 1 });
    bind(contentScale, 'input', () => patch(state, element.id, {
      content_scale_percent: numberValue(contentScale, 100)
    }), options);

    contentGrid.append(
      label('Автомасштаб при resize', autoScale, 'editor-element-check'),
      label('Масштаб внутри, %', contentScale)
    );
    block.append(contentGrid);
  }
  return block;
}

function textSettings(state, element, options) {
  const text = structuredClone(element.text || defaultText());
  const run = text.runs?.[0] || defaultText().runs[0];

  const content = section('Текст', 'Содержимое текстового поля');
  const body = document.createElement('textarea');
  body.rows = 4;
  body.maxLength = 12000;
  body.value = run.value || '';
  bind(body, 'input', () => mutateText(state, element.id, (next) => {
    next.runs[0] = { ...(next.runs[0] || run), value: body.value };
  }), options);
  content.append(label('Текст', body));

  const typography = section('Типографика', 'Параметры в стиле графического редактора');
  const grid = document.createElement('div');
  grid.className = 'compact-form-grid';
  const specs = [
    ['Шрифт', 'font_family', select(run.font_family, FONTS), (control) => control.value, 'change'],
    ['Размер, px', 'font_size_px', input('number', run.font_size_px, { min: 6, max: 512, step: 1 }), (control) => numberValue(control, 64), 'input'],
    ['Насыщенность', 'font_weight', input('number', run.font_weight, { min: 100, max: 900, step: 100 }), (control) => numberValue(control, 400), 'input'],
    ['Цвет', 'color', input('color', run.color || '#FFFFFF'), (control) => control.value, 'input'],
    ['Прозрачность текста', 'opacity', input('range', run.opacity ?? 1, { min: 0, max: 1, step: .01 }), (control) => numberValue(control, 1), 'input'],
    ['Трекинг, px', 'tracking_px', input('number', run.tracking_px, { min: -20, max: 100, step: .5 }), (control) => numberValue(control, 0), 'input'],
    ['Интерлиньяж, %', 'leading_percent', input('number', run.leading_percent, { min: 50, max: 400, step: 1 }), (control) => numberValue(control, 120), 'input'],
    ['Масштаб X, %', 'horizontal_scale_percent', input('number', run.horizontal_scale_percent, { min: 10, max: 400, step: 1 }), (control) => numberValue(control, 100), 'input'],
    ['Масштаб Y, %', 'vertical_scale_percent', input('number', run.vertical_scale_percent, { min: 10, max: 400, step: 1 }), (control) => numberValue(control, 100), 'input'],
    ['Смещение базы, px', 'baseline_shift_px', input('number', run.baseline_shift_px, { min: -500, max: 500, step: 1 }), (control) => numberValue(control, 0), 'input'],
    ['Регистр', 'text_transform', select(run.text_transform, [['none', 'Как введено'], ['uppercase', 'ВЕРХНИЙ'], ['lowercase', 'нижний']]), (control) => control.value, 'change']
  ];
  specs.forEach(([caption, key, control, read, event]) => {
    bind(control, event, () => mutateText(state, element.id, (next) => {
      next.runs[0] = { ...(next.runs[0] || run), [key]: read(control) };
    }), options);
    grid.append(label(caption, control));
  });
  const italic = check(run.italic === true);
  bind(italic, 'change', () => mutateText(state, element.id, (next) => {
    next.runs[0] = { ...(next.runs[0] || run), italic: italic.checked };
  }), options);
  grid.append(label('Курсив', italic, 'editor-element-check'));
  typography.append(grid);

  const paragraph = section('Абзац');
  const paragraphGrid = document.createElement('div');
  paragraphGrid.className = 'compact-form-grid';
  const align = select(text.paragraph?.align, [['left', 'Слева'], ['center', 'По центру'], ['right', 'Справа']]);
  bind(align, 'change', () => mutateText(state, element.id, (next) => {
    next.paragraph = { ...next.paragraph, align: align.value };
  }), options);
  paragraphGrid.append(label('По горизонтали', align));
  const vertical = select(text.paragraph?.vertical_align, [['top', 'Сверху'], ['center', 'По центру'], ['bottom', 'Снизу']]);
  bind(vertical, 'change', () => mutateText(state, element.id, (next) => {
    next.paragraph = { ...next.paragraph, vertical_align: vertical.value };
  }), options);
  paragraphGrid.append(label('По вертикали', vertical));
  const wrap = check(text.paragraph?.wrap !== false);
  bind(wrap, 'change', () => mutateText(state, element.id, (next) => {
    next.paragraph = { ...next.paragraph, wrap: wrap.checked };
  }), options);
  paragraphGrid.append(label('Перенос строк', wrap, 'editor-element-check'));
  paragraph.append(paragraphGrid);

  const effects = section('Эффекты текста', 'Заливка, обводка, тень и свечение');
  const effectList = document.createElement('div');
  effectList.className = 'editor-element-effects';

  const fill = text.effects?.fill || defaultText().effects.fill;
  const fillBox = document.createElement('fieldset');
  const fillLegend = document.createElement('legend');
  fillLegend.textContent = 'Заливка';
  fillBox.append(fillLegend);
  const fillGrid = document.createElement('div');
  fillGrid.className = 'compact-form-grid';
  const fillColor = input('color', fill.color || run.color || '#FFFFFF');
  bind(fillColor, 'input', () => mutateText(state, element.id, (next) => {
    next.effects.fill = { ...next.effects.fill, enabled: true, mode: 'solid', color: fillColor.value };
    next.runs[0] = { ...(next.runs[0] || run), color: fillColor.value };
  }), options);
  fillGrid.append(label('Цвет', fillColor));
  const fillOpacity = input('range', fill.opacity ?? 1, { min: 0, max: 1, step: .01 });
  bind(fillOpacity, 'input', () => mutateText(state, element.id, (next) => {
    next.effects.fill = { ...next.effects.fill, enabled: true, mode: 'solid', opacity: numberValue(fillOpacity, 1) };
  }), options);
  fillGrid.append(label('Прозрачность', fillOpacity));
  fillBox.append(fillGrid);
  effectList.append(fillBox);

  for (const [title, key, fields] of [
    ['Обводка', 'stroke', [['width_px', 'Толщина', 0, 64], ['color', 'Цвет'], ['opacity', 'Прозрачность', 0, 1, .01]]],
    ['Тень', 'shadow', [['offset_x_px', 'Смещение X', -500, 500], ['offset_y_px', 'Смещение Y', -500, 500], ['blur_px', 'Размытие', 0, 256], ['color', 'Цвет'], ['opacity', 'Прозрачность', 0, 1, .01]]],
    ['Свечение', 'glow', [['blur_px', 'Размытие', 0, 256], ['spread_px', 'Расширение', 0, 128], ['color', 'Цвет'], ['opacity', 'Прозрачность', 0, 1, .01]]]
  ]) {
    const box = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    box.append(legend);
    const effect = text.effects?.[key] || defaultText().effects[key];
    const enabled = check(effect.enabled === true);
    bind(enabled, 'change', () => mutateText(state, element.id, (next) => {
      next.effects[key] = { ...next.effects[key], enabled: enabled.checked };
    }), options);
    box.append(label('Включено', enabled, 'editor-element-check'));
    const fieldsGrid = document.createElement('div');
    fieldsGrid.className = 'compact-form-grid';
    fields.forEach(([fieldKey, caption, min, max, step]) => {
      const isColor = fieldKey === 'color';
      const control = isColor
        ? input('color', effect[fieldKey] || '#000000')
        : input(fieldKey === 'opacity' ? 'range' : 'number', effect[fieldKey], {
            min,
            max,
            step: step ?? 1
          });
      bind(control, 'input', () => mutateText(state, element.id, (next) => {
        next.effects[key] = {
          ...next.effects[key],
          [fieldKey]: isColor ? control.value : numberValue(control, fieldKey === 'opacity' ? 1 : 0)
        };
      }), options);
      fieldsGrid.append(label(caption, control));
    });
    box.append(fieldsGrid);
    effectList.append(box);
  }
  effects.append(effectList);

  return [content, typography, paragraph, effects];
}

function weatherSettings(state, element, options) {
  const weather = element.weather || defaultWeather();

  const source = section('Погода', 'Источник и режим отображения');
  const grid = document.createElement('div');
  grid.className = 'compact-form-grid';

  const mode = select(weather.mode, [['current', 'Текущая погода'], ['current-and-forecast', 'С прогнозом']]);
  bind(mode, 'change', () => mutateWeather(state, element.id, (next) => { next.mode = mode.value; }), options);
  grid.append(label('Режим', mode));

  const latitude = input('number', weather.latitude, { min: -90, max: 90, step: 'any' });
  const longitude = input('number', weather.longitude, { min: -180, max: 180, step: 'any' });
  const timezone = input('text', weather.timezone || 'auto');
  const location = input('text', weather.location_name, { placeholder: 'Начните вводить город' });
  location.autocomplete = 'off';
  location.setAttribute('role', 'combobox');
  location.setAttribute('aria-autocomplete', 'list');
  location.setAttribute('aria-expanded', 'false');

  const locationResults = document.createElement('div');
  locationResults.className = 'weather-location-results scene-weather-location-results';
  locationResults.setAttribute('role', 'listbox');
  locationResults.hidden = true;

  const locationSearch = document.createElement('div');
  locationSearch.className = 'scene-weather-location-search';
  locationSearch.append(label('Населённый пункт', location), locationResults);
  grid.append(locationSearch);

  let searchTimer = null;
  let searchGeneration = 0;
  const closeLocations = () => {
    locationResults.hidden = true;
    locationResults.replaceChildren();
    location.setAttribute('aria-expanded', 'false');
  };
  const applyLocation = (item) => {
    if (!item || !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))) return;
    mutateWeather(state, element.id, (next) => {
      next.location_name = String(item.name || '');
      next.latitude = Number(item.latitude);
      next.longitude = Number(item.longitude);
      next.timezone = String(item.timezone || 'auto');
    });
    location.value = String(item.name || '');
    latitude.value = String(item.latitude);
    longitude.value = String(item.longitude);
    timezone.value = String(item.timezone || 'auto');
    closeLocations();
    options.onVisualChange?.();
  };
  const showLocations = (items) => {
    locationResults.replaceChildren();
    for (const item of items) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'weather-location-option';
      option.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.textContent = item.name || '';
      const details = document.createElement('small');
      details.textContent = [item.admin1, item.country].filter(Boolean).join(', ');
      option.append(name, details);
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => applyLocation(item));
      locationResults.append(option);
    }
    locationResults.hidden = locationResults.childElementCount === 0;
    location.setAttribute('aria-expanded', String(!locationResults.hidden));
  };
  const searchLocations = (query) => {
    if (searchTimer) clearTimeout(searchTimer);
    const current = String(query || '').trim();
    const generation = ++searchGeneration;
    if (current.length < 2) {
      closeLocations();
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const items = await api.get('/api/weather/locations?q=' + encodeURIComponent(current));
        if (generation !== searchGeneration || !location.isConnected || location.value.trim() !== current) return;
        const limited = Array.isArray(items) ? items.slice(0, 8) : [];
        const key = current.toLocaleLowerCase('ru-RU');
        const exact = limited.filter((item) => String(item?.name || '').trim().toLocaleLowerCase('ru-RU') === key);
        if (exact.length === 1) {
          applyLocation(exact[0]);
          return;
        }
        showLocations(limited);
      } catch {
        if (generation === searchGeneration) closeLocations();
      }
    }, 220);
  };

  begin(location, options.onBeforeMutate);
  location.addEventListener('input', () => {
    mutateWeather(state, element.id, (next) => {
      next.location_name = location.value;
      next.latitude = null;
      next.longitude = null;
      next.timezone = 'auto';
    });
    latitude.value = '';
    longitude.value = '';
    timezone.value = 'auto';
    options.onVisualChange?.();
    searchLocations(location.value);
  });
  location.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLocations();
    if (event.key === 'Enter' && !locationResults.hidden) {
      const first = locationResults.querySelector('.weather-location-option');
      if (first instanceof HTMLButtonElement) {
        event.preventDefault();
        first.click();
      }
    }
  });
  location.addEventListener('blur', () => setTimeout(closeLocations, 120));

  const hasConfiguredCoordinates = weather.latitude !== null
    && weather.latitude !== ''
    && weather.longitude !== null
    && weather.longitude !== ''
    && Number.isFinite(Number(weather.latitude))
    && Number.isFinite(Number(weather.longitude));
  if (location.value.trim().length >= 2 && !hasConfiguredCoordinates) {
    queueMicrotask(() => {
      if (location.isConnected) searchLocations(location.value);
    });
  }

  for (const [caption, key, control, read] of [
    ['Широта', 'latitude', latitude, (field) => field.value === '' ? null : numberValue(field, null)],
    ['Долгота', 'longitude', longitude, (field) => field.value === '' ? null : numberValue(field, null)],
    ['Часовой пояс', 'timezone', timezone, (field) => field.value],
    ['Обновление, мин', 'refresh_minutes', input('number', weather.refresh_minutes, { min: 5, max: 120, step: 1 }), (field) => numberValue(field, 15)],
    ['Прогнозов', 'forecast_items', input('number', weather.forecast_items, { min: 1, max: 6, step: 1 }), (field) => numberValue(field, 3)]
  ]) {
    bind(control, 'input', () => mutateWeather(state, element.id, (next) => { next[key] = read(control); }), options);
    grid.append(label(caption, control));
  }
  source.append(grid);

  const visibility = section('Состав виджета');
  const visibilityGrid = document.createElement('div');
  visibilityGrid.className = 'editor-element-toggle-grid';
  for (const [caption, key] of [
    ['Название места', 'show_location'],
    ['Состояние', 'show_condition'],
    ['Ощущается', 'show_feels_like'],
    ['Влажность', 'show_humidity'],
    ['Ветер', 'show_wind'],
    ['Краткий прогноз', 'show_forecast']
  ]) {
    const control = check(weather[key] !== false);
    bind(control, 'change', () => mutateWeather(state, element.id, (next) => { next[key] = control.checked; }), options);
    visibilityGrid.append(label(caption, control, 'editor-element-check'));
  }
  visibility.append(visibilityGrid);

  const typography = section('Типографика', 'Размеры автоматически подстраиваются под окно погоды');
  const typographyGrid = document.createElement('div');
  typographyGrid.className = 'compact-form-grid';
  const temperatureFont = select(weather.temperature_font_family || 'arial', FONTS);
  bind(temperatureFont, 'change', () => mutateWeather(state, element.id, (next) => {
    next.temperature_font_family = temperatureFont.value;
  }), options);
  typographyGrid.append(label('Шрифт температуры', temperatureFont));

  for (const [caption, key, fallback] of [
    ['Размер температуры, %', 'temperature_size_percent', 100],
    ['Размер города, %', 'location_size_percent', 100]
  ]) {
    const control = input('number', weather[key] ?? fallback, { min: 60, max: 180, step: 1 });
    bind(control, 'input', () => mutateWeather(state, element.id, (next) => {
      next[key] = numberValue(control, fallback);
    }), options);
    typographyGrid.append(label(caption, control));
  }
  typography.append(typographyGrid);

  const animation = section('Анимация');
  const animationGrid = document.createElement('div');
  animationGrid.className = 'compact-form-grid';
  for (const [caption, key] of [['Анимация погоды', 'animation_enabled'], ['Движение виджета', 'widget_motion_enabled']]) {
    const control = check(weather[key] !== false);
    bind(control, 'change', () => mutateWeather(state, element.id, (next) => { next[key] = control.checked; }), options);
    animationGrid.append(label(caption, control, 'editor-element-check'));
  }
  for (const [caption, key] of [['Скорость', 'animation_speed'], ['Интенсивность', 'animation_intensity']]) {
    const control = input('range', weather[key] ?? 1, { min: .25, max: 2, step: .05 });
    bind(control, 'input', () => mutateWeather(state, element.id, (next) => { next[key] = numberValue(control, 1); }), options);
    animationGrid.append(label(caption, control));
  }
  animation.append(animationGrid);

  return [source, visibility, typography, animation];
}

function mediaSettings(state, element, options) {
  const video = element.type === 'video';
  const media = element.media || defaultMedia(video);
  const block = section(typeLabel(element.type), video ? 'Видео для сцены TV Player' : 'Изображение для сцены TV Player');

  const file = input('file', null, { accept: video ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp' });
  const upload = document.createElement('button');
  upload.type = 'button';
  upload.className = 'button button-secondary';
  upload.textContent = 'Загрузить файл';
  const status = document.createElement('small');
  status.className = 'editor-element-media-state';
  status.textContent = media.source_url || 'Файл не загружен';
  upload.addEventListener('click', async () => {
    const selected = file.files?.[0];
    if (!selected || typeof options.onUpload !== 'function') return;
    upload.disabled = true;
    upload.textContent = 'Загружаем…';
    try {
      const asset = await options.onUpload(selected);
      options.onBeforeMutate?.();
      mutateMedia(state, element.id, video, (next) => { next.source_url = asset.source_url; });
      status.textContent = asset.source_url;
      options.onVisualChange?.();
    } finally {
      upload.disabled = false;
      upload.textContent = 'Загрузить файл';
    }
  });
  block.append(label('Файл', file), upload, status);

  const grid = document.createElement('div');
  grid.className = 'compact-form-grid';
  const fit = select(media.fit, [['contain', 'Вписать'], ['cover', 'Заполнить'], ['fill', 'Растянуть']]);
  bind(fit, 'change', () => mutateMedia(state, element.id, video, (next) => { next.fit = fit.value; }), options);
  grid.append(label('Вписывание', fit));

  for (const [caption, key] of [['Позиция X, %', 'position_x_percent'], ['Позиция Y, %', 'position_y_percent']]) {
    const control = input('number', media[key], { min: 0, max: 100, step: 1 });
    bind(control, 'input', () => mutateMedia(state, element.id, video, (next) => { next[key] = numberValue(control, 50); }), options);
    grid.append(label(caption, control));
  }

  if (video) {
    const rate = input('number', media.playback_rate, { min: .25, max: 4, step: .05 });
    bind(rate, 'input', () => mutateMedia(state, element.id, true, (next) => { next.playback_rate = numberValue(rate, 1); }), options);
    grid.append(label('Скорость', rate));
    for (const [caption, key] of [['Зациклить', 'loop'], ['Без звука', 'muted']]) {
      const control = check(media[key] !== false);
      bind(control, 'change', () => mutateMedia(state, element.id, true, (next) => { next[key] = control.checked; }), options);
      grid.append(label(caption, control, 'editor-element-check'));
    }
  }
  block.append(grid);
  return [block];
}

function renderElementCard(state, element, index, options) {
  const card = document.createElement('details');
  card.className = 'editor-element-card';
  card.dataset.sceneElementId = element.id;
  card.open = state.selectedElementId === element.id;

  const summary = document.createElement('summary');
  summary.className = 'editor-element-card-summary';
  const number = document.createElement('strong');
  number.textContent = `Элемент ${index + 1}`;
  const kind = document.createElement('span');
  kind.textContent = typeLabel(element.type);
  const stateLabel = document.createElement('small');
  stateLabel.textContent = element.enabled === false ? 'Скрыт' : '';
  summary.append(number, kind, stateLabel);
  card.append(summary);

  const body = document.createElement('div');
  body.className = 'editor-element-card-body';

  const identity = section('Тип элемента');
  const typeRow = document.createElement('div');
  typeRow.className = 'editor-element-type-row';
  const hasOtherWeather = Boolean(options.weatherOwnerId && options.weatherOwnerId !== element.id);
  const typeOptions = hasOtherWeather && element.type !== 'weather'
    ? SCENE_ELEMENT_TYPE_OPTIONS.filter(([value]) => value !== 'weather')
    : SCENE_ELEMENT_TYPE_OPTIONS;
  const type = select(element.type, typeOptions);
  type.setAttribute('aria-label', `Тип элемента ${index + 1}`);
  begin(type, options.onBeforeMutate);
  type.addEventListener('change', () => {
    const current = elementById(state, element.id) || element;
    const replacement = createSceneElement(type.value, index);
    Object.assign(replacement, {
      id: current.id,
      enabled: current.enabled,
      x: current.x,
      y: current.y,
      width: current.width,
      height: current.height,
      z_index: current.z_index,
      opacity: current.opacity,
      rotation_deg: current.rotation_deg,
      content_auto_scale: current.content_auto_scale !== false,
      content_scale_percent: current.content_scale_percent ?? 100,
      content_reference_width: current.content_reference_width || current.width,
      content_reference_height: current.content_reference_height || current.height
    });
    replaceSceneElement(state, current.id, replacement);
    selectSceneElement(state, element.id);
    options.onStructureChange?.();
  });
  const enabled = check(element.enabled !== false);
  bind(enabled, 'change', () => patch(state, element.id, { enabled: enabled.checked }), options);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button-danger editor-element-delete';
  remove.textContent = 'Удалить';
  remove.setAttribute('aria-label', `Удалить Элемент ${index + 1}`);
  remove.addEventListener('click', () => {
    options.onBeforeMutate?.();
    removeSceneElement(state, element.id);
    options.onStructureChange?.();
  });
  typeRow.append(label('Тип элемента', type), label('Показывать', enabled, 'editor-element-check'), remove);
  identity.append(typeRow);
  if (hasOtherWeather && element.type !== 'weather') {
    const hint = document.createElement('small');
    hint.className = 'editor-element-type-hint';
    hint.textContent = 'Погода уже добавлена в сцену.';
    identity.append(hint);
  }
  body.append(identity, commonSettings(state, element, options));

  const specific = element.type === 'text'
    ? textSettings(state, element, options)
    : element.type === 'weather'
      ? weatherSettings(state, element, options)
      : mediaSettings(state, element, options);
  body.append(...specific);
  card.append(body);

  card.addEventListener('toggle', () => {
    if (!card.open) return;
    selectSceneElement(state, element.id);
    options.container?.querySelectorAll('.editor-element-card').forEach((other) => {
      if (other !== card) other.open = false;
    });
  });

  return card;
}

export function renderSceneElements(state, {
  container,
  onBeforeMutate,
  onVisualChange,
  onStructureChange,
  onUpload
}) {
  if (!(container instanceof HTMLElement)) return;
  const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
  container.replaceChildren();

  if (!elements.length) {
    const empty = document.createElement('p');
    empty.className = 'editor-elements-empty';
    empty.textContent = 'Элементов пока нет. Нажмите «+ Элемент», чтобы добавить Элемент 1.';
    container.append(empty);
    return;
  }

  const weatherOwnerId = elements.find((element) => element?.type === 'weather')?.id || null;
  const options = { container, onBeforeMutate, onVisualChange, onStructureChange, onUpload, weatherOwnerId };
  elements.forEach((element, index) => container.append(renderElementCard(state, element, index, options)));
}


function sceneLayerSubtitle(element) {
  if (element?.type === 'text') {
    const value = String(element?.text?.runs?.[0]?.value || '').trim().replace(/\s+/g, ' ');
    if (value) return value.slice(0, 42);
  }
  if (element?.type === 'weather') {
    const place = String(element?.weather?.location_name || '').trim();
    if (place) return place;
  }
  const source = String(element?.media?.source_url || '').trim();
  if (source) return source.split('/').pop() || '';
  return '';
}

export function renderSceneLayerList(state, {
  container,
  onBeforeMutate,
  onVisualChange,
  onStructureChange,
  onSelect
} = {}) {
  if (!(container instanceof HTMLElement)) return;
  const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
  container.replaceChildren();

  if (!elements.length) {
    const empty = document.createElement('p');
    empty.className = 'scene-editor-empty';
    empty.textContent = 'Сцена пустая. Добавьте первый элемент.';
    container.append(empty);
    return;
  }

  const indexed = elements.map((element, index) => ({ element, index }))
    .sort((left, right) => Number(right.element?.z_index || 0) - Number(left.element?.z_index || 0) || right.index - left.index);

  for (const { element, index } of indexed) {
    const row = document.createElement('div');
    row.className = 'scene-editor-layer';
    row.classList.toggle('is-selected', state.selectedElementId === element.id);
    row.dataset.sceneLayerId = element.id;

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'scene-editor-layer-eye';
    eye.classList.toggle('is-hidden', element.enabled === false);
    eye.textContent = typeIcon(element.type);
    eye.title = element.enabled === false ? `Показать «${typeLabel(element.type)}»` : `Скрыть «${typeLabel(element.type)}»`;
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('click', () => {
      onBeforeMutate?.();
      patch(state, element.id, { enabled: element.enabled === false });
      onVisualChange?.();
      onStructureChange?.();
    });

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'scene-editor-layer-select';
    selectButton.setAttribute('aria-label', `Выбрать «${typeLabel(element.type)}»`);
    const title = document.createElement('strong');
    title.textContent = typeLabel(element.type);
    selectButton.title = sceneLayerSubtitle(element);
    selectButton.append(title);
    selectButton.addEventListener('click', () => {
      selectSceneElement(state, element.id);
      onSelect?.(element.id);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'scene-editor-layer-delete';
    remove.textContent = '×';
    remove.title = `Удалить «${typeLabel(element.type)}»`;
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => {
      onBeforeMutate?.();
      removeSceneElement(state, element.id);
      onStructureChange?.();
    });

    row.append(eye, selectButton, remove);
    container.append(row);
  }
}

function inspectorGroups(element, sections) {
  if (element.type === 'text') {
    return [
      ['Трансформация', sections.slice(0, 1), true],
      ['Содержимое', sections.slice(1, 2), true],
      ['Шрифт и абзац', sections.slice(2, 4), false],
      ['Эффекты', sections.slice(4), false]
    ];
  }
  if (element.type === 'weather') {
    return [
      ['Трансформация', sections.slice(0, 1), true],
      ['Погода', sections.slice(1, 3), true],
      ['Анимация', sections.slice(3), false]
    ];
  }
  return [
    ['Трансформация', sections.slice(0, 1), true],
    ['Медиа', sections.slice(1), true]
  ];
}

export function renderSceneElementInspector(state, {
  container,
  onBeforeMutate,
  onVisualChange,
  onStructureChange,
  onUpload
} = {}) {
  if (!(container instanceof HTMLElement)) return null;
  container.replaceChildren();

  const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
  const element = elements.find((item) => item.id === state.selectedElementId) || null;
  if (!element) {
    const empty = document.createElement('p');
    empty.className = 'scene-editor-empty';
    empty.textContent = 'Выберите объект на рабочем поле или в слоях.';
    container.append(empty);
    return null;
  }

  const index = elements.indexOf(element);
  const weatherOwnerId = elements.find((item) => item?.type === 'weather')?.id || null;
  const options = { container, onBeforeMutate, onVisualChange, onStructureChange, onUpload, weatherOwnerId };
  const card = renderElementCard(state, element, index, options);
  card.open = true;

  const body = card.querySelector(':scope > .editor-element-card-body');
  const sections = body ? [...body.children].filter((node) => node.classList?.contains('editor-element-settings-section')) : [];
  const identity = sections.shift();
  identity?.remove();
  const groups = inspectorGroups(element, sections).filter(([, nodes]) => nodes.length);

  const stack = document.createElement('div');
  stack.className = 'scene-editor-inspector-stack';

  groups.forEach(([name, nodes, open]) => {
    const group = document.createElement('details');
    group.className = 'scene-editor-inspector-group';
    group.open = open === true;

    const summary = document.createElement('summary');
    summary.textContent = name;
    summary.setAttribute('aria-label', `${name}: свойства Элемента ${index + 1}`);

    const panel = document.createElement('div');
    panel.className = 'scene-editor-inspector-panel';
    nodes.forEach((node) => panel.append(node));

    group.append(summary, panel);
    stack.append(group);
  });

  if (body) body.replaceChildren(stack);
  container.append(card);
  return element;
}
