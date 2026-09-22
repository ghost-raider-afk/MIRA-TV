import { composeScenePrograms, createSceneProgram } from './scene-composer.js';

const MAIN_KINDS = new Set(['section', 'item']);

const PATTERN_TUNING = Object.freeze({
  cinematic: Object.freeze({ travel: 0.72, scale: 0.22, light: 0.92, phase: 1 }),
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
      surfaceOpacity: clamp((0.08 + gain * 0.18) * kindFactor, 0, 0.26)
    }),
    timing: Object.freeze({ duration, delay: 0, easing: 'linear', loop: true })
  });
}

export function compileMenuMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Menu motion compiler requires a scene graph.');
  const profile = context.profile || context || {};
  const duration = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 8500);
  const tracks = context.menuEnabled === false || profile.menu_visible === false ? [] : scene.nodes.map((node) => rowTrack(node, profile, duration)).filter(Boolean);
  return createSceneProgram({ id: 'menu-motion', duration, tracks, metadata: { engine: 'mira-wasm', continuous: true, menuTextStatic: true } });
}

export function compilePromotionMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Promotion motion compiler requires a scene graph.');
  const profile = context.profile || context || {};
  const badgeDuration = Math.max(2000, Number(profile.promotion_cycle_seconds) * 1000 || 4800);
  const rowDuration = Math.max(2000, Number(profile.promotion_row_cycle_seconds) * 1000 || badgeDuration);
  const effect = context.promotionEnabled === false || profile.promotion_visible === false || profile.promotion_effect === 'none'
    ? 'none'
    : (profile.promotion_effect || 'cinematic');

  const badgeIntensity = profile.promotion_intensity === undefined ? 72 : Number(profile.promotion_intensity);
  const badgeGain = clamp(Number.isFinite(badgeIntensity) ? badgeIntensity : 72, 0, 100) / 100;
  const badgeActiveFraction = clamp((Number(profile.promotion_event_duration_ms) || 1800) / badgeDuration, 0.18, 0.72);

  const rowIntensity = profile.promotion_row_intensity === undefined ? badgeIntensity : Number(profile.promotion_row_intensity);
  const rowGain = clamp(Number.isFinite(rowIntensity) ? rowIntensity : badgeIntensity, 0, 100) / 100;
  const rowActiveFraction = clamp((Number(profile.promotion_row_event_duration_ms) || 1800) / rowDuration, 0.12, 0.86);
  const rowGlowRadius = clamp((Number(profile.promotion_row_glow_radius) || 18) * rowGain, 0, 38);

  const shineSpeed = clamp(Number(profile.promotion_shine_speed) || 1, 0.5, 3);
  const shineFrequency = clamp(Number(profile.promotion_shine_frequency_per_minute) || 8, 2, 20);
  const shineCycle = 60000 / shineFrequency;
  const shineSweep = clamp(1550 / shineSpeed, 420, 3100);
  const shineActiveFraction = clamp(shineSweep / shineCycle, 0.06, 0.86);

  const tracks = effect === 'none' ? [] : scene.nodes.flatMap((node) => {
    const animation = node.metadata?.animation || '';
    if (node.kind === 'promotion-badge-glow') return [Object.freeze({
      node,
      claims: Object.freeze(['opacity', 'appearance', 'transform']),
      procedural: Object.freeze({
        kind: 'promo-badge-glow', animation, activeFraction: badgeActiveFraction,
        opacity: badgeGain === 0 ? 0 : clamp(0.22 + badgeGain * 0.42, 0.22, 0.64),
        brightnessAmount: clamp((Number(profile.promotion_brightness_amount) || 0.3) * badgeGain, 0, 0.34),
        glowRadius: clamp((Number(profile.promotion_glow_radius) || 18) * badgeGain, 0, 30)
      }),
      timing: Object.freeze({ duration: badgeDuration, delay: 0, easing: 'linear', loop: true })
    })];
    if (node.kind === 'promotion-badge-shine' && animation === 'shine') return [Object.freeze({
      node,
      claims: Object.freeze(['opacity', 'transform']),
      procedural: Object.freeze({
        kind: 'promo-badge-shine',
        activeFraction: shineActiveFraction,
        opacity: clamp(0.46 + badgeGain * 0.50, 0.46, 0.96),
        travelPx: Number(node.metadata?.travelPx) || 0
      }),
      timing: Object.freeze({ duration: shineCycle, delay: 0, easing: 'linear', loop: true })
    })];
    if (node.kind === 'promotion-badge-sparkle' && animation === 'shine') return [Object.freeze({
      node,
      claims: Object.freeze(['opacity', 'transform', 'appearance']),
      procedural: Object.freeze({
        kind: 'promo-badge-sparkle',
        activeFraction: shineActiveFraction,
        opacity: clamp(0.72 + badgeGain * 0.28, 0.72, 1),
        travelPx: Number(node.metadata?.travelPx) || 0,
        glowRadius: clamp(5 + badgeGain * 10, 5, 15)
      }),
      timing: Object.freeze({ duration: shineCycle, delay: 0, easing: 'linear', loop: true })
    })];
    if (node.kind === 'promotion-glow') return [Object.freeze({
      node,
      claims: Object.freeze(['opacity', 'appearance', 'transform']),
      procedural: Object.freeze({
        kind: 'promo-glow',
        animation: ['wave', 'gloss', 'fill', 'pulse', 'runner'].includes(animation) ? animation : 'wave',
        activeFraction: rowActiveFraction,
        opacity: rowGain === 0 ? 0 : clamp(0.20 + rowGain * 0.58, 0.20, 0.82),
        glowRadius: rowGlowRadius
      }),
      timing: Object.freeze({ duration: rowDuration, delay: 0, easing: 'linear', loop: true })
    })];
    return [];
  });
  return createSceneProgram({
    id: 'promotion-motion',
    duration: Math.max(badgeDuration, rowDuration, shineCycle),
    tracks,
    metadata: {
      engine: 'mira-wasm',
      promotionStyle: 'preset-surfaces',
      shineSpeed,
      shineFrequency
    }
  });
}

export const DEFAULT_SCENE_COMPILERS = Object.freeze([compileMenuMotionProgram, compilePromotionMotionProgram]);

export function compileMotionPlan(scene, profile) {
  return composeScenePrograms(scene, DEFAULT_SCENE_COMPILERS.map((compiler) => compiler(scene, { profile })));
}
