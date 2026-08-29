import { WaapiMotionDriver } from './waapi-driver.js';
import { loadMotionKernel } from '../wasm-motion-kernel.js';

const RED_GLOW = 'rgba(255,48,72,.78)';
const ROW_GLOW = 'rgba(255,255,255,.28)';

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
    track.node.target.style.transformBox = 'fill-box';
    track.node.target.style.transformOrigin = 'center';
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
    this.render(handle.currentTime);
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

  render(time) {
    if (!this.kernel) return;
    for (const handle of this.procedural) {
      if (handle.state !== 'running') continue;
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
        target.style.filter = pattern === 'spark' && opacity > 0.002
          ? `brightness(${(1.08 + energy * 0.32).toFixed(3)}) drop-shadow(0 0 ${(3 + energy * 10).toFixed(2)}px ${ROW_GLOW})`
          : `brightness(${(1 + energy * 0.22).toFixed(3)})`;
        return;
      }
      target.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`;
      target.style.filter = `brightness(${brightness.toFixed(4)})`;
      return;
    }
    const active = number(spec.activeFraction, 0.4);
    if (spec.kind === 'promo-badge') {
      const scale = this.kernel._mira_promo_scale(phase, active, number(spec.scaleAmount, 0.04));
      const glow = this.kernel._mira_promo_glow(phase, active);
      target.style.transform = `scale(${scale.toFixed(5)})`;
      target.style.filter = glow > 0.001 ? `brightness(${(1 + glow * number(spec.brightnessAmount, 0.16)).toFixed(4)}) drop-shadow(0 0 ${(glow * number(spec.glowRadius, 16)).toFixed(2)}px ${RED_GLOW})` : 'brightness(1)';
      return;
    }
    if (spec.kind === 'promo-glow') {
      const glow = this.kernel._mira_promo_glow(phase, active);
      target.style.opacity = (glow * number(spec.opacity, 0.6)).toFixed(4);
      target.style.filter = glow > 0.001 && number(spec.glowRadius) > 0
        ? `drop-shadow(0 0 ${(glow * number(spec.glowRadius, 18)).toFixed(2)}px ${RED_GLOW})`
        : 'none';
    }
  }
}
