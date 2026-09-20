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
import { PlayerWeatherRuntime } from './weather-bootstrap.js';

export const ALL_PLAYER_COMPONENTS = Object.freeze([
  'screen',
  'menu',
  'scene',
  'animation',
  'scene_playlist',
  'runtime'
]);

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return { width: Number(match?.[1]) || 1920, height: Number(match?.[2]) || 1080 };
}

function sceneWeatherElement(scene) {
  return Array.isArray(scene?.elements)
    ? scene.elements.find((element) => element?.enabled !== false && element?.type === 'weather') || null
    : null;
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
  constructor(stage, { weatherEndpoint = '/api/device/weather', autoplay = true, weatherPreview = false } = {}) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('Player scene renderer requires an HTMLElement stage.');
    this.stage = stage;
    this.stage.classList.add('player-scene-stage');
    this.autoplay = autoplay !== false;
    this.weatherPreview = weatherPreview === true;
    this.sceneLayers = new PlayerSceneLayerComposer(stage);
    this.sceneElementRenderer = new SceneElementRenderer(this.sceneLayers.ensure('scene', { ariaHidden: true }), {
      activityTarget: stage,
      autoplay: this.autoplay,
      weatherPreview: this.weatherPreview
    });
    this.flatMenuRenderer = new FlatMenuRenderer();
    this.sceneMotionRuntime = new SceneMotionRuntime(stage, { activityControlled: true });
    this.scenePlaylistRuntime = new ScenePlaylistRuntime();
    this.weatherRuntime = new PlayerWeatherRuntime(stage, { endpoint: weatherEndpoint });
    this.destroyed = false;
  }

  async render(context, changedNames = ALL_PLAYER_COMPONENTS) {
    if (this.destroyed) return;
    const dirty = new Set(changedNames?.length ? changedNames : ALL_PLAYER_COMPONENTS);
    const {
      menu: menuLayer,
      fx: fxLayer,
      content: contentLayer,
      scene: sceneElementLayer
    } = this.sceneLayers.ensureCore();

    const menuDirty = dirty.has('menu') || dirty.has('screen');
    const motionDirty = menuDirty || dirty.has('animation');
    const playlistDirty = dirty.has('scene_playlist') || dirty.has('screen');
    let viewport = null;
    let model = null;
    let renderMode = null;

    if (menuDirty || motionDirty) {
      viewport = resolutionOf(context.screen);
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
        await this.flatMenuRenderer.render(menuLayer, menuSvg, viewport);
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

    if (menuDirty || dirty.has('animation')) applySceneVisibility(this.stage, context.animation?.profile);

    if (dirty.has('scene')) {
      this.sceneElementRenderer.render(context.scene);
      sceneElementLayer.setAttribute('aria-hidden', 'true');
    }

    if (dirty.has('scene') || dirty.has('screen') || menuDirty) {
      const weatherElement = sceneWeatherElement(context.scene);
      if (this.weatherPreview) {
        this.weatherRuntime.setLayer(null);
      } else {
        this.weatherRuntime.setLayer(weatherElement ? this.sceneElementRenderer.contentFor(weatherElement.id) : null);
        this.weatherRuntime.applyContext(weatherSettingsFromElement(weatherElement), context.screen?.id, {
          configurationChanged: dirty.has('scene') || dirty.has('screen'),
          menuChanged: menuDirty
        });
      }
    }

    if (motionDirty) {
      this.sceneMotionRuntime.render({
        menuEnabled: renderMode === 'flat-motion',
        profile: context.animation?.profile
      });
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
    this.sceneElementRenderer.clear();
    this.flatMenuRenderer.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scenePlaylistRuntime.destroy();
    this.sceneMotionRuntime.destroy();
    this.sceneElementRenderer.destroy();
    this.flatMenuRenderer.destroy();
    this.weatherRuntime.destroy();
    this.stage = null;
  }
}
