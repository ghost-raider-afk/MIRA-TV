import { applySceneStage, renderSceneLayer, updateSceneClockElements, updateSceneWeatherElements } from './renderer.js';
import { playSceneElementEntrances, transitionSceneLayer } from './animation.js';

function validScene(scene) {
  return scene && typeof scene === 'object' && Array.isArray(scene.slides) && scene.slides.length > 0 ? scene : null;
}

function preciseClock(slide) {
  return (slide?.elements || []).some((element) =>
    element?.type === 'clock' && ['seconds', 'analog'].includes(element.variant)
  );
}

function findSlideIndex(scene, id) {
  const index = scene?.slides?.findIndex((slide) => slide.id === id) ?? -1;
  return index >= 0 ? index : 0;
}

export class ScenePlaybackRuntime {
  constructor({ stage, layer, onSlideChange = null } = {}) {
    if (!(stage instanceof HTMLElement) || !(layer instanceof HTMLElement)) {
      throw new TypeError('ScenePlaybackRuntime requires stage and layer HTMLElements.');
    }
    this.stage = stage;
    this.layer = layer;
    this.onSlideChange = typeof onSlideChange === 'function' ? onSlideChange : null;
    this.scene = null;
    this.context = {};
    this.slideIndex = 0;
    this.slideTimer = null;
    this.clockTimer = null;
    this.transitioning = false;
    this.active = true;
    this.visibilityHandler = () => {
      this.syncSlideTimer();
      this.syncClockTimer();
      this.syncMediaPlayback();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  get enabled() {
    return Boolean(validScene(this.scene));
  }

  get currentSlide() {
    const scene = validScene(this.scene);
    return scene ? (scene.slides[this.slideIndex] || scene.slides[0]) : null;
  }

  rendererContext() {
    return {
      ...this.context,
      autoplayMedia: this.active && document.visibilityState !== 'hidden',
      now: new Date(),
      stageWidth: this.context?.stageWidth || this.stage.clientWidth || this.scene?.canvas_width || 1920
    };
  }

  load(scene, context = {}, { startSlideId = '', preserveSlide = false, animateEntrance = true } = {}) {
    const nextScene = validScene(scene);
    if (!nextScene) {
      this.clear();
      return false;
    }
    const previousSlideId = preserveSlide ? this.currentSlide?.id : '';
    this.scene = nextScene;
    this.context = context || {};
    this.slideIndex = findSlideIndex(nextScene, previousSlideId || startSlideId || nextScene.active_slide_id);
    this.transitioning = false;
    this.layer.classList.remove('is-hidden');
    this.renderCurrentSlide({ animateEntrance });
    this.onSlideChange?.(this.currentSlide);
    return true;
  }

  updateContext(context = {}, { weatherOnly = false } = {}) {
    this.context = context || {};
    if (!this.enabled || this.transitioning) return;
    if (weatherOnly) {
      updateSceneWeatherElements(this.layer, this.currentSlide, { weatherByElement: this.context.weatherByElement || {} });
      return;
    }
    this.renderCurrentSlide({ animateEntrance: false });
  }

  setActive(active) {
    this.active = active === true;
    this.syncSlideTimer();
    this.syncClockTimer();
    this.syncMediaPlayback();
  }

  clearSlideTimer() {
    if (this.slideTimer) clearTimeout(this.slideTimer);
    this.slideTimer = null;
  }

  clearClockTimer() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.clockTimer = null;
  }

  renderCurrentSlide({ animateEntrance = false } = {}) {
    const scene = validScene(this.scene);
    const slide = this.currentSlide;
    if (!scene || !slide) return;
    applySceneStage(this.stage, scene, slide, { constrainAspect: this.stage !== this.layer });
    renderSceneLayer(this.layer, { scene, slide, context: this.rendererContext() });
    if (animateEntrance) playSceneElementEntrances(this.layer, slide);
    this.syncMediaPlayback();
    this.syncSlideTimer();
    this.syncClockTimer();
  }

  async advanceSlide() {
    const scene = validScene(this.scene);
    if (!scene || scene.slides.length <= 1 || this.transitioning || !this.active || document.visibilityState === 'hidden') return;
    this.transitioning = true;
    this.clearSlideTimer();
    this.clearClockTimer();
    const fromSlide = this.currentSlide;
    this.slideIndex = (this.slideIndex + 1) % scene.slides.length;
    const toSlide = this.currentSlide;
    this.onSlideChange?.(toSlide);
    const sceneIdentity = scene;
    try {
      await transitionSceneLayer({
        stage: this.stage,
        layer: this.layer,
        scene,
        fromSlide,
        toSlide,
        context: this.rendererContext()
      });
    } finally {
      if (sceneIdentity !== this.scene) return;
      this.transitioning = false;
      updateSceneWeatherElements(this.layer, this.currentSlide, { weatherByElement: this.context.weatherByElement || {} });
      this.syncMediaPlayback();
      this.syncSlideTimer();
      this.syncClockTimer();
    }
  }

  syncMediaPlayback() {
    const shouldPlay = this.active && document.visibilityState !== 'hidden' && this.enabled;
    for (const video of this.layer.querySelectorAll('video')) {
      if (shouldPlay) void video.play().catch(() => undefined);
      else video.pause();
    }
  }

  syncSlideTimer() {
    this.clearSlideTimer();
    const scene = validScene(this.scene);
    if (!scene || scene.slides.length <= 1 || !this.active || this.transitioning || document.visibilityState === 'hidden') return;
    const duration = Math.max(1000, Number(this.currentSlide?.duration_ms) || 10000);
    this.slideTimer = setTimeout(() => {
      this.slideTimer = null;
      void this.advanceSlide();
    }, duration);
  }

  syncClockTimer() {
    this.clearClockTimer();
    const slide = this.currentSlide;
    if (!slide || !this.active || this.transitioning || document.visibilityState === 'hidden') return;
    const clocks = (slide.elements || []).filter((element) => element.type === 'clock');
    if (!clocks.length) return;
    const now = new Date();
    const delay = preciseClock(slide)
      ? Math.max(120, 1000 - now.getMilliseconds() + 20)
      : Math.max(1000, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20);
    this.clockTimer = setTimeout(() => {
      this.clockTimer = null;
      if (!this.active || this.transitioning || document.visibilityState === 'hidden') return;
      updateSceneClockElements(this.layer, this.currentSlide, new Date());
      this.syncClockTimer();
    }, delay);
  }

  clear() {
    this.clearSlideTimer();
    this.clearClockTimer();
    for (const video of this.layer.querySelectorAll('video')) video.pause();
    this.scene = null;
    this.context = {};
    this.slideIndex = 0;
    this.transitioning = false;
    this.layer.replaceChildren();
    this.stage.style.background = '';
    if (this.stage === this.layer) this.stage.style.aspectRatio = '';
  }

  destroy() {
    this.clear();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }
}
