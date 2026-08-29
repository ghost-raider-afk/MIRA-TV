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

let introPlayed = false;

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const result = Math.max(min, Math.min(max, number));
  return integer ? Math.round(result) : result;
}

export function normaliseAquariumParameters(value = {}) {
  const source = sourceObject(value);
  return {
    style: ['premium', 'neon', 'reef'].includes(source.style) ? source.style : DEFAULT_AQUARIUM_PARAMETERS.style,
    intro_fill: source.intro_fill !== false,
    intensity: clamp(source.intensity, DEFAULT_AQUARIUM_PARAMETERS.intensity, 0, 100, true),
    fish_count: clamp(source.fish_count, DEFAULT_AQUARIUM_PARAMETERS.fish_count, 0, 8, true),
    bubble_density: clamp(source.bubble_density, DEFAULT_AQUARIUM_PARAMETERS.bubble_density, 0, 100, true),
    plant_density: clamp(source.plant_density, DEFAULT_AQUARIUM_PARAMETERS.plant_density, 0, 100, true),
    caustics: clamp(source.caustics, DEFAULT_AQUARIUM_PARAMETERS.caustics, 0, 100, true),
    speed: clamp(source.speed, DEFAULT_AQUARIUM_PARAMETERS.speed, 10, 100, true)
  };
}

export function normaliseEnvironment(value = {}) {
  const source = sourceObject(value);
  const effect = ['none', 'aquarium'].includes(source.effect) ? source.effect : 'none';
  return {
    enabled: source.enabled === true && effect !== 'none',
    effect,
    parameters: normaliseAquariumParameters(source.parameters)
  };
}

export function aquariumEnvironment(value = {}) {
  const source = sourceObject(value);
  return normaliseEnvironment({
    enabled: source.enabled === true,
    effect: source.enabled === true ? 'aquarium' : 'none',
    parameters: source
  });
}

export function aquariumParameters(value = {}) {
  const environment = normaliseEnvironment(value);
  return { enabled: environment.enabled && environment.effect === 'aquarium', ...environment.parameters };
}

function createFish(index, speed) {
  const fish = document.createElement('span');
  const factor = 0.86 + ((index % 4) * 0.11);
  const baseDuration = 25 - (speed / 100) * 10;
  fish.className = `aquarium-fish aquarium-fish-${(index % 3) + 1}`;
  fish.style.setProperty('--fish-y', `${14 + ((index * 19) % 64)}%`);
  fish.style.setProperty('--fish-delay', `${-(index * 3.7)}s`);
  fish.style.setProperty('--fish-duration', `${Math.max(9, baseDuration * factor).toFixed(2)}s`);
  fish.setAttribute('aria-hidden', 'true');
  return fish;
}

function createBubble(index, speed) {
  const bubble = document.createElement('span');
  const duration = 9 - (speed / 100) * 3;
  bubble.className = 'aquarium-bubble';
  bubble.style.setProperty('--bubble-x', `${3 + ((index * 37) % 94)}%`);
  bubble.style.setProperty('--bubble-size', `${4 + ((index * 7) % 12)}px`);
  bubble.style.setProperty('--bubble-delay', `${-(index * 0.83)}s`);
  bubble.style.setProperty('--bubble-drift', `${-16 + ((index * 11) % 32)}px`);
  bubble.style.setProperty('--bubble-duration', `${duration.toFixed(2)}s`);
  bubble.setAttribute('aria-hidden', 'true');
  return bubble;
}

function createPlant(index, side, speed) {
  const plant = document.createElement('span');
  const duration = 6 - (speed / 100) * 2;
  plant.className = `aquarium-plant aquarium-plant-${side}`;
  plant.style.setProperty('--plant-offset', `${3 + index * 4.8}%`);
  plant.style.setProperty('--plant-height', `${13 + (index % 4) * 5}%`);
  plant.style.setProperty('--plant-delay', `${-(index * 0.9)}s`);
  plant.style.setProperty('--plant-duration', `${duration.toFixed(2)}s`);
  plant.setAttribute('aria-hidden', 'true');
  return plant;
}

function setAquariumVisualVariables(layer, aquarium) {
  const intensity = aquarium.intensity / 100;
  const caustics = aquarium.caustics / 100;
  layer.style.setProperty('--aquarium-water-opacity', (0.18 + intensity * 0.28).toFixed(3));
  layer.style.setProperty('--aquarium-caustics-opacity-a', (caustics * 0.3).toFixed(3));
  layer.style.setProperty('--aquarium-caustics-opacity-b', (caustics * 0.18).toFixed(3));
  layer.style.setProperty('--aquarium-haze-opacity', intensity.toFixed(3));
  layer.style.setProperty('--aquarium-fish-opacity', (0.25 + intensity * 0.55).toFixed(3));
  layer.style.setProperty('--aquarium-fish-soft-opacity', (0.20 + intensity * 0.42).toFixed(3));
  layer.style.setProperty('--aquarium-bubble-opacity', (0.16 + intensity * 0.38).toFixed(3));
  layer.style.setProperty('--aquarium-plant-opacity', (0.14 + intensity * 0.45).toFixed(3));
  layer.style.setProperty('--caustics-a-duration', `${(30 - (aquarium.speed / 100) * 12).toFixed(2)}s`);
  layer.style.setProperty('--caustics-b-duration', `${(38 - (aquarium.speed / 100) * 15).toFixed(2)}s`);
}

function resetHostState(layer) {
  layer.classList.remove('environment-effect-aquarium', 'aquarium-style-premium', 'aquarium-style-neon', 'aquarium-style-reef', 'aquarium-intro-active', 'is-enabled');
  layer.classList.add('scene-environment-layer');
}

function renderAquariumEffect(layer, parameters, { allowIntro = true } = {}) {
  const aquarium = normaliseAquariumParameters(parameters);
  layer.classList.add('environment-effect-aquarium', `aquarium-style-${aquarium.style}`);
  setAquariumVisualVariables(layer, aquarium);

  const water = document.createElement('div');
  water.className = 'aquarium-water';
  const playIntro = allowIntro && aquarium.intro_fill && !introPlayed;
  if (playIntro) {
    water.classList.add('aquarium-water-intro');
    layer.classList.add('aquarium-intro-active');
    introPlayed = true;
  }
  water.innerHTML = '<span class="aquarium-caustics aquarium-caustics-a"></span><span class="aquarium-caustics aquarium-caustics-b"></span><span class="aquarium-depth-haze"></span>';

  const scenery = document.createElement('div');
  scenery.className = 'aquarium-scenery';
  const plantCount = Math.round((aquarium.plant_density / 100) * 5);
  for (let index = 0; index < plantCount; index += 1) {
    scenery.append(createPlant(index, 'left', aquarium.speed), createPlant(index, 'right', aquarium.speed));
  }

  const fishLayer = document.createElement('div');
  fishLayer.className = 'aquarium-fish-layer';
  for (let index = 0; index < aquarium.fish_count; index += 1) fishLayer.append(createFish(index, aquarium.speed));

  const bubbles = document.createElement('div');
  bubbles.className = 'aquarium-bubbles';
  const bubbleCount = Math.round((aquarium.bubble_density / 100) * 18);
  for (let index = 0; index < bubbleCount; index += 1) bubbles.append(createBubble(index, aquarium.speed));

  layer.append(water, scenery, fishLayer, bubbles);
}

export function renderEnvironmentLayer(layer, value, options = {}) {
  if (!(layer instanceof Element)) return null;
  const environment = normaliseEnvironment(value);
  layer.replaceChildren();
  resetHostState(layer);
  layer.classList.toggle('is-enabled', environment.enabled);
  if (!environment.enabled) return environment;

  if (environment.effect === 'aquarium') renderAquariumEffect(layer, environment.parameters, options);
  return environment;
}

export function resetEnvironmentIntro() {
  introPlayed = false;
}
