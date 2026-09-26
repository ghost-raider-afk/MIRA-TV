import { WaapiMotionDriver } from './waapi-driver.js';
import { loadMotionKernel } from '../wasm-motion-kernel.js';

const RED_GLOW = 'rgba(255,42,68,.88)';
const ROW_GLOW = 'rgba(244,201,21,.24)';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function phaseAt(time, duration) {
  if (!duration) return 0;
  const phase = (time % duration) / duration;
  return phase < 0 ? phase + 1 : phase;
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function activeProgress(phase, activeFraction) {
  const active = clamp(number(activeFraction, 0.4), 0.01, 1);
  if (phase >= active) return null;
  return smoothstep(phase / active);
}

export class WasmMotionDriver {
  constructor({ kernelLoader = loadMotionKernel } = {}) {
    this.name = 'mira-wasm';
    this.waapi = new WaapiMotionDriver();
    this.kernel = null;
    this.kernelError = null;
    this.procedural = new Set();
    this.clock = null;
    this.frame = 0;
    this.kernelPromise = Promise.resolve().then(() => kernelLoader()).then((kernel) => {
      this.kernel = kernel;
      this.ensureLoop();
      return kernel;
    }).catch((error) => {
      this.kernelError = error;
      console.error('MIRA Motion WASM kernel failed to load', error);
      return null;
    });
  }

  createTrack(track) {
    if (!track?.procedural) return { driver: 'waapi', handle: this.waapi.createTrack(track) };
    if (!(track?.node?.target instanceof Element)) throw new TypeError('WASM motion track requires a DOM target.');
    const handle = { driver: 'mira-wasm', kind: 'track', state: 'idle', track };
    this.procedural.add(handle);
    const target = track.node.target;
    const spec = track.procedural;
    if (track.claims?.includes('transform')) {
      target.style.transformBox = 'fill-box';
      target.style.transformOrigin = 'center';
    }
    if (spec.kind === 'promo-glow' && track.claims?.includes('transform') && track.claims?.includes('opacity')) {
      target.style.willChange = 'transform, opacity';
    }
    if (spec.kind === 'promo-badge-glow') {
      const brightness = 1 + number(spec.brightnessAmount, 0.16);
      const radius = number(spec.glowRadius, 16);
      target.style.transformOrigin = 'center';
      target.style.filter = radius > 0
        ? `brightness(${brightness.toFixed(3)}) drop-shadow(0 0 ${radius.toFixed(2)}px ${RED_GLOW})`
        : `brightness(${brightness.toFixed(3)})`;
    } else if (spec.kind === 'promo-badge-shine') {
      target.style.transformOrigin = 'left center';
      target.style.filter = 'none';
    } else if (spec.kind === 'promo-badge-sparkle') {
      const radius = number(spec.glowRadius, 8);
      target.style.transformOrigin = 'center';
      target.style.filter = `drop-shadow(0 0 ${radius.toFixed(2)}px rgba(255,250,210,.92))`;
    } else if (spec.kind === 'promo-glow') {
      const radius = number(spec.glowRadius, 18);
      target.style.transformOrigin = spec.animation === 'fill' ? 'left center' : 'center';
      const paintTarget = target.firstElementChild instanceof Element ? target.firstElementChild : target;
      handle.paintTarget = paintTarget;
      let filter = 'none';
      if (spec.animation === 'wave') {
        filter = `blur(${Math.max(2, radius * .28).toFixed(2)}px) saturate(1.18)`;
      } else if (spec.animation === 'gloss') {
        filter = 'brightness(1.48) blur(.55px)';
      } else if (spec.animation === 'runner') {
        filter = 'brightness(1.62) blur(.35px)';
      } else if (spec.animation === 'pulse') {
        filter = radius > 0 ? `blur(${Math.max(2, radius * .22).toFixed(2)}px) drop-shadow(0 0 ${radius.toFixed(2)}px ${RED_GLOW})` : 'none';
      } else {
        filter = radius > 0 ? `blur(2px) drop-shadow(0 0 ${radius.toFixed(2)}px ${RED_GLOW})` : 'blur(2px)';
      }
      paintTarget.style.filter = filter;
    } else if (spec.kind === 'row') {
      target.style.filter = spec.pattern === 'spark' ? `drop-shadow(0 0 10px ${ROW_GLOW})` : 'none';
    }
    return handle;
  }

  createClock(root, clock) {
    if (!(root instanceof Element)) throw new TypeError('WASM motion clock requires a DOM root.');
    const handle = {
      driver: 'mira-wasm', kind: 'clock', state: 'idle', duration: Math.max(1, number(clock?.duration, 1)),
      currentTime: 0, startedAt: 0
    };
    this.clock = handle;
    return handle;
  }

  play(handle) {
    if (!handle) return;
    if (handle.driver === 'waapi') return this.waapi.play(handle.handle);
    if (handle.kind === 'clock' && handle.state !== 'running') handle.startedAt = performance.now() - handle.currentTime;
    handle.state = 'running';
    this.ensureLoop();
  }

  pause(handle) {
    if (!handle) return;
    if (handle.driver === 'waapi') return this.waapi.pause(handle.handle);
    if (handle.kind === 'clock' && handle.state === 'running') this.updateClock(performance.now());
    handle.state = 'paused';
  }

  cancel(handle) {
    if (!handle) return;
    if (handle.driver === 'waapi') return this.waapi.cancel(handle.handle);
    handle.state = 'idle';
    if (handle.kind === 'track') {
      this.procedural.delete(handle);
      handle.track?.node?.target?.style?.removeProperty('transform');
      handle.track?.node?.target?.style?.removeProperty('filter');
      handle.track?.node?.target?.style?.removeProperty('opacity');
      handle.track?.node?.target?.style?.removeProperty('will-change');
      handle.paintTarget?.style?.removeProperty('filter');
    }
    if (handle.kind === 'clock' && this.clock === handle) this.clock = null;
    this.stopLoopIfIdle();
  }

  seek(handle, milliseconds) {
    if (!handle) return;
    if (handle.driver === 'waapi') return this.waapi.seek(handle.handle, milliseconds);
    if (handle.kind !== 'clock') return;
    handle.currentTime = Math.max(0, number(milliseconds));
    if (handle.state === 'running') handle.startedAt = performance.now() - handle.currentTime;
    this.render(handle.currentTime, { includePaused: true });
  }

  currentTime(handle) {
    if (!handle) return 0;
    if (handle.driver === 'waapi') return this.waapi.currentTime(handle.handle);
    if (handle.kind === 'clock' && handle.state === 'running') this.updateClock(performance.now());
    return number(handle.currentTime);
  }

  playState(handle) {
    if (!handle) return 'idle';
    if (handle.driver === 'waapi') return this.waapi.playState(handle.handle);
    return handle.state || 'idle';
  }

  updateClock(now) {
    if (!this.clock || this.clock.state !== 'running') return;
    this.clock.currentTime = Math.max(0, now - this.clock.startedAt);
  }

  ensureLoop() {
    if (this.frame || !this.kernel || this.kernelError) return;
    if (!this.clock || this.clock.state !== 'running') return;
    if (![...this.procedural].some((handle) => handle.state === 'running')) return;
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  stopLoopIfIdle() {
    if (!this.frame) return;
    const active = this.clock?.state === 'running' && [...this.procedural].some((handle) => handle.state === 'running');
    if (active) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  tick(now) {
    this.frame = 0;
    if (!this.clock || this.clock.state !== 'running') return;
    this.updateClock(now);
    this.render(this.clock.currentTime);
    this.ensureLoop();
  }

  render(time, { includePaused = false } = {}) {
    if (!this.kernel) return;
    for (const handle of this.procedural) {
      if (handle.state !== 'running' && !(includePaused && handle.state === 'paused')) continue;
      this.renderTrack(handle.track, time);
    }
  }

  renderTrack(track, time) {
    const spec = track.procedural;
    const duration = Math.max(1, number(track.timing?.duration, this.clock?.duration || 1));
    const phase = phaseAt(time, duration);
    const target = track.node.target;
    if (spec.kind === 'row') {
      const x = this.kernel._mira_row_x(phase, number(spec.phaseOffset), number(spec.xAmplitude));
      const y = this.kernel._mira_row_y(phase, number(spec.phaseOffset), number(spec.yAmplitude));
      const scale = this.kernel._mira_row_scale(phase, number(spec.phaseOffset), number(spec.scaleAmount));
      const brightnessAmount = number(spec.brightnessAmount);
      const brightness = this.kernel._mira_row_brightness(phase, number(spec.phaseOffset), brightnessAmount);
      if (spec.surfaceOnly) {
        const energy = brightnessAmount > 0.0001 ? clamp((brightness - 1) / brightnessAmount, 0, 1) : 0;
        const opacity = energy * number(spec.surfaceOpacity, 0.08);
        const pattern = spec.pattern || 'ambient';
        if (['wave', 'cinematic', 'parallax'].includes(pattern)) {
          target.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`;
        } else if (pattern === 'focus') {
          target.style.transform = `scale(${scale.toFixed(5)})`;
        } else {
          target.style.transform = 'none';
        }
        target.style.opacity = opacity.toFixed(4);
        return;
      }
      target.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`;
      return;
    }
    const active = number(spec.activeFraction, 0.4);
    if (spec.kind === 'promo-badge-glow') {
      if (spec.animation === 'breathe') {
        const pulse = 0.5 - 0.5 * Math.cos(Math.PI * 2 * phase);
        target.style.opacity = (number(spec.opacity, 0.6) * (0.22 + pulse * 0.58)).toFixed(4);
        target.style.transform = `scale(${(1 + pulse * 0.018).toFixed(5)})`;
        return;
      }
      const glow = this.kernel._mira_promo_glow(phase, active);
      target.style.opacity = (glow * number(spec.opacity, 0.6) * 0.36).toFixed(4);
      target.style.transform = 'none';
      return;
    }
    if (spec.kind === 'promo-badge-shine') {
      const progress = activeProgress(phase, active);
      if (progress === null) {
        target.style.opacity = '0';
        target.style.transform = 'translate3d(0,0,0)';
        return;
      }
      const envelope = Math.sin(Math.PI * progress);
      const travel = number(spec.travelPx, 100);
      target.style.opacity = (envelope * number(spec.opacity, 0.8)).toFixed(4);
      target.style.transform = `translate3d(${(progress * travel).toFixed(2)}px,0,0)`;
      return;
    }
    if (spec.kind === 'promo-badge-sparkle') {
      const progress = activeProgress(phase, active);
      if (progress === null) {
        target.style.opacity = '0';
        target.style.transform = 'translate3d(0,0,0) scale(.72)';
        return;
      }
      const travel = number(spec.travelPx, 100);
      const focus = Math.exp(-Math.pow((progress - 0.58) / 0.16, 2));
      const twinkle = 0.82 + 0.18 * Math.pow(Math.sin(progress * Math.PI * 7), 2);
      const energy = focus * twinkle;
      const scale = 0.72 + energy * 0.72;
      target.style.opacity = (energy * number(spec.opacity, 0.94)).toFixed(4);
      target.style.transform = `translate3d(${(progress * travel).toFixed(2)}px,0,0) scale(${scale.toFixed(4)})`;
      return;
    }
    if (spec.kind === 'promo-glow') {
      const progress = activeProgress(phase, active);
      if (progress === null) {
        target.style.opacity = '0';
        target.style.transform = 'none';
        return;
      }
      const envelope = Math.sin(Math.PI * progress);
      const opacity = envelope * number(spec.opacity, 0.6);
      if (spec.animation === 'fill') {
        target.style.transform = `scaleX(${Math.max(0.02, progress).toFixed(4)})`;
        target.style.opacity = (opacity * 0.72).toFixed(4);
        return;
      }
      if (spec.animation === 'pulse') {
        target.style.transform = 'none';
        target.style.opacity = (opacity * 0.82).toFixed(4);
        return;
      }
      if (spec.animation === 'wave') {
        const travel = -82 + progress * 164;
        const breathe = 0.88 + 0.12 * Math.sin(Math.PI * progress);
        target.style.transform = `translate3d(${travel.toFixed(2)}%,0,0) scaleX(${breathe.toFixed(4)})`;
        target.style.opacity = (opacity * 0.58).toFixed(4);
        return;
      }
      if (spec.animation === 'runner') {
        const travel = -340 + progress * 680;
        target.style.transform = `translate3d(${travel.toFixed(2)}%,0,0) scaleX(.045)`;
        target.style.opacity = (opacity * 1.08).toFixed(4);
        return;
      }
      const travel = -260 + progress * 520;
      target.style.transform = `translate3d(${travel.toFixed(2)}%,0,0) scaleX(.13)`;
      target.style.opacity = (opacity * .96).toFixed(4);
    }
  }
}
