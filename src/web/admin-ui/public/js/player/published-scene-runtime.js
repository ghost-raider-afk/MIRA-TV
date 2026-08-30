import { applySceneStage, renderSceneLayer } from '../scene-runtime/renderer.js';

function validGraph(component) {
  const graph = component?.graph;
  return graph && typeof graph === 'object' && Array.isArray(graph.slides) && graph.slides.length > 0 ? graph : null;
}

export class PublishedSceneRuntime {
  constructor(layer) {
    if (!(layer instanceof HTMLElement)) throw new TypeError('PublishedSceneRuntime requires an HTMLElement layer.');
    this.layer = layer;
    this.component = null;
    this.slideIndex = 0;
    this.timer = null;
    this.active = true;
    this.visibilityHandler = () => {
      this.syncTimer();
      this.syncMediaPlayback();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  get enabled() {
    return Boolean(validGraph(this.component));
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  setActive(active) {
    this.active = active === true;
    this.syncTimer();
    this.syncMediaPlayback();
  }

  render(component) {
    const graph = validGraph(component);
    if (!graph) {
      this.destroyScene();
      return false;
    }

    const revisionChanged = component?.revision_id !== this.component?.revision_id;
    this.component = component;
    if (revisionChanged || this.slideIndex >= graph.slides.length) this.slideIndex = 0;
    this.layer.classList.remove('is-hidden');
    this.renderCurrentSlide();
    return true;
  }

  renderCurrentSlide() {
    const graph = validGraph(this.component);
    if (!graph) return;
    const slide = graph.slides[this.slideIndex] || graph.slides[0];
    const autoplayMedia = this.active && document.visibilityState !== 'hidden';
    applySceneStage(this.layer, graph, slide, { constrainAspect: false });
    renderSceneLayer(this.layer, {
      scene: graph,
      slide,
      context: {
        catalogStatus: 'ready',
        catalogProducts: this.component?.catalog_products || [],
        mediaAssets: this.component?.media_assets || [],
        autoplayMedia,
        now: new Date(),
        stageWidth: this.layer.clientWidth || graph.canvas_width
      }
    });
    this.syncMediaPlayback();
    this.syncTimer();
  }

  syncMediaPlayback() {
    const shouldPlay = this.active && document.visibilityState !== 'hidden' && this.enabled;
    for (const video of this.layer.querySelectorAll('video')) {
      if (shouldPlay) void video.play().catch(() => undefined);
      else video.pause();
    }
  }

  syncTimer() {
    this.clearTimer();
    const graph = validGraph(this.component);
    if (!graph || graph.slides.length <= 1 || !this.active || document.visibilityState === 'hidden') return;
    const slide = graph.slides[this.slideIndex] || graph.slides[0];
    const duration = Math.max(1000, Number(slide?.duration_ms) || 10000);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active || document.visibilityState === 'hidden') return;
      this.slideIndex = (this.slideIndex + 1) % graph.slides.length;
      this.renderCurrentSlide();
    }, duration);
  }

  destroyScene() {
    this.clearTimer();
    for (const video of this.layer.querySelectorAll('video')) video.pause();
    this.component = null;
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
