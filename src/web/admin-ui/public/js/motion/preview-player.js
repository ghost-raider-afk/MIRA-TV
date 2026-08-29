import { WasmMotionDriver } from './drivers/wasm-motion-driver.js';
import { buildDomMotionScene } from './dom-scene-adapter.js';
import { DEFAULT_SCENE_COMPILERS } from './motion-plan.js';
import { compileEntityBehaviorProgram } from './entity-behavior.js';
import { SceneRuntime } from './scene-runtime.js';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} с`;
}

export class AnimationPreviewPlayer {
  constructor({ stage, timeline, timeLabel, playButton, pauseButton, replayButton, driver = null, compilers = null }) {
    this.stage = stage;
    this.timeline = timeline;
    this.timeLabel = timeLabel;
    this.playButton = playButton;
    this.pauseButton = pauseButton;
    this.replayButton = replayButton;
    this.driver = driver || new WasmMotionDriver();
    this.sceneCompilers = compilers || [...DEFAULT_SCENE_COMPILERS, compileEntityBehaviorProgram];
    this.runtime = new SceneRuntime({ root: stage, driver: this.driver, compilers: this.sceneCompilers });
    this.total = 0;
    this.raf = null;
    this.profile = null;
    this.entity = null;
    this.scene = null;
    this.plan = null;
    this.disposed = false;
    this.handleRouteDispose = () => this.destroy();
    window.addEventListener('mira:route-dispose', this.handleRouteDispose);
    this.bindControls();
  }

  bindControls() {
    this.playButton?.addEventListener('click', () => this.play());
    this.pauseButton?.addEventListener('click', () => this.pause());
    this.replayButton?.addEventListener('click', () => this.replay());
    this.timeline?.addEventListener('input', () => {
      if (!this.plan) return;
      const value = Number(this.timeline.value) / Number(this.timeline.max || 1000);
      this.seek(value * this.total);
    });
  }

  setScene(scene) { this.scene = scene || null; }

  sceneIsCurrent() {
    if (!this.scene || !this.stage || this.scene.root !== this.stage || !this.scene.nodes.length) return false;
    return this.scene.nodes.every((node) => {
      const target = node?.target;
      return target && typeof target === 'object' && 'nodeType' in target && this.stage.contains(target);
    });
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('mira:route-dispose', this.handleRouteDispose);
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.runtime.destroy();
    this.scene = null;
    this.plan = null;
    this.total = 0;
    if (this.stage) delete this.stage.dataset.motionMode;
    this.renderProgress(0);
    this.stage = null;
    this.timeline = null;
    this.timeLabel = null;
    this.playButton = null;
    this.pauseButton = null;
    this.replayButton = null;
  }

  restart(profile, entity = null, enabled = true) {
    if (this.disposed || !this.stage) return;
    this.profile = { ...profile };
    this.entity = entity ? { ...entity, transform: { ...(entity.transform || {}) } } : null;
    const intensity = clamp(Number(profile.intensity) || 0, 0, 100);
    this.stage.style.setProperty('--motion-intensity', String(intensity / 100));
    this.runtime.destroy();
    this.plan = null;
    this.scene = null;
    if (!enabled) {
      delete this.stage.dataset.motionMode;
      this.total = 0;
      this.renderProgress(0);
      return;
    }
    this.stage.dataset.motionMode = 'wasm-continuous';
    this.scene = buildDomMotionScene(this.stage);
    this.plan = this.runtime.load({
      scene: this.scene,
      context: { profile: this.profile, entity: this.entity }
    });
    this.total = this.plan.duration;
    this.runtime.play();
    this.updateProgress();
  }

  play() {
    if (!this.plan || this.disposed) return;
    this.runtime.play();
    this.updateProgress();
  }

  pause() {
    if (this.disposed) return;
    this.runtime.pause();
    this.updateProgress();
  }

  replay() {
    if (!this.plan || this.disposed) return;
    this.runtime.replay();
    this.updateProgress();
  }

  seek(milliseconds) {
    if (this.disposed) return;
    const time = this.runtime.seek(milliseconds);
    this.runtime.pause();
    this.renderProgress(time);
  }

  renderProgress(time) {
    const normalized = this.total ? ((time % this.total) + this.total) % this.total : 0;
    const value = this.total ? Math.round((normalized / this.total) * 1000) : 0;
    if (this.timeline) this.timeline.value = String(value);
    if (this.timeLabel) this.timeLabel.textContent = `${formatTime(normalized)} / ${formatTime(this.total)}`;
  }

  updateProgress() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.plan || this.disposed || !this.stage?.isConnected) return;
      this.renderProgress(this.runtime.currentTime());
      if (this.runtime.playState() === 'running') this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
