import { ValidationError } from '../shared/errors.js';
import {
  ANIMATION_EASINGS,
  ANIMATION_FLOW_DIRECTIONS,
  ANIMATION_PATTERNS,
  ANIMATION_PROFILE_VERSION,
  DEFAULT_ANIMATION_PROFILE,
  ITEM_EFFECTS,
  PRICE_EFFECTS,
  PROMOTION_EFFECTS,
  SECTION_EFFECTS,
  completeAnimationProfile
} from '../shared/animation-profile.js';
import { sceneEntityInput } from './scene-entity.js';
import { announcementInput } from './announcement.js';
import { brandTitleInput } from './brand-title.js';
import { environmentInput } from './environment.js';
import { scenePlaylistInput } from './scene-playlist.js';

function enumValue(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return value;
}

function numberValue(value, field, { min, max, integer = false }) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new ValidationError(`Поле «${field}» должно быть числом от ${min} до ${max}.`);
  }
  return number;
}

export function animationProfileInput(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ValidationError('Профиль анимации должен быть объектом.');
  const profile = completeAnimationProfile(source);
  return {
    motion_version: ANIMATION_PROFILE_VERSION,
    pattern: enumValue(profile.pattern, 'Характер движения', ANIMATION_PATTERNS),
    flow_direction: enumValue(profile.flow_direction, 'Направление движения', ANIMATION_FLOW_DIRECTIONS),
    easing: enumValue(profile.easing, 'Пластика движения', ANIMATION_EASINGS),
    cycle_seconds: numberValue(profile.cycle_seconds, 'Период движения', { min: 4, max: 60 }),
    event_duration_ms: numberValue(profile.event_duration_ms, 'Длительность пластики', { min: 400, max: 10000, integer: true }),
    wave_stagger_ms: numberValue(profile.wave_stagger_ms, 'Фаза между элементами', { min: 0, max: 1000, integer: true }),
    travel_px: numberValue(profile.travel_px, 'Амплитуда перемещения', { min: 0, max: 48 }),
    scale_amount: numberValue(profile.scale_amount, 'Амплитуда масштаба', { min: 0, max: 0.12 }),
    brightness_amount: numberValue(profile.brightness_amount, 'Световой акцент', { min: 0, max: 0.7 }),
    section_effect: enumValue(profile.section_effect, 'Эффект разделов', SECTION_EFFECTS),
    item_effect: enumValue(profile.item_effect, 'Эффект строк', ITEM_EFFECTS),
    price_effect: enumValue(profile.price_effect, 'Эффект цен', PRICE_EFFECTS),
    intensity: numberValue(profile.intensity, 'Интенсивность меню', { min: 0, max: 100, integer: true }),
    promotion_effect: enumValue(profile.promotion_effect, 'Эффект плашки «Акция»', PROMOTION_EFFECTS),
    promotion_intensity: numberValue(profile.promotion_intensity, 'Интенсивность акции', { min: 0, max: 100, integer: true }),
    promotion_cycle_seconds: numberValue(profile.promotion_cycle_seconds, 'Период акции', { min: 2, max: 30 }),
    promotion_event_duration_ms: numberValue(profile.promotion_event_duration_ms, 'Длительность акцента акции', { min: 300, max: 6000, integer: true }),
    promotion_travel_px: numberValue(profile.promotion_travel_px, 'Перемещение акции', { min: 0, max: 40 }),
    promotion_scale_amount: numberValue(profile.promotion_scale_amount, 'Масштаб акции', { min: 0, max: 0.25 }),
    promotion_brightness_amount: numberValue(profile.promotion_brightness_amount, 'Яркость акции', { min: 0, max: 0.8 }),
    promotion_glow_radius: numberValue(profile.promotion_glow_radius, 'Свечение акции', { min: 0, max: 48 }),
    promotion_easing: enumValue(profile.promotion_easing, 'Пластика акции', ANIMATION_EASINGS)
  };
}

export function animationSettingsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Настройки анимации должны быть объектом.');
  const enabled = body.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new ValidationError('Поле «enabled» должно быть логическим значением.');
  const presetId = typeof body.preset_id === 'string' ? body.preset_id.trim() : 'cinematic-live-menu';
  if (!/^[a-z0-9-]{1,64}$/.test(presetId)) throw new ValidationError('Идентификатор профиля указан неверно.');
  return {
    enabled,
    preset_id: presetId,
    profile: animationProfileInput(body.profile ?? DEFAULT_ANIMATION_PROFILE),
    entity: sceneEntityInput(body.entity),
    announcement: announcementInput(body.announcement),
    brand: brandTitleInput(body.brand),
    environment: environmentInput(body.environment),
    scene_playlist: scenePlaylistInput(body.scene_playlist)
  };
}

export function animationTargetScreenIds(value) {
  if (!Array.isArray(value) || value.length < 1) throw new ValidationError('Выберите хотя бы один монитор для применения анимации.');
  if (value.length > 200) throw new ValidationError('За один раз можно выбрать не более 200 мониторов.');
  const ids = [...new Set(value.map((item) => Number(item)))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new ValidationError('Список мониторов содержит некорректный идентификатор.');
  return ids;
}
