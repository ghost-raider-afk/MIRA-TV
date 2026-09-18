import { PlayerSceneLayerComposer } from './scene-layer-composer.js';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tableBounds(viewport = {}, settings = {}) {
  const width = Math.max(1, number(viewport.width, 1920));
  const height = Math.max(1, number(viewport.height, 1080));
  const x = clamp(number(settings.table_x, 0), 0, width);
  const y = clamp(number(settings.table_y, 0), 0, height);
  const tableWidth = clamp(number(settings.table_width_px, width), 1, Math.max(1, width - x));
  const tableHeight = clamp(number(settings.table_height_px, height), 1, Math.max(1, height - y));
  return Object.freeze({
    left: `${(x / width) * 100}%`,
    top: `${(y / height) * 100}%`,
    width: `${(tableWidth / width) * 100}%`,
    height: `${(tableHeight / height) * 100}%`
  });
}

function ensureGpuHost(layer) {
  let host = layer.querySelector(':scope > [data-gpu-menu-fx-host]');
  if (!(host instanceof HTMLElement)) {
    host = document.createElement('div');
    host.className = 'tv-player-gpu-menu-fx-host';
    host.dataset.gpuMenuFxHost = '';
    layer.prepend(host);
  }
  return host;
}

function sweepFrames(direction, opacity) {
  if (direction === 'right-to-left') {
    return [
      { transform: 'translate3d(145%,0,0)', opacity: 0 },
      { transform: 'translate3d(55%,0,0)', opacity },
      { transform: 'translate3d(-55%,0,0)', opacity },
      { transform: 'translate3d(-145%,0,0)', opacity: 0 }
    ];
  }
  if (direction === 'top-to-bottom') {
    return [
      { transform: 'translate3d(0,-145%,0)', opacity: 0 },
      { transform: 'translate3d(0,-45%,0)', opacity },
      { transform: 'translate3d(0,45%,0)', opacity },
      { transform: 'translate3d(0,145%,0)', opacity: 0 }
    ];
  }
  if (direction === 'bottom-to-top') {
    return [
      { transform: 'translate3d(0,145%,0)', opacity: 0 },
      { transform: 'translate3d(0,45%,0)', opacity },
      { transform: 'translate3d(0,-45%,0)', opacity },
      { transform: 'translate3d(0,-145%,0)', opacity: 0 }
    ];
  }
  return [
    { transform: 'translate3d(-145%,0,0)', opacity: 0 },
    { transform: 'translate3d(-55%,0,0)', opacity },
    { transform: 'translate3d(55%,0,0)', opacity },
    { transform: 'translate3d(145%,0,0)', opacity: 0 }
  ];
}

export function gpuSceneEffectPlan(profile = {}) {
  const pattern = String(profile.pattern || 'cinematic');
  const intensity = clamp(number(profile.intensity, 50), 0, 100) / 100;
  const duration = Math.max(4000, number(profile.cycle_seconds, 8.5) * 1000);
  const opacity = clamp(0.035 + intensity * 0.12, 0.035, 0.155);
  const direction = String(profile.flow_direction || 'left-to-right');

  if (pattern === 'ambient' || pattern === 'pulse') {
    return Object.freeze({
      kind: 'pulse',
      duration,
      keyframes: Object.freeze([
        Object.freeze({ transform: 'scale3d(.96,.96,1)', opacity: opacity * 0.35 }),
        Object.freeze({ transform: 'scale3d(1.04,1.04,1)', opacity }),
        Object.freeze({ transform: 'scale3d(.96,.96,1)', opacity: opacity * 0.35 })
      ])
    });
  }

  if (pattern === 'focus') {
    return Object.freeze({
      kind: 'focus',
      duration,
      keyframes: Object.freeze([
        Object.freeze({ transform: 'scale3d(.86,.86,1)', opacity: 0 }),
        Object.freeze({ transform: 'scale3d(1,1,1)', opacity }),
        Object.freeze({ transform: 'scale3d(1.12,1.12,1)', opacity: 0 })
      ])
    });
  }

  const frames = sweepFrames(direction, pattern === 'spark' ? Math.min(0.19, opacity * 1.25) : opacity);
  return Object.freeze({
    kind: pattern === 'spark' ? 'spark' : 'sweep',
    duration,
    keyframes: Object.freeze(frames.map((frame) => Object.freeze(frame)))
  });
}

export function gpuPromotionEffectPlan(profile = {}) {
  if (String(profile.promotion_effect || 'cinematic') === 'none') return null;
  const gain = clamp(number(profile.promotion_intensity, 96), 0, 100) / 100;
  if (gain <= 0) return null;
  const duration = Math.max(2000, number(profile.promotion_cycle_seconds, 4.8) * 1000);
  const activeFraction = clamp(number(profile.promotion_event_duration_ms, 1800) / duration, 0.18, 0.72);
  const peakOffset = activeFraction / 2;
  const scaleAmount = clamp(number(profile.promotion_scale_amount, 0.06) * gain * 0.44, 0.01, 0.06);
  const brightnessGain = clamp(number(profile.promotion_brightness_amount, 0.35), 0, 0.8);
  const glowGain = clamp(number(profile.promotion_glow_radius, 28) / 48, 0, 1);
  const glowOpacity = clamp(0.14 + gain * 0.42 + brightnessGain * 0.12 + glowGain * 0.12, 0.14, 0.76);
  const badgePeakOpacity = clamp(0.94 + brightnessGain * 0.075, 0.94, 1);
  return Object.freeze({
    duration,
    badgeKeyframes: Object.freeze([
      Object.freeze({ offset: 0, transform: 'scale(1)', opacity: 1 }),
      Object.freeze({ offset: peakOffset, transform: `scale(${(1 + scaleAmount).toFixed(5)})`, opacity: badgePeakOpacity }),
      Object.freeze({ offset: activeFraction, transform: 'scale(1)', opacity: 1 }),
      Object.freeze({ offset: 1, transform: 'scale(1)', opacity: 1 })
    ]),
    glowKeyframes: Object.freeze([
      Object.freeze({ offset: 0, opacity: 0 }),
      Object.freeze({ offset: peakOffset, opacity: glowOpacity }),
      Object.freeze({ offset: activeFraction, opacity: 0 }),
      Object.freeze({ offset: 1, opacity: 0 })
    ])
  });
}

export class GpuSceneRuntime {
  constructor(stage, { composer = null } = {}) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('GPU scene runtime requires an HTMLElement stage.');
    this.stage = stage;
    this.composer = composer || new PlayerSceneLayerComposer(stage);
    this.animations = [];
    this.signature = '';
    this.menuRoot = null;
    this.fullscreenSuppressed = stage.dataset.scenePlaylistFullscreen === 'true';
    const playerHost = stage.closest('[data-tv-player]');
    this.playerActive = playerHost instanceof HTMLElement && !playerHost.classList.contains('is-hidden');
    this.handlePlaylistMode = (event) => {
      this.fullscreenSuppressed = event.detail?.fullscreen === true;
      this.syncPlayback();
    };
    this.handlePlayerActivity = (event) => {
      this.playerActive = event.detail?.active === true;
      this.syncPlayback();
    };
    this.handleVisibilityChange = () => this.syncPlayback();
    this.stage.addEventListener('mira:scene-playlist-mode', this.handlePlaylistMode);
    this.stage.addEventListener('mira:player-active', this.handlePlayerActivity);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  shouldPlay() {
    return this.playerActive
      && !this.fullscreenSuppressed
      && document.visibilityState !== 'hidden';
  }

  syncPlayback() {
    const play = this.shouldPlay();
    for (const animation of this.animations) {
      if (play) animation.play();
      else animation.pause();
    }
  }

  stopAnimations() {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }

  destroy() {
    this.stopAnimations();
    this.signature = '';
    this.menuRoot = null;
    const layer = this.composer.get('fx');
    const host = layer?.querySelector(':scope > [data-gpu-menu-fx-host]');
    host?.replaceChildren();
    if (host instanceof HTMLElement) host.hidden = true;
  }

  startPromotionAnimations(profile) {
    if (profile?.promotion_visible === false) return;
    const menuLayer = this.composer.get('menu');
    if (!(menuLayer instanceof HTMLElement)) return;
    const plan = gpuPromotionEffectPlan(profile);
    if (!plan) return;
    const badges = [...menuLayer.querySelectorAll('g.promotion-badge')];
    const glows = [...menuLayer.querySelectorAll('g.promotion-row-glow')];
    for (const badge of badges) {
      badge.style.transformBox = 'fill-box';
      badge.style.transformOrigin = 'center';
      this.animations.push(badge.animate(plan.badgeKeyframes, {
        duration: plan.duration,
        easing: 'linear',
        iterations: Infinity
      }));
    }
    for (const glow of glows) {
      this.animations.push(glow.animate(plan.glowKeyframes, {
        duration: plan.duration,
        easing: 'linear',
        iterations: Infinity
      }));
    }
  }

  render({ enabled = false, profile = null, viewport = {}, settings = {} } = {}) {
    const layer = this.composer.ensure('fx', { ariaHidden: true });
    const host = ensureGpuHost(layer);
    const menuLayer = this.composer.get('menu');
    const currentMenuRoot = menuLayer?.querySelector('svg.menu-table-svg') || null;
    const signature = JSON.stringify({
      enabled: enabled === true && Boolean(profile) && profile?.menu_visible !== false,
      profile: enabled ? profile : null,
      viewport: [number(viewport.width), number(viewport.height)],
      bounds: [settings.table_x, settings.table_y, settings.table_width_px, settings.table_height_px],
      promotions: menuLayer?.querySelectorAll('g.promotion-badge').length || 0
    });
    if (signature === this.signature && currentMenuRoot === this.menuRoot) return false;
    this.signature = signature;
    this.menuRoot = currentMenuRoot;
    this.stopAnimations();
    host.replaceChildren();

    if (!enabled || !profile || profile.menu_visible === false || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      host.hidden = true;
      return true;
    }

    const bounds = tableBounds(viewport, settings);
    const container = document.createElement('div');
    container.className = 'tv-player-gpu-menu-fx';
    Object.assign(container.style, bounds);

    const plan = gpuSceneEffectPlan(profile);
    const effect = document.createElement('div');
    effect.className = `tv-player-gpu-effect is-${plan.kind}`;
    effect.dataset.gpuSceneEffect = plan.kind;
    container.append(effect);
    host.replaceChildren(container);
    host.hidden = false;

    this.animations.push(effect.animate(plan.keyframes, {
      duration: plan.duration,
      easing: plan.kind === 'pulse' ? 'ease-in-out' : 'linear',
      iterations: Infinity
    }));
    this.startPromotionAnimations(profile);
    this.syncPlayback();
    return true;
  }
}
