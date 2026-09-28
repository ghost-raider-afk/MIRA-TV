import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../editor/renderer.js';
import { FlatMenuRenderer } from './flat-menu-renderer.js';
import { PlayerSceneLayerComposer } from './scene-layer-composer.js';
import { SceneElementRenderer } from './scene-element-renderer.js';
import { PlayerWeatherRuntime } from './weather-bootstrap.js';
import { resolveMenuThemeRuntime } from './menu-theme-runtime.js';
import { MenuThemeRenderer } from './menu-theme-renderer.js';

export const ALL_PLAYER_COMPONENTS = Object.freeze([
  'screen',
  'menu',
  'scene',
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

function themeWeatherSettingsFromRuntime(runtime, sourceScene) {
  if (!runtime || runtime.preset?.id === 'legacy' || runtime.theme?.utility_slot?.mode !== 'weather') return null;
  const utility = runtime.theme.utility_slot;
  let source = utility.weather && typeof utility.weather === 'object' ? utility.weather : {};
  const hasCoordinates = source.latitude !== null
    && source.latitude !== ''
    && source.longitude !== null
    && source.longitude !== ''
    && Number.isFinite(Number(source.latitude))
    && Number.isFinite(Number(source.longitude));

  if (!hasCoordinates && utility.weather_element_id) {
    const elements = Array.isArray(sourceScene?.elements) ? sourceScene.elements : [];
    const legacy = elements.find((element) =>
      element?.id === utility.weather_element_id && element?.type === 'weather'
    );
    if (legacy?.weather) source = { ...source, ...legacy.weather };
  }

  return {
    enabled:true,
    embedded:true,
    ...source,
    position:'top-left',
    x:0,
    y:0,
    scale:1,
    opacity:1,
    temperature_font_family:utility.temperature_font_family,
    temperature_font_size_pt:utility.temperature_font_size_pt,
    location_font_size_pt:utility.location_font_size_pt,
    icon_scale_percent:utility.icon_scale_percent,
    show_condition:source.show_condition !== false,
    show_feels_like:false,
    show_humidity:false,
    show_wind:false,
    show_forecast:source.show_forecast !== false,
    forecast_items:Number(source.forecast_items) || Number(runtime.preset?.weather?.forecast_items) || 3
  };
}

function themeWeatherEndpoint(endpoint) {
  const source = String(endpoint || '/api/device/weather');
  return source.includes('?') ? `${source}&source=theme` : `${source}?source=theme`;
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
  constructor(stage, { weatherEndpoint = '/api/device/weather', weatherPreviewEndpoint = '/api/weather/preview', weatherPreview = false } = {}) {
    if (!(stage instanceof HTMLElement)) throw new TypeError('Player scene renderer requires an HTMLElement stage.');
    this.stage = stage;
    this.stage.classList.add('player-scene-stage');
    this.weatherPreview = weatherPreview === true;
    this.sceneLayers = new PlayerSceneLayerComposer(stage);
    this.themeRenderer = new MenuThemeRenderer(this.sceneLayers.ensure('theme', { ariaHidden:true }));
    this.sceneElementRenderer = new SceneElementRenderer(this.sceneLayers.ensure('scene', { ariaHidden:true }));
    this.flatMenuRenderer = new FlatMenuRenderer();
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
    this.themeWeatherRuntime = new PlayerWeatherRuntime(stage, {
      endpoint:this.weatherPreview ? weatherPreviewEndpoint : themeWeatherEndpoint(weatherEndpoint),
      preview:this.weatherPreview,
      renderWidget:(layer, settings, snapshot) => this.themeRenderer.renderWeather(layer, settings, snapshot)
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
      menu:menuLayer,
      theme:themeLayer,
      scene:sceneElementLayer
    } = this.sceneLayers.ensureCore();

    const themeRuntime = resolveMenuThemeRuntime(
      context.draft?.settings || {},
      context.scene || { version:1,elements:[] },
      canonicalViewport
    );
    this.stage.dataset.menuTheme = themeRuntime.theme.preset_id;
    themeLayer.dataset.menuTheme = themeRuntime.theme.preset_id;

    const menuDirty = dirty.has('menu') || dirty.has('screen');
    if (menuDirty) {
      const themedDraft = { ...(context.draft || {}), settings:themeRuntime.settings };
      const model = buildRenderModel(themedDraft, canonicalViewport);
      const lines = buildDisplayLines(model, {
        products:context.products || [],
        packaging:context.packaging || [],
        fallbackTitle:context.screen?.name || 'Меню'
      });
      const layout = buildRenderLayout(model, lines);
      const menuSvg = buildTableSvg(model, lines, layout);
      this.stage.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
      this.stage.dataset.fontScaleEffective = String(layout.vertical.effectivePercent);
      this.stage.dataset.fontKey = layout.typography.key;
      menuLayer.dataset.renderMode = 'flat-static';
      try {
        await this.flatMenuRenderer.render(menuLayer, menuSvg, canonicalViewport, layout.typography);
      } catch (error) {
        console.error('Flat MIRA-TV render failed; using static DOM fallback', error);
        this.flatMenuRenderer.destroy();
        menuLayer.innerHTML = menuSvg;
        menuLayer.dataset.renderMode = 'dom-fallback';
      }

      this.stage.style.backgroundColor = model.settings.background_color || '#101828';
      this.themeRenderer.render(themeRuntime, context.screen);
      const background = sameOriginAsset(model.settings.background_image_url);
      this.stage.style.backgroundImage = background ? `url(${JSON.stringify(background)})` : 'none';
      this.stage.style.backgroundPosition = 'center';
      this.stage.style.backgroundRepeat = 'no-repeat';
      this.stage.style.backgroundSize = 'cover';
    }

    if (dirty.has('scene') || dirty.has('screen') || dirty.has('menu')) {
      const source = themeRuntime.scene && typeof themeRuntime.scene === 'object' ? themeRuntime.scene : { version:1, elements:[] };
      const staticScene = {
        ...source,
        elements:Array.isArray(source.elements)
          ? source.elements.filter((element) => element?.enabled !== false && element?.type !== 'video')
          : []
      };
      this.sceneElementRenderer.render(staticScene);
      sceneElementLayer.setAttribute('aria-hidden','true');

      const weatherElement = sceneWeatherElement(staticScene);
      this.weatherElementId = weatherElement?.id || null;
      this.weatherRuntime.setLayer(weatherElement ? this.sceneElementRenderer.contentFor(weatherElement.id) : null);
      this.weatherRuntime.applyContext(weatherSettingsFromElement(weatherElement), context.screen?.id, {
        configurationChanged:true,
        menuChanged:menuDirty
      });
    }

    this.themeWeatherRuntime.setLayer(this.themeRenderer.weatherMount());
    this.themeWeatherRuntime.applyContext(
      themeWeatherSettingsFromRuntime(themeRuntime, context.scene || { version:1,elements:[] }),
      context.screen?.id,
      {
        configurationChanged:menuDirty || dirty.has('scene'),
        menuChanged:menuDirty
      }
    );
  }

  reset() {
    if (this.destroyed) return;
    this.sceneElementRenderer.clear();
    this.flatMenuRenderer.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sceneElementRenderer.destroy();
    this.flatMenuRenderer.destroy();
    this.themeWeatherRuntime.destroy();
    this.themeRenderer.destroy();
    this.weatherRuntime.destroy();
    this.viewportObserver?.disconnect();
    this.viewportObserver = null;
    this.weatherElementId = null;
    this.stage = null;
  }
}
