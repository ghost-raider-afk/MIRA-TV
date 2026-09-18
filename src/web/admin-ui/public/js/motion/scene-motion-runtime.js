import { buildDomMotionScene } from './dom-scene-adapter.js';
import { WasmMotionDriver } from './drivers/wasm-motion-driver.js';
import { compileEntityBehaviorProgram } from './entity-behavior.js';
import { DEFAULT_SCENE_COMPILERS } from './motion-plan.js';
import { SceneRuntime } from './scene-runtime.js';

export class SceneMotionRuntime {
  constructor(stage, { activityControlled = false, driver = null, compilers = null } = {}) {
    if (!(stage instanceof Element)) throw new TypeError('Scene motion runtime requires a stage element.');
    this.stage = stage;
    this.activityControlled = activityControlled === true;
    this.driver = driver || new WasmMotionDriver();
    this.compilers = compilers || [...DEFAULT_SCENE_COMPILERS, compileEntityBehaviorProgram];
    this.runtime = new SceneRuntime({ root: stage, driver: this.driver, compilers: this.compilers });
    this.plan = null;
    this.scene = null;
    this.entityMedia = null;
    this.fullscreenSuppressed = stage.dataset.scenePlaylistFullscreen === 'true';
    this.playerActive = this.activityControlled ? stage.dataset.playerActive === 'true' : true;
    this.destroyed = false;

    this.handlePlaylistMode = (event) => {
      this.fullscreenSuppressed = event.detail?.fullscreen === true;
      this.syncPlayback();
    };
    this.handlePlayerActivity = (event) => {
      if (!this.activityControlled) return;
      this.playerActive = event.detail?.active === true;
      this.syncPlayback();
    };
    this.handleVisibilityChange = () => this.syncPlayback();

    stage.addEventListener('mira:scene-playlist-mode', this.handlePlaylistMode);
    stage.addEventListener('mira:player-active', this.handlePlayerActivity);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  motionShouldPlay() {
    return this.playerActive
      && !this.fullscreenSuppressed
      && document.visibilityState !== 'hidden'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches !== true;
  }

  mediaShouldPlay() {
    return this.playerActive
      && !this.fullscreenSuppressed
      && document.visibilityState !== 'hidden';
  }

  syncPlayback() {
    if (this.plan?.tracks?.length) {
      if (this.motionShouldPlay()) this.runtime.play();
      else this.runtime.pause();
    }
    if (this.entityMedia instanceof HTMLVideoElement) {
      if (this.mediaShouldPlay()) void this.entityMedia.play().catch(() => undefined);
      else this.entityMedia.pause();
    }
  }

  reset() {
    this.runtime.destroy();
    this.plan = null;
    this.scene = null;
    if (this.entityMedia instanceof HTMLVideoElement) this.entityMedia.pause();
    this.entityMedia = null;
    delete this.stage.dataset.motionMode;
  }

  render({ profile = null, entity = null, menuEnabled = false } = {}) {
    if (this.destroyed) return null;
    this.runtime.destroy();
    this.scene = buildDomMotionScene(this.stage);
    this.plan = this.runtime.load({
      scene: this.scene,
      context: { profile: profile || {}, entity, menuEnabled: menuEnabled === true }
    });
    this.entityMedia = this.stage.querySelector('[data-motion-entity-layer] .animation-scene-entity-media');
    if (!(this.entityMedia instanceof HTMLVideoElement)) this.entityMedia = null;

    if (this.plan.tracks.length) this.stage.dataset.motionMode = 'wasm-continuous';
    else delete this.stage.dataset.motionMode;
    this.syncPlayback();
    return this.plan;
  }

  play() {
    if (!this.plan?.tracks?.length || this.destroyed) return;
    this.runtime.play();
  }

  pause() {
    if (this.destroyed) return;
    this.runtime.pause();
    if (this.entityMedia instanceof HTMLVideoElement) this.entityMedia.pause();
  }

  replay() {
    if (!this.plan?.tracks?.length || this.destroyed) return;
    this.runtime.replay();
  }

  seek(milliseconds) {
    if (this.destroyed) return 0;
    return this.runtime.seek(milliseconds);
  }

  currentTime() {
    return this.runtime.currentTime();
  }

  playState() {
    return this.runtime.playState();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stage.removeEventListener('mira:scene-playlist-mode', this.handlePlaylistMode);
    this.stage.removeEventListener('mira:player-active', this.handlePlayerActivity);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.reset();
  }
}
