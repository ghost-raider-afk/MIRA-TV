import { ScenePlaybackRuntime } from '../scene-runtime/playback.js';

function validGraph(component) {
  const graph = component?.graph;
  return graph && typeof graph === 'object' && Array.isArray(graph.slides) && graph.slides.length > 0 ? graph : null;
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
    this.playback = new ScenePlaybackRuntime({ stage: layer, layer });
  }

  get enabled() {
    return this.playback.enabled;
  }

  rendererContext(component = this.component) {
    const graph = validGraph(component);
    return {
      catalogStatus: 'ready',
      catalogProducts: component?.catalog_products || [],
      mediaAssets: component?.media_assets || [],
      weatherByElement: component?.weather_by_element || {},
      stageWidth: this.layer.clientWidth || graph?.canvas_width || 1920
    };
  }

  setActive(active) {
    this.playback.setActive(active);
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
    this.layer.classList.remove('is-hidden');

    if (onlyDynamicDataChanged) {
      this.playback.updateContext(this.rendererContext(), { weatherOnly: true });
      return true;
    }

    this.playback.load(graph, this.rendererContext(), {
      startSlideId: graph.active_slide_id,
      preserveSlide: !revisionChanged,
      animateEntrance: revisionChanged
    });
    return true;
  }

  destroyScene() {
    this.component = null;
    this.staticSignature = '';
    this.playback.clear();
    this.layer.classList.add('is-hidden');
  }

  destroy() {
    this.component = null;
    this.staticSignature = '';
    this.playback.destroy();
    this.layer.classList.add('is-hidden');
  }
}
