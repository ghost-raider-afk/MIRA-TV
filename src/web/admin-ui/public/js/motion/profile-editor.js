const PROFILE_FIELDS = Object.freeze({
  pattern: ['animation-pattern', 'string'],
  flow_direction: ['animation-flow-direction', 'string'],
  easing: ['animation-easing', 'string'],
  section_effect: ['animation-section-effect', 'string'],
  item_effect: ['animation-item-effect', 'string'],
  price_effect: ['animation-price-effect', 'string'],
  intensity: ['animation-intensity', 'number'],
  travel_px: ['animation-travel', 'number'],
  scale_amount: ['animation-scale', 'number'],
  brightness_amount: ['animation-brightness', 'number'],
  cycle_seconds: ['animation-cycle', 'number'],
  wave_stagger_ms: ['animation-stagger', 'number'],
  event_duration_ms: ['animation-event-duration', 'number'],
  promotion_effect: ['animation-promotion-effect', 'string'],
  promotion_easing: ['animation-promotion-easing', 'string'],
  promotion_intensity: ['animation-promotion-intensity', 'number'],
  promotion_scale_amount: ['animation-promotion-scale', 'number'],
  promotion_brightness_amount: ['animation-promotion-brightness', 'number'],
  promotion_glow_radius: ['animation-promotion-glow', 'number'],
  promotion_travel_px: ['animation-promotion-travel', 'number'],
  promotion_cycle_seconds: ['animation-promotion-cycle', 'number'],
  promotion_event_duration_ms: ['animation-promotion-duration', 'number']
});

export const DEFAULT_LIVE_PROFILE = Object.freeze({
  motion_version: 3,
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
  price_effect: 'none',
  intensity: 80,
  promotion_effect: 'cinematic',
  promotion_intensity: 96,
  promotion_cycle_seconds: 4.8,
  promotion_event_duration_ms: 1800,
  promotion_travel_px: 0,
  promotion_scale_amount: 0.06,
  promotion_brightness_amount: 0.35,
  promotion_glow_radius: 28,
  promotion_easing: 'smooth'
});

const OUTPUTS = Object.freeze({
  'animation-intensity-output': () => `${Math.round(numberValue('animation-intensity'))}%`,
  'animation-travel-output': () => `${Math.round(numberValue('animation-travel'))} px`,
  'animation-scale-output': () => `${(numberValue('animation-scale') * 100).toFixed(1)}%`,
  'animation-brightness-output': () => `${Math.round(numberValue('animation-brightness') * 100)}%`,
  'animation-cycle-output': () => `${numberValue('animation-cycle').toFixed(1)} с`,
  'animation-stagger-output': () => `${Math.round(numberValue('animation-stagger'))} мс`,
  'animation-event-duration-output': () => `${Math.round(numberValue('animation-event-duration'))} мс`,
  'animation-promotion-intensity-output': () => `${Math.round(numberValue('animation-promotion-intensity'))}%`,
  'animation-promotion-scale-output': () => `${Math.round(numberValue('animation-promotion-scale') * 100)}%`,
  'animation-promotion-brightness-output': () => `${Math.round(numberValue('animation-promotion-brightness') * 100)}%`,
  'animation-promotion-glow-output': () => `${Math.round(numberValue('animation-promotion-glow'))} px`,
  'animation-promotion-cycle-output': () => `${numberValue('animation-promotion-cycle').toFixed(1)} с`,
  'animation-promotion-duration-output': () => `${Math.round(numberValue('animation-promotion-duration'))} мс`
});

function node(id) { return document.getElementById(id); }
function numberValue(id) { const value = Number(node(id)?.value); return Number.isFinite(value) ? value : 0; }
function clamp(value, minimum, maximum) { const number = Number(value); return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : minimum)); }

function canonicalStudioProfile(source = {}) {
  const profile = { ...DEFAULT_LIVE_PROFILE, ...(source || {}) };
  profile.price_effect = 'none';
  profile.promotion_effect = profile.promotion_effect === 'none' ? 'none' : 'cinematic';
  profile.promotion_easing = profile.promotion_easing === 'cinematic' ? 'cinematic' : 'smooth';
  profile.promotion_scale_amount = clamp(profile.promotion_scale_amount, 0.03, 0.08);
  profile.promotion_travel_px = 0;
  return profile;
}

function updateOutputs() {
  for (const [id, render] of Object.entries(OUTPUTS)) {
    const output = node(id);
    if (output) output.textContent = render();
  }
}

export function readMotionProfile() {
  const profile = { motion_version: 3 };
  for (const [key, [id, type]] of Object.entries(PROFILE_FIELDS)) {
    const control = node(id);
    if (!control) continue;
    profile[key] = type === 'number' ? Number(control.value) : control.value;
  }
  return canonicalStudioProfile(profile);
}

export function writeMotionProfile(source = {}) {
  const profile = canonicalStudioProfile(source);
  for (const [key, [id]] of Object.entries(PROFILE_FIELDS)) {
    const control = node(id);
    if (control && profile[key] !== undefined) control.value = String(profile[key]);
  }
  updateOutputs();
}

export function bindMotionProfileControls(onChange) {
  const listener = typeof onChange === 'function' ? onChange : () => {};
  const ids = [...new Set(Object.values(PROFILE_FIELDS).map(([id]) => id))];
  ids.forEach((id) => {
    const control = node(id);
    if (!control) return;
    const eventName = control instanceof HTMLSelectElement ? 'change' : 'input';
    control.addEventListener(eventName, () => { updateOutputs(); listener(readMotionProfile()); });
  });
  updateOutputs();
}
