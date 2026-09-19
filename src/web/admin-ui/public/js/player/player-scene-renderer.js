import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../editor/renderer.js';
import { renderSceneEntity } from '../motion/entity-editor.js';
import { renderAnnouncementLayer } from '../motion/announcement.js';
import { renderBrandTitleLayer } from '../motion/brand-title.js';
import { renderEnvironmentLayer } from '../motion/environment.js';
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
  'environment',
  'scene_playlist',
  'entity',
  'weather',
  'brand',
  'announcement',
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
    width_px: Math.max(260, Math.min(760, Number(element.width) || 420)),
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
  constructor(stage, { weatherEndpoint = '/api/device/weather', autoplay = true } = {}) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('Player scene renderer requires an HTMLElement stage.');
    this.stage = stage;
    this.autoplay = autoplay !== false;
    this.sceneLayers = new PlayerSceneLayerComposer(stage);
    this.sceneElementRenderer = new SceneElementRenderer(this.sceneLayers.ensure('scene', { ariaHidden: true }), {
      activityTarget: stage,
      autoplay: this.autoplay
    });
    this.flatMenuRenderer = new FlatMenuRenderer();
    this.sceneMotionRuntime = new SceneMotionRuntime(stage, { activityControlled: true });
    this.scenePlaylistRuntime = new ScenePlaylistRuntime();
    this.weatherRuntime = new PlayerWeatherRuntime(stage, {
      layer: this.sceneLayers.ensure('weather', { ariaLabel: 'Погода' }),
      endpoint: weatherEndpoint
    });
    this.destroyed = false;
  }

  async render(context, changedNames = ALL_PLAYER_COMPONENTS) {
    if (this.destroyed) return;
    const dirty = new Set(changedNames?.length ? changedNames : ALL_PLAYER_COMPONENTS);
    const {
      environment: environmentLayer,
      menu: menuLayer,
      fx: fxLayer,
      content: contentLayer,
      scene: sceneElementLayer,
      entity: entityLayer,
      weather: weatherLayer,
      brand: brandLayer,
      announcement: announcementLayer
    } = this.sceneLayers.ensureCore();

    const menuDirty = dirty.has('menu') || dirty.has('screen');
    const motionDirty = menuDirty || dirty.has('animation') || dirty.has('entity');
    const playlistDirty = dirty.has('scene_playlist') || dirty.has('entity') || dirty.has('screen');
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
    if (dirty.has('scene') || dirty.has('weather') || dirty.has('screen') || menuDirty) {
      const weatherElement = sceneWeatherElement(context.scene);
      if (weatherElement) {
        this.weatherRuntime.setLayer(this.sceneElementRenderer.contentFor(weatherElement.id));
        this.weatherRuntime.applyContext(weatherSettingsFromElement(weatherElement), context.screen?.id, {
          configurationChanged: dirty.has('scene') || dirty.has('screen'),
          menuChanged: menuDirty
        });
      } else {
        this.weatherRuntime.setLayer(weatherLayer);
        this.weatherRuntime.applyContext(context.weather, context.screen?.id, {
          configurationChanged: dirty.has('weather') || dirty.has('screen'),
          menuChanged: menuDirty
        });
      }
    }
    if (dirty.has('environment')) {
      renderEnvironmentLayer(environmentLayer, context.environment, { allowIntro: true });
    }
    if (dirty.has('entity')) {
      renderSceneEntity(this.stage, context.entity, { editable: false, thumbnail: !this.autoplay });
      this.stage.dispatchEvent(new CustomEvent('mira:entity-rendered'));
    }
    if (dirty.has('brand')) {
      renderBrandTitleLayer(brandLayer, context.brand);
    }
    if (dirty.has('announcement')) {
      renderAnnouncementLayer(announcementLayer, context.announcement);
    }
    weatherLayer.setAttribute('aria-hidden', context.weather?.enabled === true && !sceneWeatherElement(context.scene) ? 'false' : 'true');
    if (motionDirty) {
      this.sceneMotionRuntime.render({
        menuEnabled: renderMode === 'flat-motion',
        profile: context.animation?.profile,
        entity: context.entity
      });
    }
    if (playlistDirty) {
      this.scenePlaylistRuntime.render(context.scene_playlist, {
        menuLayer,
        contentLayer,
        fxLayer,
        entity: context.entity,
        autoplay: this.autoplay
      });
    }
    entityLayer.setAttribute('aria-hidden', 'true');
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
