import {
  applySceneStage,
  renderSceneLayer,
  updateSceneClockElements,
  updateSceneWeatherElements
} from '../scene-runtime/renderer.js';

function validGraph(component) {
  const graph = component?.graph;
  return graph && typeof graph === 'object' && Array.isArray(graph.slides) && graph.slides.length > 0 ? graph : null;
}

function activeSlide(runtime) {
  const graph = validGraph(runtime.component);
  return graph ? (graph.slides[runtime.slideIndex] || graph.slides[0]) : null;
}

function preciseClock(slide) {
  return (slide?.elements || []).some((element) =>
    element?.type === 'clock' && ['seconds', 'analog'].includes(element.variant)
  );
}

function staticDataSignature(component) {
  return JSON.stringify({
    revision_id: component?.revision_id || '',
    catalog_products: component?.catalog_products || [],
    media_assets: component?.media_assets || []
  });
}

export class PublishedSceneRuntime {
  constructor(layer) {
    if (!(layer instanceof HTMLElement)) throw new TypeError('PublishedSceneRuntime requires an HTMLElement layer.');
    this.layer = layer;
    this.component = null;
    this.staticSignature = '';
    this.slideIndex = 0;
    this.slideTimer = null;
    this.clockTimer = null;
    this.active = true;
    this.visibilityHandler = () => {
      this.syncSlideTimer();
      this.syncClockTimer();
      this.syncMediaPlayback();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  get enabled() {
    return Boolean(validGraph(this.component));
  }

  clearSlideTimer() {
    if (this.slideTimer) clearTimeout(this.slideTimer);
    this.slideTimer = null;
  }

  clearClockTimer() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.clockTimer = null;
  }

  setActive(active) {
    this.active = active === true;
    this.syncSlideTimer();
    this.syncClockTimer();
    this.syncMediaPlayback();
  }

  render(component) {
    const graph = validGraph(component);
    if (!graph) {
      this.destroyScene();
      return false;
    }

    const revisionChanged = component?.revision_id !== this.component?.revision_id;
    const nextStaticSignature = staticDataSignature(component);
    const onlyDynamicDataChanged = !revisionChanged && this.component && nextStaticSignature === this.staticSignature;
    this.component = component;
    this.staticSignature = nextStaticSignature;
    if (revisionChanged || this.slideIndex >= graph.slides.length) this.slideIndex = 0;
    this.layer.classList.remove('is-hidden');

    if (onlyDynamicDataChanged) {
      updateSceneWeatherElements(this.layer, activeSlide(this), { weatherByElement: component?.weather_by_element || {} });
      this.syncClockTimer();
      this.syncMediaPlayback();
      return true;
    }

    this.renderCurrentSlide();
    return true;
  }

  renderCurrentSlide() {
    const graph = validGraph(this.component);
    if (!graph) return;
    const slide = activeSlide(this);
    const autoplayMedia = this.active && document.visibilityState !== 'hidden';
    applySceneStage(this.layer, graph, slide, { constrainAspect: false });
    renderSceneLayer(this.layer, {
      scene: graph,
      slide,
      context: {
        catalogStatus: 'ready',
        catalogProducts: this.component?.catalog_products || [],
        mediaAssets: this.component?.media_assets || [],
        weatherByElement: this.component?.weather_by_element || {},
        autoplayMedia,
        now: new Date(),
        stageWidth: this.layer.clientWidth || graph.canvas_width
      }
    });
    this.syncMediaPlayback();
    this.syncSlideTimer();
    this.syncClockTimer();
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
    const graph = validGraph(this.component);
    if (!graph || graph.slides.length <= 1 || !this.active || document.visibilityState === 'hidden') return;
    const slide = activeSlide(this);
    const duration = Math.max(1000, Number(slide?.duration_ms) || 10000);
    this.slideTimer = setTimeout(() => {
      this.slideTimer = null;
      if (!this.active || document.visibilityState === 'hidden') return;
      this.slideIndex = (this.slideIndex + 1) % graph.slides.length;
      this.renderCurrentSlide();
    }, duration);
  }

  syncClockTimer() {
    this.clearClockTimer();
    const slide = activeSlide(this);
    if (!slide || !this.active || document.visibilityState === 'hidden') return;
    const clocks = (slide.elements || []).filter((element) => element.type === 'clock');
    if (!clocks.length) return;
    const now = new Date();
    const delay = preciseClock(slide)
      ? Math.max(120, 1000 - now.getMilliseconds() + 20)
      : Math.max(1000, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20);
    this.clockTimer = setTimeout(() => {
      this.clockTimer = null;
      const current = activeSlide(this);
      if (!current || !this.active || document.visibilityState === 'hidden') return;
      updateSceneClockElements(this.layer, current, new Date());
      this.syncClockTimer();
    }, delay);
  }

  destroyScene() {
    this.clearSlideTimer();
    this.clearClockTimer();
    for (const video of this.layer.querySelectorAll('video')) video.pause();
    this.component = null;
    this.staticSignature = '';
    this.slideIndex = 0;
    this.layer.replaceChildren();
    this.layer.style.background = '';
    this.layer.style.aspectRatio = '';
    this.layer.classList.add('is-hidden');
  }

  destroy() {
    this.destroyScene();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }
}
