export const ANIMATION_PROFILE_VERSION = 3;
export const ANIMATION_PATTERNS = Object.freeze(['cinematic', 'ambient', 'wave', 'focus', 'pulse', 'spark', 'parallax']);
export const ANIMATION_FLOW_DIRECTIONS = Object.freeze(['none', 'left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'alternate']);
export const ANIMATION_EASINGS = Object.freeze(['standard', 'smooth', 'snappy', 'cinematic', 'elastic']);
export const SECTION_EFFECTS = Object.freeze(['none', 'glow', 'pulse', 'shimmer', 'lift', 'wave', 'cinematic']);
export const ITEM_EFFECTS = Object.freeze(['none', 'breathe', 'wave', 'focus', 'lift', 'cinematic']);
export const PROMOTION_EFFECTS = Object.freeze(['none', 'cinematic']);
export const PRICE_EFFECTS = Object.freeze(['none']);

export const DEFAULT_ANIMATION_PROFILE = Object.freeze({
  motion_version: ANIMATION_PROFILE_VERSION,
  pattern: 'cinematic',
  flow_direction: 'alternate',
  easing: 'cinematic',
  cycle_seconds: 8.5,
  event_duration_ms: 6900,
  wave_stagger_ms: 180,
  travel_px: 28,
  scale_amount: 0.042,
  brightness_amount: 0.26,
  section_effect: 'cinematic',
  item_effect: 'cinematic',
  promotion_effect: 'cinematic',
  price_effect: 'none',
  intensity: 80,
  promotion_intensity: 96,
  promotion_cycle_seconds: 4.8,
  promotion_event_duration_ms: 1800,
  promotion_travel_px: 0,
  promotion_scale_amount: 0.06,
  promotion_brightness_amount: 0.35,
  promotion_glow_radius: 28,
  promotion_easing: 'smooth'
});

function sourceObject(profile) {
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function oneOf(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function present(value, fallback) {
  return value === undefined ? fallback : value;
}

function canonicalPromotionEffect(value) {
  return value === 'none' ? 'none' : 'cinematic';
}

function canonicalPromotionEasing(value) {
  return value === 'cinematic' ? 'cinematic' : 'smooth';
}

function canonicalCurrent(source) {
  return {
    motion_version: ANIMATION_PROFILE_VERSION,
    pattern: present(source.pattern, DEFAULT_ANIMATION_PROFILE.pattern),
    flow_direction: present(source.flow_direction, DEFAULT_ANIMATION_PROFILE.flow_direction),
    easing: present(source.easing, DEFAULT_ANIMATION_PROFILE.easing),
    cycle_seconds: present(source.cycle_seconds, DEFAULT_ANIMATION_PROFILE.cycle_seconds),
    event_duration_ms: present(source.event_duration_ms, DEFAULT_ANIMATION_PROFILE.event_duration_ms),
    wave_stagger_ms: present(source.wave_stagger_ms, DEFAULT_ANIMATION_PROFILE.wave_stagger_ms),
    travel_px: present(source.travel_px, DEFAULT_ANIMATION_PROFILE.travel_px),
    scale_amount: present(source.scale_amount, DEFAULT_ANIMATION_PROFILE.scale_amount),
    brightness_amount: present(source.brightness_amount, DEFAULT_ANIMATION_PROFILE.brightness_amount),
    section_effect: present(source.section_effect, DEFAULT_ANIMATION_PROFILE.section_effect),
    item_effect: present(source.item_effect, DEFAULT_ANIMATION_PROFILE.item_effect),
    promotion_effect: canonicalPromotionEffect(present(source.promotion_effect, DEFAULT_ANIMATION_PROFILE.promotion_effect)),
    price_effect: 'none',
    intensity: present(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity),
    promotion_intensity: present(source.promotion_intensity, DEFAULT_ANIMATION_PROFILE.promotion_intensity),
    promotion_cycle_seconds: present(source.promotion_cycle_seconds, DEFAULT_ANIMATION_PROFILE.promotion_cycle_seconds),
    promotion_event_duration_ms: present(source.promotion_event_duration_ms, DEFAULT_ANIMATION_PROFILE.promotion_event_duration_ms),
    promotion_travel_px: 0,
    promotion_scale_amount: clamp(number(present(source.promotion_scale_amount, DEFAULT_ANIMATION_PROFILE.promotion_scale_amount), DEFAULT_ANIMATION_PROFILE.promotion_scale_amount), 0.03, 0.08),
    promotion_brightness_amount: clamp(number(present(source.promotion_brightness_amount, DEFAULT_ANIMATION_PROFILE.promotion_brightness_amount), DEFAULT_ANIMATION_PROFILE.promotion_brightness_amount), 0, 0.8),
    promotion_glow_radius: clamp(number(present(source.promotion_glow_radius, DEFAULT_ANIMATION_PROFILE.promotion_glow_radius), DEFAULT_ANIMATION_PROFILE.promotion_glow_radius), 0, 48),
    promotion_easing: canonicalPromotionEasing(present(source.promotion_easing, DEFAULT_ANIMATION_PROFILE.promotion_easing))
  };
}

function legacyDirection(value) {
  if (value === 'right') return 'right-to-left';
  if (value === 'up') return 'bottom-to-top';
  if (value === 'down') return 'top-to-bottom';
  if (value === 'none') return 'none';
  return 'left-to-right';
}

function legacyPattern(source) {
  if (['focus', 'zoom'].includes(source.entrance)) return 'focus';
  if (['slide', 'cascade', 'wipe', 'reveal', 'diagonal', 'split'].includes(source.entrance)) return 'wave';
  if (source.glow || source.shimmer) return 'spark';
  return 'cinematic';
}

function legacySectionEffect(source) {
  if (source.shimmer === true) return 'shimmer';
  if (source.glow === true || source.section_emphasis === 'glow') return 'glow';
  if (source.section_emphasis === 'pulse') return 'pulse';
  if (['slide', 'wipe'].includes(source.section_emphasis)) return 'wave';
  return 'cinematic';
}

function legacyItemEffect(source) {
  if (['focus', 'zoom'].includes(source.entrance)) return 'focus';
  if (['slide', 'cascade', 'wipe', 'reveal', 'diagonal', 'split'].includes(source.entrance)) return 'wave';
  return 'cinematic';
}

function migrateV2(source) {
  const intensity = clamp(number(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity), 0, 100);
  const itemEffect = oneOf(source.item_effect, ITEM_EFFECTS, source.item_effect === 'none' ? 'cinematic' : DEFAULT_ANIMATION_PROFILE.item_effect);
  return canonicalCurrent({
    pattern: oneOf(source.pattern, ANIMATION_PATTERNS, DEFAULT_ANIMATION_PROFILE.pattern),
    flow_direction: oneOf(source.flow_direction, ANIMATION_FLOW_DIRECTIONS, DEFAULT_ANIMATION_PROFILE.flow_direction),
    easing: oneOf(source.easing, ANIMATION_EASINGS, DEFAULT_ANIMATION_PROFILE.easing),
    cycle_seconds: clamp(number(source.cycle_seconds, DEFAULT_ANIMATION_PROFILE.cycle_seconds), 4, 60),
    event_duration_ms: clamp(number(source.event_duration_ms, DEFAULT_ANIMATION_PROFILE.event_duration_ms), 400, 10000),
    wave_stagger_ms: clamp(number(source.wave_stagger_ms, DEFAULT_ANIMATION_PROFILE.wave_stagger_ms), 0, 1000),
    travel_px: Math.max(18, clamp(number(source.travel_px, DEFAULT_ANIMATION_PROFILE.travel_px) * 1.65, 0, 48)),
    scale_amount: Math.max(0.03, clamp(number(source.scale_amount, DEFAULT_ANIMATION_PROFILE.scale_amount) * 1.35, 0, 0.12)),
    brightness_amount: Math.max(0.2, clamp(number(source.brightness_amount, DEFAULT_ANIMATION_PROFILE.brightness_amount) * 1.25, 0, 0.7)),
    section_effect: oneOf(source.section_effect, SECTION_EFFECTS, DEFAULT_ANIMATION_PROFILE.section_effect),
    item_effect: itemEffect,
    promotion_effect: canonicalPromotionEffect(source.promotion_effect),
    price_effect: 'none',
    intensity: Math.max(68, intensity),
    promotion_intensity: Math.max(90, intensity),
    promotion_scale_amount: 0.06,
    promotion_brightness_amount: 0.35,
    promotion_glow_radius: 28,
    promotion_easing: 'smooth'
  });
}

function migrateLegacyProfile(source) {
  const intensity = clamp(number(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity), 0, 100);
  const oldScale = number(source.scale_from, 1);
  return canonicalCurrent({
    pattern: legacyPattern(source),
    flow_direction: legacyDirection(source.direction),
    easing: oneOf(source.easing, ANIMATION_EASINGS, DEFAULT_ANIMATION_PROFILE.easing),
    cycle_seconds: clamp(number(source.ambient_speed_seconds, 10), 4, 60),
    event_duration_ms: clamp(Math.round(number(source.duration_ms, 1800) * 3.1), 800, 10000),
    wave_stagger_ms: clamp(Math.round(number(source.stagger_ms, 70) * 2.4), 0, 1000),
    travel_px: Math.max(20, clamp(Math.round(number(source.distance_px, 48) * 0.48), 0, 48)),
    scale_amount: Math.max(0.032, clamp(Math.abs(1 - oldScale) * 1.6, 0, 0.12)),
    brightness_amount: clamp(0.16 + intensity / 300, 0, 0.7),
    section_effect: legacySectionEffect(source),
    item_effect: legacyItemEffect(source),
    promotion_effect: 'cinematic',
    price_effect: 'none',
    intensity: Math.max(72, intensity),
    promotion_intensity: Math.max(92, intensity),
    promotion_scale_amount: 0.06,
    promotion_brightness_amount: 0.35,
    promotion_glow_radius: 28,
    promotion_easing: 'smooth'
  });
}

export function completeAnimationProfile(profile = {}) {
  const source = sourceObject(profile);
  if (Object.keys(source).length === 0) return canonicalCurrent(DEFAULT_ANIMATION_PROFILE);
  const version = Number(source.motion_version);
  if (version === ANIMATION_PROFILE_VERSION) return canonicalCurrent(source);
  if (version === 2) return migrateV2(source);
  return migrateLegacyProfile(source);
}
