const BASE = Object.freeze({
  motion_version: 2,
  pattern: 'ambient',
  flow_direction: 'left-to-right',
  easing: 'smooth',
  cycle_seconds: 12,
  event_duration_ms: 1800,
  wave_stagger_ms: 180,
  travel_px: 6,
  scale_amount: 0.012,
  brightness_amount: 0.16,
  section_effect: 'shimmer',
  item_effect: 'none',
  price_effect: 'none',
  background_effect: 'drift',
  background_zoom_percent: 2,
  intensity: 45
});

function preset(id, name, category, description, overrides = {}) {
  return Object.freeze({ id, name, category, description, profile: Object.freeze({ ...BASE, ...overrides }) });
}

export const ANIMATION_PRESETS = Object.freeze([
  preset('fade-soft', 'Тихое дыхание', 'Ambient', 'Меню постоянно видно; фон и строки едва заметно «дышат».', {
    pattern: 'ambient', flow_direction: 'none', cycle_seconds: 18, event_duration_ms: 3200, wave_stagger_ms: 0,
    travel_px: 0, scale_amount: 0.006, brightness_amount: 0.08, section_effect: 'glow', item_effect: 'breathe',
    price_effect: 'none', background_effect: 'breathe', background_zoom_percent: 1.2, intensity: 28
  }),
  preset('slide-left', 'Световая волна слева', 'Wave', 'Мягкий акцент проходит по уже открытому меню слева направо.', {
    pattern: 'wave', flow_direction: 'left-to-right', cycle_seconds: 10, event_duration_ms: 1600, wave_stagger_ms: 220,
    travel_px: 8, scale_amount: 0.006, brightness_amount: 0.14, section_effect: 'wave', item_effect: 'wave',
    price_effect: 'glow', background_effect: 'drift', intensity: 52
  }),
  preset('slide-up', 'Вертикальная волна', 'Wave', 'Акцент поднимается снизу вверх, не скрывая строки и цены.', {
    pattern: 'wave', flow_direction: 'bottom-to-top', cycle_seconds: 11, event_duration_ms: 1700, wave_stagger_ms: 160,
    travel_px: 7, scale_amount: 0.008, brightness_amount: 0.13, section_effect: 'lift', item_effect: 'lift',
    price_effect: 'wave', background_effect: 'none', intensity: 48
  }),
  preset('cascade-soft', 'Мягкий каскад', 'Universal', 'Спокойный каскад подсветки разделов, строк и цен поверх постоянного меню.', {
    pattern: 'wave', flow_direction: 'top-to-bottom', cycle_seconds: 13, event_duration_ms: 1800, wave_stagger_ms: 250,
    travel_px: 4, scale_amount: 0.01, brightness_amount: 0.12, section_effect: 'glow', item_effect: 'focus',
    price_effect: 'glow', background_effect: 'drift', intensity: 42
  }),
  preset('zoom-focus', 'Фокус по строкам', 'Focus', 'Каждая строка на мгновение получает фокус, остальные остаются полностью видимыми.', {
    pattern: 'focus', flow_direction: 'top-to-bottom', cycle_seconds: 14, event_duration_ms: 2200, wave_stagger_ms: 400,
    travel_px: 0, scale_amount: 0.018, brightness_amount: 0.2, section_effect: 'none', item_effect: 'focus',
    price_effect: 'pulse', background_effect: 'breathe', background_zoom_percent: 1.5, intensity: 46
  }),
  preset('light-wave', 'Золотая волна', 'Premium', 'Золотой свет последовательно проходит по разделам и ценам.', {
    pattern: 'spark', flow_direction: 'left-to-right', cycle_seconds: 12, event_duration_ms: 1800, wave_stagger_ms: 260,
    travel_px: 3, scale_amount: 0.008, brightness_amount: 0.24, section_effect: 'shimmer', item_effect: 'breathe',
    price_effect: 'glow', background_effect: 'drift', intensity: 62
  }),
  preset('sections-first', 'Ритм разделов', 'Navigation', 'Только заголовки разделов периодически дают навигационный акцент.', {
    pattern: 'pulse', flow_direction: 'none', cycle_seconds: 9, event_duration_ms: 1500, wave_stagger_ms: 0,
    travel_px: 0, scale_amount: 0.014, brightness_amount: 0.14, section_effect: 'pulse', item_effect: 'none',
    price_effect: 'none', background_effect: 'none', intensity: 44
  }),
  preset('ambient-reveal', 'Живой фон', 'Ambient', 'Контент неподвижен, а глубину создаёт только очень медленное движение фона.', {
    pattern: 'parallax', flow_direction: 'none', cycle_seconds: 20, event_duration_ms: 5000, wave_stagger_ms: 0,
    travel_px: 3, scale_amount: 0, brightness_amount: 0.05, section_effect: 'none', item_effect: 'none',
    price_effect: 'none', background_effect: 'drift', background_zoom_percent: 3, intensity: 34
  }),
  preset('accent-pulse', 'Пульс акцентов', 'Promo', 'Разделы и цены синхронно пульсируют коротким спокойным импульсом.', {
    pattern: 'pulse', flow_direction: 'none', cycle_seconds: 8, event_duration_ms: 1200, wave_stagger_ms: 0,
    travel_px: 0, scale_amount: 0.02, brightness_amount: 0.18, section_effect: 'pulse', item_effect: 'none',
    price_effect: 'pulse', background_effect: 'none', intensity: 58
  }),
  preset('diagonal-cut', 'Диагональный ритм', 'Wave', 'Небольшая диагональная волна проходит по элементам без смены сцены.', {
    pattern: 'wave', flow_direction: 'alternate', cycle_seconds: 10, event_duration_ms: 1500, wave_stagger_ms: 180,
    travel_px: 8, scale_amount: 0.006, brightness_amount: 0.14, section_effect: 'wave', item_effect: 'wave',
    price_effect: 'wave', background_effect: 'drift', intensity: 54
  }),
  preset('fast-retail', 'Retail Energy', 'Dynamic', 'Быстрые короткие импульсы разделов и цен для активного digital-menu.', {
    pattern: 'spark', flow_direction: 'left-to-right', easing: 'snappy', cycle_seconds: 7, event_duration_ms: 1100,
    wave_stagger_ms: 120, travel_px: 5, scale_amount: 0.02, brightness_amount: 0.22, section_effect: 'shimmer',
    item_effect: 'focus', price_effect: 'pop', background_effect: 'none', intensity: 70
  }),
  preset('soft-premium', 'Soft Premium', 'Premium', 'Медленная дорогая пластика: лёгкий glow, дыхание строк и фона.', {
    pattern: 'ambient', flow_direction: 'none', easing: 'cinematic', cycle_seconds: 18, event_duration_ms: 3200,
    wave_stagger_ms: 0, travel_px: 0, scale_amount: 0.008, brightness_amount: 0.1, section_effect: 'glow',
    item_effect: 'breathe', price_effect: 'glow', background_effect: 'breathe', background_zoom_percent: 2, intensity: 32
  }),
  preset('stagger-lines', 'Волна по строкам', 'Navigation', 'Небольшой акцент последовательно проходит по каждой строке меню.', {
    pattern: 'wave', flow_direction: 'top-to-bottom', cycle_seconds: 12, event_duration_ms: 1500, wave_stagger_ms: 300,
    travel_px: 6, scale_amount: 0.006, brightness_amount: 0.12, section_effect: 'none', item_effect: 'wave',
    price_effect: 'glow', background_effect: 'none', intensity: 44
  }),
  preset('price-reveal', 'Ценовой ритм', 'Promo', 'Цены получают редкий акцент, не отвлекая от названий продукции.', {
    pattern: 'spark', flow_direction: 'right-to-left', cycle_seconds: 8, event_duration_ms: 900, wave_stagger_ms: 160,
    travel_px: 0, scale_amount: 0.025, brightness_amount: 0.25, section_effect: 'none', item_effect: 'none',
    price_effect: 'pulse', background_effect: 'none', intensity: 62
  }),
  preset('split-columns', 'Двойной поток', 'Dynamic', 'Строки и цены движутся микроволной в противоположном ритме.', {
    pattern: 'wave', flow_direction: 'alternate', cycle_seconds: 11, event_duration_ms: 1600, wave_stagger_ms: 200,
    travel_px: 7, scale_amount: 0.008, brightness_amount: 0.14, section_effect: 'wave', item_effect: 'wave',
    price_effect: 'wave', background_effect: 'none', intensity: 52
  }),
  preset('depth-parallax', 'Depth Parallax', 'Premium', 'Фон медленно смещается, а контент получает едва заметную глубину.', {
    pattern: 'parallax', flow_direction: 'none', easing: 'cinematic', cycle_seconds: 16, event_duration_ms: 3000,
    wave_stagger_ms: 0, travel_px: 4, scale_amount: 0.01, brightness_amount: 0.08, section_effect: 'lift',
    item_effect: 'breathe', price_effect: 'none', background_effect: 'drift', background_zoom_percent: 4, intensity: 36
  }),
  preset('glow-sweep', 'Золотой блик', 'Promo', 'Редкий световой проход по акцентным плашкам и ценам.', {
    pattern: 'spark', flow_direction: 'left-to-right', cycle_seconds: 10, event_duration_ms: 1700, wave_stagger_ms: 260,
    travel_px: 2, scale_amount: 0.006, brightness_amount: 0.3, section_effect: 'shimmer', item_effect: 'none',
    price_effect: 'glow', background_effect: 'none', intensity: 72
  }),
  preset('quick-snap', 'Quick Pulse', 'Dynamic', 'Очень короткий импульс разделов и цен с длинной спокойной паузой.', {
    pattern: 'pulse', flow_direction: 'none', easing: 'snappy', cycle_seconds: 6, event_duration_ms: 700, wave_stagger_ms: 80,
    travel_px: 0, scale_amount: 0.025, brightness_amount: 0.22, section_effect: 'pulse', item_effect: 'none',
    price_effect: 'pop', background_effect: 'none', intensity: 68
  }),
  preset('cinema-build', 'Cinema Ambient', 'Premium', 'Очень медленное кинематографичное дыхание всей композиции без появления/исчезновения.', {
    pattern: 'ambient', flow_direction: 'none', easing: 'cinematic', cycle_seconds: 24, event_duration_ms: 4200,
    wave_stagger_ms: 500, travel_px: 2, scale_amount: 0.012, brightness_amount: 0.09, section_effect: 'glow',
    item_effect: 'focus', price_effect: 'glow', background_effect: 'zoom', background_zoom_percent: 4, intensity: 30
  }),
  preset('signature-gold', 'Signature Gold', 'Signature', 'Фирменный постоянный motion: мягкий фон, золотой блик и спокойный ценовой импульс.', {
    pattern: 'spark', flow_direction: 'left-to-right', cycle_seconds: 12, event_duration_ms: 1800, wave_stagger_ms: 220,
    travel_px: 5, scale_amount: 0.014, brightness_amount: 0.2, section_effect: 'shimmer', item_effect: 'focus',
    price_effect: 'pulse', background_effect: 'drift', background_zoom_percent: 2.5, intensity: 58
  })
]);

export const PRESET_BY_ID = new Map(ANIMATION_PRESETS.map((item) => [item.id, item]));
export const DEFAULT_PRESET_ID = 'cascade-soft';

export function profileForPreset(id) {
  return { ...(PRESET_BY_ID.get(id) || PRESET_BY_ID.get(DEFAULT_PRESET_ID)).profile };
}
