import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../editor/renderer.js';
import { ScenePlaylistRuntime } from '../motion/scene-playlist-runtime.js';
import { applySceneVisibility } from '../motion/scene-visibility.js';
import { FlatMenuRenderer, playerMenuRenderMode } from './flat-menu-renderer.js';
import { SceneMotionRuntime } from '../motion/scene-motion-runtime.js';
import { PlayerSceneLayerComposer } from './scene-layer-composer.js';
import { SceneElementRenderer } from './scene-element-renderer.js';
import { SceneVideoRuntime } from './scene-video-runtime.js';
import { PlayerWeatherRuntime } from './weather-bootstrap.js';

export const ALL_PLAYER_COMPONENTS = Object.freeze([
  'screen',
  'menu',
  'scene',
  'animation',
  'scene_playlist',
  'scene_video',
  'runtime'
]);

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return { width: Number(match?.[1]) || 1920, height: Number(match?.[2]) || 1080 };
}

function fitCanonicalStage(stage, viewport) {
  const width = Math.max(1, Number(viewport?.width) || 1920);
  const height = Math.max(1, Number(viewport?.height) || 1080);
  const container = stage.parentElement;
  const containerWidth = Math.max(1, Number(container?.clientWidth) || width);
  const containerHeight = Math.max(1, Number(container?.clientHeight) || height);
  const scale = Math.min(containerWidth / width, containerHeight / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  stage.style.position = 'absolute';
  stage.style.top = '0';
  stage.style.left = '0';
  stage.style.right = 'auto';
  stage.style.bottom = 'auto';
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.minWidth = `${width}px`;
  stage.style.minHeight = `${height}px`;
  stage.style.maxWidth = 'none';
  stage.style.maxHeight = 'none';
  stage.style.flex = 'none';
  stage.style.transformOrigin = 'top left';
  stage.style.transform = `translate3d(${offsetX}px,${offsetY}px,0) scale(${scale})`;
  stage.dataset.sceneViewportWidth = String(width);
  stage.dataset.sceneViewportHeight = String(height);
  stage.dataset.sceneViewportScale = String(scale);
  stage.dataset.sceneViewportOffsetX = String(offsetX);
  stage.dataset.sceneViewportOffsetY = String(offsetY);
  return { width, height, scale, offsetX, offsetY };
}

function sceneWeatherElement(scene) {
  return Array.isArray(scene?.elements)
    ? scene.elements.find((element) => element?.enabled !== false && element?.type === 'weather') || null
    : null;
}

function weatherOnlyScene(scene) {
  const elements = Array.isArray(scene?.elements)
    ? scene.elements.filter((element) => element?.enabled !== false && element?.type === 'weather')
    : [];
  return { ...(scene || { version: 1 }), elements };
}

function weatherSettingsFromElement(element) {
  if (!element) return null;
  return {
    enabled: true,
    embedded: true,
    ...(element.weather || {}),
    position: 'top-left',
    x: 0,
    y: 0,
    width_px: Math.max(260, Math.min(760, Number(element.content_reference_width || element.width) || 420)),
    scale: 1,
    opacity: 1
  };
}

function sameOriginAsset(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, window.location.origin);
    return url.origin === window.location.origin ? url.href : '';
  } catch {
    return '';
  }
}

export class PlayerSceneRenderer {
  constructor(stage, { weatherEndpoint = '/api/device/weather', weatherPreviewEndpoint = '/api/weather/preview', autoplay = true, weatherPreview = false } = {}) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('Player scene renderer requires an HTMLElement stage.');
    this.stage = stage;
    this.stage.classList.add('player-scene-stage');
    this.autoplay = autoplay !== false;
    this.weatherPreview = weatherPreview === true;
    this.sceneLayers = new PlayerSceneLayerComposer(stage);
    this.sceneVideoRuntime = new SceneVideoRuntime(this.sceneLayers.ensure('baked', { ariaHidden: true }), {
      activityTarget: stage,
      autoplay: this.autoplay
    });
    this.sceneElementRenderer = new SceneElementRenderer(this.sceneLayers.ensure('scene', { ariaHidden: true }), {
      activityTarget: stage,
      autoplay: this.autoplay
    });
    this.flatMenuRenderer = new FlatMenuRenderer();
    this.sceneMotionRuntime = new SceneMotionRuntime(stage, { activityControlled: true });
    this.scenePlaylistRuntime = new ScenePlaylistRuntime();
    this.viewport = Object.freeze({ width: 1920, height: 1080 });
    this.viewportObserver = typeof ResizeObserver === 'function' && stage.parentElement
      ? new ResizeObserver(() => this.fitViewport())
      : null;
    this.viewportObserver?.observe(stage.parentElement);
    this.fitViewport();

    this.weatherElementId = null;
    this.weatherRuntime = new PlayerWeatherRuntime(stage, {
      endpoint: this.weatherPreview ? weatherPreviewEndpoint : weatherEndpoint,
      preview: this.weatherPreview,
      onRender: (layer) => {
        const elementId = layer?.parentElement?.dataset?.sceneElementId || this.weatherElementId;
        if (elementId) this.sceneElementRenderer.refreshContentGeometry(elementId);
      }
    });
    this.destroyed = false;
  }

  fitViewport(viewport = this.viewport) {
    if (this.destroyed) return null;
    this.viewport = Object.freeze({
      width: Math.max(1, Number(viewport?.width) || 1920),
      height: Math.max(1, Number(viewport?.height) || 1080)
    });
    return fitCanonicalStage(this.stage, this.viewport);
  }

  async render(context, changedNames = ALL_PLAYER_COMPONENTS) {
    if (this.destroyed) return;
    const dirty = new Set(changedNames?.length ? changedNames : ALL_PLAYER_COMPONENTS);
    const canonicalViewport = resolutionOf(context.screen);
    const viewportChanged = canonicalViewport.width !== this.viewport.width || canonicalViewport.height !== this.viewport.height;
    if (dirty.has('screen') || viewportChanged) this.fitViewport(canonicalViewport);
    const {
      baked: bakedLayer,
      menu: menuLayer,
      fx: fxLayer,
      content: contentLayer,
      scene: sceneElementLayer
    } = this.sceneLayers.ensureCore();

    const sceneVideoDirty = dirty.has('scene_video') || dirty.has('screen');
    const bakedActive = sceneVideoDirty
      ? await this.sceneVideoRuntime.render(context.scene_video)
      : !bakedLayer.hidden && context.scene_video?.status === 'ready';

    const menuDirty = dirty.has('menu') || dirty.has('screen');
    const motionDirty = menuDirty || dirty.has('animation') || dirty.has('scene_video');
    const playlistDirty = dirty.has('scene_playlist') || dirty.has('screen');
    let viewport = null;
    let model = null;
    let renderMode = null;

    if (menuDirty || motionDirty) {
      viewport = canonicalViewport;
      model = buildRenderModel(context.draft, viewport);
      renderMode = playerMenuRenderMode(context);
    }

    if (menuDirty) {
      const lines = buildDisplayLines(model, {
        products: context.products || [],
        packaging: context.packaging || [],
        fallbackTitle: context.screen?.name || 'Меню'
      });
      const layout = buildRenderLayout(model, lines);
      const menuSvg = buildTableSvg(model, lines, layout);
      this.stage.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
      this.stage.dataset.fontScaleEffective = String(layout.vertical.effectivePercent);
      this.stage.dataset.fontKey = layout.typography.key;
      menuLayer.dataset.renderMode = renderMode;
      try {
        await this.flatMenuRenderer.render(menuLayer, menuSvg, viewport, layout.typography);
      } catch (error) {
        console.error('Flat MIRA-TV render failed; using static DOM fallback', error);
        this.flatMenuRenderer.destroy();
        menuLayer.innerHTML = menuSvg;
        menuLayer.dataset.renderMode = 'dom-fallback';
        this.sceneMotionRuntime.reset();
      }

      this.stage.style.backgroundColor = model.settings.background_color || '#101828';
      const background = sameOriginAsset(model.settings.background_image_url);
      this.stage.style.backgroundImage = background ? `url(${JSON.stringify(background)})` : 'none';
      this.stage.style.backgroundPosition = 'center';
      this.stage.style.backgroundRepeat = 'no-repeat';
      this.stage.style.backgroundSize = 'cover';
    } else if (dirty.has('animation')) {
      menuLayer.dataset.renderMode = renderMode;
    }

    if (menuDirty || dirty.has('animation') || dirty.has('scene_video')) applySceneVisibility(this.stage, context.animation?.profile);
    menuLayer.hidden = bakedActive;

    if (dirty.has('scene') || dirty.has('scene_video') || dirty.has('screen')) {
      this.sceneElementRenderer.render(bakedActive ? weatherOnlyScene(context.scene) : context.scene);
      sceneElementLayer.setAttribute('aria-hidden', 'true');
    }

    if (dirty.has('scene') || dirty.has('screen')) {
      const weatherElement = sceneWeatherElement(context.scene);
      this.weatherElementId = weatherElement?.id || null;
      this.weatherRuntime.setLayer(weatherElement ? this.sceneElementRenderer.contentFor(weatherElement.id) : null);
      this.weatherRuntime.applyContext(weatherSettingsFromElement(weatherElement), context.screen?.id, {
        configurationChanged: true,
        menuChanged: false
      });
    }

    if (motionDirty) {
      if (bakedActive) {
        this.sceneMotionRuntime.reset();
      } else {
        this.sceneMotionRuntime.render({
          menuEnabled: renderMode === 'flat-motion',
          profile: context.animation?.profile
        });
        // Motion teardown clears inline opacity. Re-apply the shared static
        // promotion state afterwards so Preview and TV keep identical behavior.
        applySceneVisibility(this.stage, context.animation?.profile);
      }
      menuLayer.hidden = bakedActive;
    }

    if (playlistDirty) {
      this.scenePlaylistRuntime.render(context.scene_playlist, {
        menuLayer,
        contentLayer,
        fxLayer,
        autoplay: this.autoplay
      });
    }
  }

  reset() {
    if (this.destroyed) return;
    this.scenePlaylistRuntime.destroy();
    this.sceneMotionRuntime.reset();
    this.sceneVideoRuntime.reset();
    this.sceneElementRenderer.clear();
    this.flatMenuRenderer.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scenePlaylistRuntime.destroy();
    this.sceneMotionRuntime.destroy();
    this.sceneVideoRuntime.destroy();
    this.sceneElementRenderer.destroy();
    this.flatMenuRenderer.destroy();
    this.weatherRuntime.destroy();
    this.viewportObserver?.disconnect();
    this.viewportObserver = null;
    this.weatherElementId = null;
    this.stage = null;
  }
}
