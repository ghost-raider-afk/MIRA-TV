import { createSceneProgram } from './scene-composer.js';

export const BEER_GLASS_BEHAVIOR = Object.freeze({
  id: 'beer-glass-behavior',
  duration: 24000,
  states: Object.freeze(['IDLE', 'SOFT_EVENT', 'IDLE', 'SPECIAL_SCENE', 'IDLE'])
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

    // SOFT_EVENT: короткий живой отклик, затем полный возврат в базовую позу.
    frame(0.30),
    frame(0.34, { x: -4, y: -12, scale: 1.025, rotateDeg: -2.5, brightness: 1.05, glowRadius: 5 }),
    frame(0.38, { x: 3, y: -7, scale: 1.014, rotateDeg: 1.3, brightness: 1.025, glowRadius: 2 }),
    frame(0.43),

    // IDLE: объект остаётся присутствующим, но не превращается в постоянный маятник.
    frame(0.56),
    frame(0.61, { y: -2, scale: 1.005, rotateDeg: -0.25, brightness: 1.008 }),
    frame(0.66),

    // SPECIAL_SCENE: редкий более выразительный «тост» с мягкой стабилизацией.
    frame(0.69),
    frame(0.73, { x: -10, y: -22, scale: 1.045, rotateDeg: -4.5, brightness: 1.08, glowRadius: 9 }),
    frame(0.77, { x: 4, y: -30, scale: 1.06, rotateDeg: 3.2, brightness: 1.11, glowRadius: 12 }),
    frame(0.81, { x: 8, y: -15, scale: 1.032, rotateDeg: 4.2, brightness: 1.055, glowRadius: 6 }),
    frame(0.86, { x: -2, y: -5, scale: 1.012, rotateDeg: -1.1, brightness: 1.02, glowRadius: 2 }),
    frame(0.90),
    frame(1)
  ]);
}

export function compileEntityBehaviorProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Entity behavior compiler requires a scene graph.');
  const entity = context.entity || null;
  const node = scene.nodes.find((candidate) => candidate.kind === 'entity' && candidate.id === 'entity.beer-glass');
  const enabled = Boolean(node && entity?.visible !== false);
  const tracks = enabled ? [Object.freeze({
    node,
    claims: Object.freeze(['transform', 'appearance']),
    keyframes: beerGlassFrames(),
    timing: Object.freeze({ duration: BEER_GLASS_BEHAVIOR.duration, delay: 0, easing: 'smooth', loop: true })
  })] : [];
  return createSceneProgram({
    id: BEER_GLASS_BEHAVIOR.id,
    duration: BEER_GLASS_BEHAVIOR.duration,
    tracks,
    metadata: { layer: 'entity', entityId: 'beer-glass', states: BEER_GLASS_BEHAVIOR.states }
  });
}
