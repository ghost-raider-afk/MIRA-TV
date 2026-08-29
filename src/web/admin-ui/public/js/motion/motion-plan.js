import { composeScenePrograms, createSceneProgram } from './scene-composer.js';

const MAIN_KINDS = new Set(['section', 'item']);

const PATTERN_TUNING = Object.freeze({
  cinematic: Object.freeze({ travel: 0.32, scale: 0.18, light: 0.76, phase: 1 }),
  ambient: Object.freeze({ travel: 0, scale: 0, light: 0.46, phase: 0.6 }),
  wave: Object.freeze({ travel: 0.78, scale: 0, light: 0.62, phase: 1.25 }),
  focus: Object.freeze({ travel: 0, scale: 0.34, light: 0.82, phase: 1.45 }),
  pulse: Object.freeze({ travel: 0, scale: 0, light: 0.72, phase: 0 }),
  spark: Object.freeze({ travel: 0.12, scale: 0, light: 1, phase: 0.8 }),
  parallax: Object.freeze({ travel: 0.46, scale: 0.12, light: 0.42, phase: 0.7 })
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function tuningFor(profile) {
  return PATTERN_TUNING[profile?.pattern] || PATTERN_TUNING.cinematic;
}

function effectFor(profile, kind) {
  return kind === 'section' ? profile.section_effect : profile.item_effect;
}

function directionVector(profile, index) {
  switch (profile.flow_direction) {
    case 'right-to-left': return { x: -1, y: 0.04 };
    case 'top-to-bottom': return { x: 0.04, y: 1 };
    case 'bottom-to-top': return { x: -0.04, y: -1 };
    case 'alternate': return index % 2 === 0 ? { x: 1, y: -0.08 } : { x: -1, y: 0.08 };
    case 'none': return { x: 0, y: 0 };
    default: return { x: 1, y: 0 };
  }
}

function rowTrack(node, profile, duration) {
  if (!MAIN_KINDS.has(node.kind)) return null;
  const effect = effectFor(profile, node.kind);
  if (!effect || effect === 'none') return null;
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  const tuning = tuningFor(profile);
  const kindFactor = node.kind === 'section' ? 0.72 : 1;
  const travel = (Number(profile.travel_px) || 0) * gain * tuning.travel * kindFactor;
  const vector = directionVector(profile, node.order);
  const phaseMs = node.count > 1 ? (Number(profile.wave_stagger_ms) || 0) * node.order * tuning.phase : 0;
  return Object.freeze({
    node,
    claims: Object.freeze(['transform', 'appearance', 'opacity']),
    procedural: Object.freeze({
      kind: 'row',
      surfaceOnly: node.metadata?.surfaceOnly === true,
      pattern: profile.pattern || 'cinematic',
      phaseOffset: duration ? (phaseMs % duration) / duration : 0,
      xAmplitude: travel * vector.x,
      yAmplitude: travel * vector.y,
      scaleAmount: (Number(profile.scale_amount) || 0) * gain * tuning.scale * kindFactor,
      brightnessAmount: (Number(profile.brightness_amount) || 0) * gain * tuning.light,
      surfaceOpacity: clamp((0.035 + gain * 0.11) * kindFactor, 0, 0.16)
    }),
    timing: Object.freeze({ duration, delay: 0, easing: 'linear', loop: true })
  });
}

export function compileMenuMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Menu motion compiler requires a scene graph.');
  const profile = context.profile || context || {};
  const duration = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 8500);
  const tracks = scene.nodes.map((node) => rowTrack(node, profile, duration)).filter(Boolean);
  return createSceneProgram({ id: 'menu-motion', duration, tracks, metadata: { engine: 'mira-wasm', continuous: true, menuTextStatic: true } });
}

export function compilePromotionMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Promotion motion compiler requires a scene graph.');
  const profile = context.profile || context || {};
  const duration = Math.max(2000, Number(profile.promotion_cycle_seconds) * 1000 || 4800);
  const effect = profile.promotion_effect || 'cinematic';
  const gain = clamp(Number(profile.promotion_intensity) || 0, 0, 100) / 100;
  const activeFraction = clamp((Number(profile.promotion_event_duration_ms) || 1800) / duration, 0.18, 0.72);
  const requestedScale = Math.max(0, Number(profile.promotion_scale_amount) || 0.06);
  const scaleAmount = gain === 0 ? 0 : clamp(requestedScale * gain * 0.44, 0.01, 0.06);
  const tracks = effect === 'none' ? [] : scene.nodes.flatMap((node) => {
    if (node.kind === 'promotion') return [Object.freeze({
      node,
      claims: Object.freeze(['transform', 'appearance']),
      procedural: Object.freeze({
        kind: 'promo-badge', activeFraction, scaleAmount,
        brightnessAmount: clamp((Number(profile.promotion_brightness_amount) || 0.3) * gain, 0, 0.34),
        glowRadius: clamp((Number(profile.promotion_glow_radius) || 18) * gain, 0, 30)
      }),
      timing: Object.freeze({ duration, delay: 0, easing: 'linear', loop: true })
    })];
    if (node.kind === 'promotion-glow') return [Object.freeze({
      node,
      claims: Object.freeze(['opacity', 'appearance']),
      procedural: Object.freeze({
        kind: 'promo-glow', activeFraction,
        opacity: gain === 0 ? 0 : clamp(0.18 + gain * 0.52, 0.18, 0.70),
        glowRadius: clamp((Number(profile.promotion_glow_radius) || 18) * gain, 0, 36)
      }),
      timing: Object.freeze({ duration, delay: 0, easing: 'linear', loop: true })
    })];
    return [];
  });
  return createSceneProgram({ id: 'promotion-motion', duration, tracks, metadata: { engine: 'mira-wasm', promotionStyle: 'row-glow-pulse' } });
}

export const DEFAULT_SCENE_COMPILERS = Object.freeze([compileMenuMotionProgram, compilePromotionMotionProgram]);

export function compileMotionPlan(scene, profile) {
  return composeScenePrograms(scene, DEFAULT_SCENE_COMPILERS.map((compiler) => compiler(scene, { profile })));
}
