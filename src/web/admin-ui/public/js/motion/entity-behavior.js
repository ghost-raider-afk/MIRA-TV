import { createSceneProgram } from './scene-composer.js';

export const BEER_GLASS_BEHAVIOR = Object.freeze({
  id: 'beer-glass-behavior',
  duration: 24000,
  states: Object.freeze(['IDLE', 'SOFT_EVENT', 'IDLE', 'SPECIAL_SCENE', 'IDLE'])
});

const MODE_DURATIONS = Object.freeze({
  none: 0,
  cinematic: 24000,
  float: 8200,
  breathe: 6800,
  sway: 7600,
  drift: 12000,
  pulse: 5200,
  toast: 9000
});

function frame(offset, { x = 0, y = 0, scale = 1, rotateDeg = 0, brightness = 1, glowRadius = 0 } = {}) {
  return Object.freeze({
    offset,
    opacity: 1,
    transform: Object.freeze({ x, y, z: 0, xPercent: null, scale, skewXDeg: 0, rotateDeg, order: 'translate-rotate-scale' }),
    appearance: Object.freeze({ brightness, glowRadius, glowColor: 'rgba(244,201,21,.46)' })
  });
}

export function beerGlassFrames() {
  return Object.freeze([
    frame(0),
    frame(0.12, { y: -2, scale: 1.006, rotateDeg: 0.3, brightness: 1.01 }),
    frame(0.24),
    frame(0.30),
    frame(0.34, { x: -4, y: -12, scale: 1.025, rotateDeg: -2.5, brightness: 1.05, glowRadius: 5 }),
    frame(0.38, { x: 3, y: -7, scale: 1.014, rotateDeg: 1.3, brightness: 1.025, glowRadius: 2 }),
    frame(0.43),
    frame(0.56),
    frame(0.61, { y: -2, scale: 1.005, rotateDeg: -0.25, brightness: 1.008 }),
    frame(0.66),
    frame(0.69),
    frame(0.73, { x: -10, y: -22, scale: 1.045, rotateDeg: -4.5, brightness: 1.08, glowRadius: 9 }),
    frame(0.77, { x: 4, y: -30, scale: 1.06, rotateDeg: 3.2, brightness: 1.11, glowRadius: 12 }),
    frame(0.81, { x: 8, y: -15, scale: 1.032, rotateDeg: 4.2, brightness: 1.055, glowRadius: 6 }),
    frame(0.86, { x: -2, y: -5, scale: 1.012, rotateDeg: -1.1, brightness: 1.02, glowRadius: 2 }),
    frame(0.90),
    frame(1)
  ]);
}

export function entityAnimationFrames(mode = 'cinematic') {
  switch (mode) {
    case 'none':
      return Object.freeze([]);
    case 'float':
      return Object.freeze([
        frame(0),
        frame(0.25, { x: 2, y: -8, rotateDeg: 0.5, brightness: 1.015 }),
        frame(0.50, { x: 0, y: -14, scale: 1.008, rotateDeg: -0.4, brightness: 1.025 }),
        frame(0.75, { x: -2, y: -7, rotateDeg: 0.35, brightness: 1.012 }),
        frame(1)
      ]);
    case 'breathe':
      return Object.freeze([
        frame(0),
        frame(0.5, { scale: 1.035, brightness: 1.045, glowRadius: 4 }),
        frame(1)
      ]);
    case 'sway':
      return Object.freeze([
        frame(0),
        frame(0.25, { x: -3, y: -3, rotateDeg: -2.2 }),
        frame(0.5),
        frame(0.75, { x: 3, y: -3, rotateDeg: 2.2 }),
        frame(1)
      ]);
    case 'drift':
      return Object.freeze([
        frame(0, { x: -8, y: 2 }),
        frame(0.33, { x: 5, y: -9, rotateDeg: 0.8, brightness: 1.015 }),
        frame(0.66, { x: 10, y: 3, rotateDeg: -0.5, brightness: 1.01 }),
        frame(1, { x: -8, y: 2 })
      ]);
    case 'pulse':
      return Object.freeze([
        frame(0),
        frame(0.42, { scale: 1.045, brightness: 1.08, glowRadius: 8 }),
        frame(0.62, { scale: 1.018, brightness: 1.025, glowRadius: 2 }),
        frame(1)
      ]);
    case 'toast':
      return Object.freeze([
        frame(0),
        frame(0.18),
        frame(0.30, { x: -8, y: -18, scale: 1.035, rotateDeg: -3.5, brightness: 1.06, glowRadius: 7 }),
        frame(0.42, { x: 4, y: -34, scale: 1.07, rotateDeg: 3.8, brightness: 1.12, glowRadius: 12 }),
        frame(0.56, { x: 7, y: -17, scale: 1.035, rotateDeg: 4.2, brightness: 1.07, glowRadius: 6 }),
        frame(0.72, { x: -2, y: -5, scale: 1.01, rotateDeg: -1, brightness: 1.015 }),
        frame(1)
      ]);
    case 'cinematic':
    default:
      return beerGlassFrames();
  }
}

function entityMode(entity, node) {
  const fromContext = entity?.animation_mode;
  if (Object.hasOwn(MODE_DURATIONS, fromContext)) return fromContext;
  const fromTarget = node?.target?.dataset?.entityAnimationMode;
  if (Object.hasOwn(MODE_DURATIONS, fromTarget)) return fromTarget;
  return 'cinematic';
}

export function compileEntityBehaviorProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Entity behavior compiler requires a scene graph.');
  const entity = context.entity || null;
  const node = scene.nodes.find((candidate) => candidate.kind === 'entity');
  const mode = entityMode(entity, node);
  const enabled = Boolean(node && entity?.visible !== false && mode !== 'none');
  const duration = MODE_DURATIONS[mode] || BEER_GLASS_BEHAVIOR.duration;
  const tracks = enabled ? [Object.freeze({
    node,
    claims: Object.freeze(['transform', 'appearance']),
    keyframes: entityAnimationFrames(mode),
    timing: Object.freeze({ duration, delay: 0, easing: 'smooth', loop: true })
  })] : [];
  const entityId = node?.target?.dataset?.entityMotion || entity?.id || 'scene-entity';
  return createSceneProgram({
    id: `scene-entity-${entityId}-${mode}`,
    duration: enabled ? duration : 0,
    tracks,
    metadata: { layer: 'entity', entityId, animationMode: mode, states: mode === 'cinematic' ? BEER_GLASS_BEHAVIOR.states : Object.freeze([mode.toUpperCase()]) }
  });
}
