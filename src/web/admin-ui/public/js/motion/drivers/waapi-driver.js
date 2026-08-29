const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.7,.2,1)',
  smooth: 'cubic-bezier(.16,1,.3,1)',
  snappy: 'cubic-bezier(.2,.9,.15,1)',
  cinematic: 'cubic-bezier(.22,.61,.36,1)',
  elastic: 'cubic-bezier(.34,1.56,.64,1)',
  'ease-in-out': 'ease-in-out',
  linear: 'linear'
});

const ALL_CLAIMS = Object.freeze(['transform', 'opacity', 'appearance']);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function translateCss(transform) {
  if (transform.xPercent !== null && transform.xPercent !== undefined) {
    return `translateX(${number(transform.xPercent).toFixed(2)}%)`;
  }
  return `translate3d(${number(transform.x).toFixed(2)}px, ${number(transform.y).toFixed(2)}px, ${number(transform.z).toFixed(2)}px)`;
}

function scaleCss(transform) { return `scale(${number(transform.scale, 1).toFixed(4)})`; }
function skewCss(transform) { return `skewX(${number(transform.skewXDeg).toFixed(2)}deg)`; }
function rotateCss(transform) { return `rotate(${number(transform.rotateDeg).toFixed(2)}deg)`; }

function transformCss(transform = {}) {
  const translate = translateCss(transform);
  const scale = scaleCss(transform);
  const skew = skewCss(transform);
  const rotate = rotateCss(transform);
  if (transform.order === 'scale-translate') return `${scale} ${translate}`;
  if (transform.order === 'translate-skew') return `${translate} ${skew}`;
  if (transform.order === 'translate-rotate-scale') return `${translate} ${rotate} ${scale}`;
  return `${translate} ${scale}${number(transform.rotateDeg) ? ` ${rotate}` : ''}${number(transform.skewXDeg) ? ` ${skew}` : ''}`;
}

function filterCss(appearance = {}) {
  const brightness = number(appearance.brightness, 1);
  const glowRadius = Math.max(0, number(appearance.glowRadius));
  const glowColor = appearance.glowColor || 'transparent';
  return glowRadius > 0
    ? `brightness(${brightness.toFixed(3)}) drop-shadow(0 0 ${glowRadius.toFixed(1)}px ${glowColor})`
    : `brightness(${brightness.toFixed(3)})`;
}

export function toWaapiKeyframe(state, claims = ALL_CLAIMS) {
  const owned = new Set(claims);
  const keyframe = { offset: state.offset };
  if (owned.has('opacity')) keyframe.opacity = state.opacity;
  if (owned.has('transform')) keyframe.transform = transformCss(state.transform);
  if (owned.has('appearance')) keyframe.filter = filterCss(state.appearance);
  return keyframe;
}

export function toWaapiTiming(timing = {}) {
  return {
    duration: number(timing.duration),
    delay: number(timing.delay),
    easing: EASING[timing.easing] || timing.easing || EASING.smooth,
    iterations: timing.loop === false ? 1 : Infinity,
    fill: 'both'
  };
}

function clockTiming(clock = {}) {
  return {
    duration: number(clock.duration),
    iterations: clock.loop === false ? 1 : Infinity,
    fill: 'both'
  };
}

export class WaapiMotionDriver {
  constructor() { this.name = 'waapi'; }
  createTrack(track) {
    if (!(track?.node?.target instanceof Element)) throw new TypeError('WAAPI track requires a DOM target.');
    return track.node.target.animate(track.keyframes.map((state) => toWaapiKeyframe(state, track.claims)), toWaapiTiming(track.timing));
  }
  createClock(root, clock) {
    if (!(root instanceof Element)) throw new TypeError('WAAPI clock requires a DOM root.');
    return root.animate([{ opacity: 1 }, { opacity: 1 }], clockTiming(clock));
  }
  play(handle) { handle?.play?.(); }
  pause(handle) { handle?.pause?.(); }
  cancel(handle) { handle?.cancel?.(); }
  seek(handle, milliseconds) { if (handle) handle.currentTime = milliseconds; }
  currentTime(handle) { return Number(handle?.currentTime) || 0; }
  playState(handle) { return handle?.playState || 'idle'; }
}
