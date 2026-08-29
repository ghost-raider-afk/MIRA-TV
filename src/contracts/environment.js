import { ValidationError } from '../shared/errors.js';

export const ENVIRONMENT_EFFECTS = Object.freeze(['none', 'aquarium']);
export const AQUARIUM_STYLES = Object.freeze(['premium', 'neon', 'reef']);

export const DEFAULT_AQUARIUM_PARAMETERS = Object.freeze({
  style: 'premium',
  intro_fill: true,
  intensity: 45,
  fish_count: 3,
  bubble_density: 35,
  plant_density: 45,
  caustics: 50,
  speed: 35
});

export const DEFAULT_ENVIRONMENT = Object.freeze({
  enabled: false,
  effect: 'none',
  parameters: DEFAULT_AQUARIUM_PARAMETERS
});

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const result = Math.max(min, Math.min(max, parsed));
  return integer ? Math.round(result) : result;
}

export function completeAquariumParameters(value = {}) {
  const source = sourceObject(value);
  return {
    style: AQUARIUM_STYLES.includes(source.style) ? source.style : DEFAULT_AQUARIUM_PARAMETERS.style,
    intro_fill: source.intro_fill !== false,
    intensity: clamp(source.intensity, DEFAULT_AQUARIUM_PARAMETERS.intensity, 0, 100, true),
    fish_count: clamp(source.fish_count, DEFAULT_AQUARIUM_PARAMETERS.fish_count, 0, 8, true),
    bubble_density: clamp(source.bubble_density, DEFAULT_AQUARIUM_PARAMETERS.bubble_density, 0, 100, true),
    plant_density: clamp(source.plant_density, DEFAULT_AQUARIUM_PARAMETERS.plant_density, 0, 100, true),
    caustics: clamp(source.caustics, DEFAULT_AQUARIUM_PARAMETERS.caustics, 0, 100, true),
    speed: clamp(source.speed, DEFAULT_AQUARIUM_PARAMETERS.speed, 10, 100, true)
  };
}

export function completeEnvironment(value = {}) {
  const source = sourceObject(value);
  const effect = ENVIRONMENT_EFFECTS.includes(source.effect) ? source.effect : DEFAULT_ENVIRONMENT.effect;
  return {
    enabled: source.enabled === true && effect !== 'none',
    effect,
    parameters: completeAquariumParameters(source.parameters)
  };
}

export function environmentInput(value) {
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError('Настройки слоя среды должны быть объектом.');
  }
  return completeEnvironment(value);
}

export function environmentFromLegacyAquarium(value = {}) {
  const source = sourceObject(value);
  return completeEnvironment({
    enabled: source.enabled === true,
    effect: source.enabled === true ? 'aquarium' : 'none',
    parameters: source
  });
}
