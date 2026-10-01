import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { updateSceneElement, selectSceneElement } from '../editor/commands.js';
import { renderTableEditorRows } from '../editor/rows.js';
import { createEditorHistory } from '../editor/history.js';
import { createEditorState, replaceEditorState } from '../editor/state.js';
import { MENU_PRICE_FONT_SIZE } from '../editor/renderer.js';
import {
  appendSceneElement,
  renderSceneElementInspector,
  renderSceneLayerList
} from '../editor/elements.js';
import { PlayerSceneRenderer } from '../player/player-scene-renderer.js';
import { MENU_THEME_OVERRIDE_KEYS, MENU_THEME_PRESETS, menuThemePreset, migrateMenuThemePresetSource } from '../themes/menu-theme-registry.js';
const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;
const ELEMENT_LABELS = Object.freeze({
  text: 'Текстовое поле',
  logo: 'Логотип',
  image: 'Картинка',
  weather: 'Погода',
  theme: 'Тема меню',
  background: 'Фон',
  promotion: 'Акция',
  table: 'Таблица меню'
});
const ELEMENT_ICONS = Object.freeze({
  text: 'T',
  logo: '◈',
  image: '▧',
  weather: '☁',
  theme: '◫',
  background: '▧',
  promotion: '◆',
  table: '▦'
});
const TABLE_FONTS = Object.freeze([
  ['arial-narrow', 'Arial Narrow'],
  ['tahoma-bold', 'Tahoma Bold'],
  ['arial', 'Arial'],
  ['dejavu-condensed', 'DejaVu Sans Condensed'],
  ['liberation-narrow', 'Liberation Sans Narrow'],
  ['system-sans', 'Системный sans-serif']
]);
const THEME_FONTS = Object.freeze([
  ...TABLE_FONTS,
  ['mira-condensed', 'MIRA Sans Condensed'],
  ['mira-mono', 'MIRA Sans Mono'],
  ['mira-serif', 'MIRA Serif'],
  ['mira-serif-condensed', 'MIRA Serif Condensed'],
  ['montserrat', 'Montserrat'],
  ['roboto-condensed', 'Roboto Condensed'],
  ['oswald', 'Oswald'],
  ['russo-one', 'Russo One'],
  ['neucha', 'Neucha'],
  ['pt-sans-narrow', 'PT Sans Narrow'],
  ['yanone-kaffeesatz', 'Yanone Kaffeesatz'],
  ['underdog', 'Underdog']
]);

function systemOwnerIcon(type) {
  if (!['theme','background','promotion','table'].includes(type)) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (type === 'theme') {
    const rect = document.createElementNS(svg.namespaceURI, 'rect');
    rect.setAttribute('x','3.5'); rect.setAttribute('y','4.5'); rect.setAttribute('width','17'); rect.setAttribute('height','15'); rect.setAttribute('rx','2');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d','M7 9h10M7 13h6');
    const circle = document.createElementNS(svg.namespaceURI, 'circle');
    circle.setAttribute('cx','17.5'); circle.setAttribute('cy','15.5'); circle.setAttribute('r','1.8');
    svg.append(rect,path,circle);
    return svg;
  }

  if (type === 'promotion') {
    const tag = document.createElementNS(svg.namespaceURI, 'path');
    tag.setAttribute('d', 'M4 7h12l4 5-4 5H4zM8 10h5M8 14h7');
    svg.append(tag);
    return svg;
  }

  const rect = document.createElementNS(svg.namespaceURI, 'rect');
  rect.setAttribute('x', '3.5');
  rect.setAttribute('y', '4.5');
  rect.setAttribute('width', '17');
  rect.setAttribute('height', '15');
  rect.setAttribute('rx', '2');
  svg.append(rect);

  const path = document.createElementNS(svg.namespaceURI, 'path');
  if (type === 'background') {
    const circle = document.createElementNS(svg.namespaceURI, 'circle');
    circle.setAttribute('cx', '8.5');
    circle.setAttribute('cy', '9');
    circle.setAttribute('r', '1.5');
    path.setAttribute('d', 'm5.5 17 4.2-4.3 3.1 2.8 2.3-2.2 3.4 3.7');
    svg.append(circle, path);
  } else {
    path.setAttribute('d', 'M3.5 9.5h17M9 9.5v10M15 9.5v10M3.5 14.5h17');
    svg.append(path);
  }
  return svg;
}

let generation = 0;
function screenFromQuery(screens) {
  const id = Number(new URL(window.location.href).searchParams.get('screen'));
  return screens.find((screen) => Number(screen.id) === id) || screens[0] || null;
}

function rememberScreen(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('screen', String(id));
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return {
    width: Number(match?.[1]) || SCENE_WIDTH,
    height: Number(match?.[2]) || SCENE_HEIGHT
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function labelForScreen(screen) {
  return `${screen.location_name || 'Без точки'} — ${screen.name}`;
}

function createState() {
  return createEditorState();
}

export function initialiseSceneEditor() {
  const form = element('scene-editor-form');
  const stage = element('scene-editor-stage');
  const shell = element('scene-editor-stage-shell');
  const canvasPane = element('scene-editor-canvas-pane');
  const selectionLayer = element('scene-editor-selection-layer');
  const tableEditLayer = element('scene-editor-table-edit-layer');
  const layersRoot = element('scene-editor-layers');
  const propertiesRoot = element('scene-editor-properties');
  const addButton = element('scene-editor-add');
  const addMenu = element('scene-editor-add-menu');
  const themeLayer = element('scene-editor-theme-layer');
  const backgroundLayer = element('scene-editor-background-layer');
  const promotionLayer = element('scene-editor-promotion-layer');
  const tableLayer = element('scene-editor-table-layer');
  const mobileToolbar = form.querySelector('.scene-editor-mobile-toolbar');
  const undoButton = element('scene-editor-undo');
  const redoButton = element('scene-editor-redo');
  const screenSelect = element('scene-editor-screen');
  if (!(form instanceof HTMLFormElement)
      || !(stage instanceof HTMLElement)
      || !(shell instanceof HTMLElement)
      || !(canvasPane instanceof HTMLElement)
      || !(selectionLayer instanceof HTMLElement)
      || !(tableEditLayer instanceof HTMLElement)
      || !(layersRoot instanceof HTMLElement)
      || !(propertiesRoot instanceof HTMLElement)
      || !(addButton instanceof HTMLButtonElement)
      || !(addMenu instanceof HTMLElement)
      || !(themeLayer instanceof HTMLButtonElement)
      || !(backgroundLayer instanceof HTMLButtonElement)
      || !(promotionLayer instanceof HTMLButtonElement)
      || !(tableLayer instanceof HTMLButtonElement)
      || !(undoButton instanceof HTMLButtonElement)
      || !(redoButton instanceof HTMLButtonElement)
      || !(screenSelect instanceof HTMLSelectElement)) return undefined;

  const token = ++generation;
  const state = createState();
  let renderer = null;
  let screens = [];
  let userThemeTemplates = [];
  let currentBundle = null;
  let currentScreenId = null;
  let disposed = false;
  let previewFrame = 0;
  let documentPreviewFrame = 0;
  let resizeObserver = null;
  let interactionActive = false;
  let selectedOwner = 'none';
  let tableEditorOpen = false;
  const history = createEditorHistory(state);

  const active = () => !disposed && token === generation && document.body.dataset.page === 'scene';

  function setDirty() {
    const target = element('scene-editor-dirty-state');
    if (!target) return;
    target.textContent = state.dirty ? 'Не сохранено' : 'Сохранено';
    target.classList.toggle('is-dirty', state.dirty);
    undoButton.disabled = !history.canUndo();
    redoButton.disabled = !history.canRedo();
  }

  function selectedElement() {
    if (selectedOwner !== 'element') return null;
    return state.scene?.elements?.find((item) => item.id === state.selectedElementId) || null;
  }

  function setSelectionStatus() {
    const selected = selectedElement();
    const status = element('scene-editor-selection-status');
    const title = element('scene-editor-properties-title');
    const kind = element('scene-editor-properties-kind');
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
    const index = selected ? elements.indexOf(selected) : -1;
    const ownerType = selectedOwner === 'element' ? selected?.type : selectedOwner;
    const caption = selectedOwner === 'theme'
      ? 'Тема меню'
      : selectedOwner === 'background'
      ? 'Фон'
      : selectedOwner === 'promotion'
        ? 'Акция'
        : selectedOwner === 'table'
          ? 'Таблица меню'
          : selected
            ? `Элемент ${index + 1}`
            : 'Элемент не выбран';

    if (status) {
      status.textContent = selected
        ? `${caption} · X ${Math.round(Number(selected.x) || 0)} · Y ${Math.round(Number(selected.y) || 0)}`
        : selectedOwner === 'table'
          ? `Таблица · X ${Math.round(Number(state.settings.table_x) || 0)} · Y ${Math.round(Number(state.settings.table_y) || 0)}`
          : caption;
    }
    if (title) title.textContent = caption;
    if (kind) {
      const typeLabel = ownerType ? (ELEMENT_LABELS[ownerType] || ownerType) : 'Тип элемента не выбран';
      const ownerIcon = systemOwnerIcon(ownerType);
      if (ownerIcon) kind.replaceChildren(ownerIcon);
      else kind.textContent = ownerType ? (ELEMENT_ICONS[ownerType] || '•') : '—';
      kind.dataset.elementType = ownerType || '';
      kind.dataset.tooltip = ownerType ? typeLabel : '';
      kind.setAttribute('aria-label', ownerType === 'theme' ? 'Выбран тематический слой' : typeLabel);
      kind.title = ownerType ? typeLabel : '';
    }
  }

  function fitPreviewShell() {
    if (!state.screen) return;
    const resolution = resolutionOf(state.screen);
    const widthLimit = Math.max(1, canvasPane.clientWidth * .9);
    const heightLimit = Math.max(1, canvasPane.clientHeight * .82);
    const previewScale = Math.max(.01, Math.min(widthLimit / resolution.width, heightLimit / resolution.height));
    const width = Math.max(1, Math.floor(resolution.width * previewScale));
    const height = Math.max(1, Math.floor(resolution.height * previewScale));
    shell.style.width = `${width}px`;
    shell.style.height = `${height}px`;
    shell.style.aspectRatio = `${resolution.width} / ${resolution.height}`;
    renderer?.fitViewport?.(resolution);
    const zoom = element('scene-editor-zoom');
    if (zoom) zoom.textContent = `${Math.max(1, Math.round(previewScale * 100))}%`;
  }

  function applyBoxGeometry(box, sceneElement) {
    box.style.left = `${(Number(sceneElement.x || 0) / SCENE_WIDTH) * 100}%`;
    box.style.top = `${(Number(sceneElement.y || 0) / SCENE_HEIGHT) * 100}%`;
    box.style.width = `${(Number(sceneElement.width || 1) / SCENE_WIDTH) * 100}%`;
    box.style.height = `${(Number(sceneElement.height || 1) / SCENE_HEIGHT) * 100}%`;
    box.style.transform = `rotate(${Number(sceneElement.rotation_deg || 0)}deg)`;
  }

  function syncOverlaySelection() {
    selectionLayer.querySelectorAll('.scene-editor-selection-box').forEach((node) => {
      node.classList.toggle('is-selected', selectedOwner === 'element' && node.dataset.sceneElementId === state.selectedElementId);
    });
    selectionLayer.querySelector('.scene-editor-table-selection-box')?.classList.toggle('is-selected', selectedOwner === 'table');
    themeLayer.classList.toggle('is-selected', selectedOwner === 'theme');
    backgroundLayer.classList.toggle('is-selected', selectedOwner === 'background');
    promotionLayer.classList.toggle('is-selected', selectedOwner === 'promotion');
    tableLayer.classList.toggle('is-selected', selectedOwner === 'table');
    setSelectionStatus();
  }

  function selectOwner(owner, elementId = null) {
    if (owner !== 'table' && tableEditorOpen) closeTableEditor({ restoreFocus:false });
    selectedOwner = owner;
    if (owner === 'element' && elementId) selectSceneElement(state, elementId);
    else state.selectedElementId = null;
    renderLayers();
    renderInspector();
    syncOverlaySelection();
    if (window.matchMedia('(max-width: 1100px)').matches && owner !== 'element') {
      document.body.dataset.sceneMobilePanel = 'properties';
    }
  }

  function selectInCanvas(elementId) {
    selectOwner('element', elementId);
  }

  function checkpointControl(control) {
    let captured = false;
    const capture = () => {
      if (captured) return;
      captured = true;
      history.checkpoint();
      setDirty();
    };
    control.addEventListener('focus', capture, { once:true });
    control.addEventListener('pointerdown', capture, { once:true });
  }

  function syncAfterHistory() {
    selectedOwner = state.selectedElementId ? 'element' : 'none';
    setDirty();
    void renderFullPreview().then(() => renderSelectionOwners());
  }

  async function renderDocumentPreview() {
    if (!renderer || !active()) return;
    await renderer.render(sceneContext(), ['menu']);
    if (!active()) return;
    if (!interactionActive) refreshSelectionOverlay();
  }

  function scheduleDocumentRender() {
    if (documentPreviewFrame) return;
    documentPreviewFrame = requestAnimationFrame(() => {
      documentPreviewFrame = 0;
      void renderDocumentPreview();
    });
  }

  function themeState() {
    const rawTheme = state.settings?.theme && typeof state.settings.theme === 'object' ? state.settings.theme : {};
    const source = migrateMenuThemePresetSource(rawTheme);
    const preset = menuThemePreset(source.preset_id);
    const visual = preset.visual || {};
    const weatherPreset = preset.weather || {};
    const sourceBrand = source.brand && typeof source.brand === 'object' ? source.brand : {};
    const sourceUtility = source.utility_slot && typeof source.utility_slot === 'object' ? source.utility_slot : {};
    const sourceWeather = sourceUtility.weather && typeof sourceUtility.weather === 'object' ? sourceUtility.weather : {};
    const sourceDecor = source.decor && typeof source.decor === 'object' ? source.decor : {};
    const sourceLegal = source.legal && typeof source.legal === 'object' ? source.legal : {};
    const linkedWeather = (state.scene?.elements || []).find((item) =>
      item?.type === 'weather' && item.id === sourceUtility.weather_element_id
    );
    const linkedLogo = (state.scene?.elements || []).find((item) =>
      item?.type === 'logo' && item.id === sourceBrand.logo_element_id
    );
    const migratedWeather = Object.keys(sourceWeather).length ? sourceWeather : (linkedWeather?.weather || {});
    const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const nullableNumber = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
      ? null
      : Number(value);

    return {
      schema_version:1,
      preset_id:preset.id,
      preset_version:preset.preset_version || 1,
      brand:{
        name:String(sourceBrand.name || visual.brandText || ''),
        caption:String(sourceBrand.caption || visual.brandCaption || ''),
        logo_element_id:String(sourceBrand.logo_element_id || ''),
        logo_url:String(sourceBrand.logo_url || linkedLogo?.media?.source_url || ''),
        name_font_family:String(sourceBrand.name_font_family || visual.brandNameFontFamily || ''),
        name_font_size_px:numberOr(sourceBrand.name_font_size_px, Number(visual.brandNameFontSizePx) || 64),
        name_font_weight:numberOr(sourceBrand.name_font_weight, Number(visual.brandNameFontWeight) || 900),
        caption_font_family:String(sourceBrand.caption_font_family || visual.brandCaptionFontFamily || ''),
        caption_font_size_px:numberOr(sourceBrand.caption_font_size_px, Number(visual.brandCaptionFontSizePx) || 20),
        caption_font_weight:numberOr(sourceBrand.caption_font_weight, Number(visual.brandCaptionFontWeight) || 700)
      },
      utility_slot:{
        mode:String(sourceUtility.mode || (preset.id === 'legacy' ? 'none' : preset.default_utility_mode || 'none')),
        text:String(sourceUtility.text || ''),
        weather_element_id:String(sourceUtility.weather_element_id || ''),
        font_family:String(sourceUtility.font_family || visual.utilityFontFamily || ''),
        font_size_px:numberOr(sourceUtility.font_size_px, Number(visual.utilityFontSizePx) || 28),
        font_weight:numberOr(sourceUtility.font_weight, Number(visual.utilityFontWeight) || 800),
        temperature_font_family:String(sourceUtility.temperature_font_family || weatherPreset.temperature_font_family || ''),
        temperature_font_size_pt:numberOr(sourceUtility.temperature_font_size_pt, Number(weatherPreset.temperature_font_size_pt) || 48),
        location_font_size_pt:numberOr(sourceUtility.location_font_size_pt, Number(weatherPreset.location_font_size_pt) || 14),
        icon_scale_percent:numberOr(sourceUtility.icon_scale_percent, Number(weatherPreset.icon_scale_percent) || 100),
        weather:{
          location_name:String(migratedWeather.location_name || ''),
          latitude:nullableNumber(migratedWeather.latitude),
          longitude:nullableNumber(migratedWeather.longitude),
          timezone:String(migratedWeather.timezone || 'auto'),
          refresh_minutes:numberOr(migratedWeather.refresh_minutes,15),
          show_condition:migratedWeather.show_condition !== false,
          show_forecast:migratedWeather.show_forecast !== false,
          forecast_items:numberOr(migratedWeather.forecast_items,Number(weatherPreset.forecast_items) || 3)
        }
      },
      decor:{
        source_url:String(sourceDecor.source_url || '')
      },
      legal:{
        text:String(sourceLegal.text || visual.footerText || ''),
        age_text:String(sourceLegal.age_text || visual.ageText || '18+'),
        font_family:String(sourceLegal.font_family || visual.legalFontFamily || 'mira-condensed'),
        font_size_px:numberOr(sourceLegal.font_size_px,Number(visual.legalFontSizePx) || 30),
        font_weight:numberOr(sourceLegal.font_weight,Number(visual.legalFontWeight) || 600),
        letter_spacing_px:numberOr(sourceLegal.letter_spacing_px,Number(visual.legalLetterSpacingPx) || 0)
      },
      overrides:Array.isArray(source.overrides) ? [...source.overrides] : []
    };
  }

  function setThemeState(next, { rerenderInspector=false } = {}) {
    state.settings = { ...state.settings, theme:structuredClone(next) };
    state.dirty = true;
    setDirty();
    setSelectionStatus();
    scheduleDocumentRender();
    if (rerenderInspector) renderInspector();
  }

  function markThemeOverrides(keys) {
    const theme = themeState();
    if (theme.preset_id === 'legacy') return;
    const requested = new Set(theme.overrides);
    for (const key of keys) if (MENU_THEME_OVERRIDE_KEYS.includes(key)) requested.add(key);
    theme.overrides = MENU_THEME_OVERRIDE_KEYS.filter((key) => requested.has(key));
    state.settings = { ...state.settings, theme };
  }

  function patchMenuSettings(patch, { trackThemeOverride=true } = {}) {
    state.settings = { ...state.settings, ...patch };
    if (trackThemeOverride) markThemeOverrides(Object.keys(patch));
    state.dirty = true;
    setDirty();
    setSelectionStatus();
    scheduleDocumentRender();
  }

  function makeField(labelText, control) {
    const label = document.createElement('label');
    label.className = 'field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, control);
    return label;
  }

  function compactInput(type, value, { min, max, step } = {}) {
    const input = document.createElement('input');
    input.type = type;
    if (value !== undefined && value !== null) input.value = String(value);
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    if (step !== undefined) input.step = String(step);
    return input;
  }

  function multiScreenApplyGroup(kind, sceneElement = null, templateIdProvider = null) {
    const group = document.createElement('details');
    group.className = 'scene-editor-inspector-group scene-editor-multi-apply';
    const summary = document.createElement('summary');
    summary.textContent = 'Применить к мониторам';
    const panel = document.createElement('div');
    panel.className = 'scene-editor-inspector-panel scene-editor-multi-apply-panel';

    const targets = screens.filter((screen) => Number(screen.id) !== Number(currentScreenId));
    const note = document.createElement('small');
    note.className = 'scene-editor-multi-apply-note';
    note.textContent = kind === 'theme'
      ? 'Пресет, встроенные бренд/погода/часы, legal-блок, фон и ручные overrides будут применены к выбранным ТВ. Можно выбрать сразу всю торговую точку.'
      : kind === 'saved-theme'
        ? 'Сохранённая тема Конструктора будет целиком применена к выбранным ТВ: фон, оформление и все универсальные элементы.'
        : kind === 'background'
          ? 'Цвет и фоновое изображение будут одинаково применены к выбранным мониторам.'
          : 'Положение, размер и все настройки этого элемента будут применены к выбранным мониторам.';
    panel.append(note);

    if (!targets.length) {
      const empty = document.createElement('small');
      empty.className = 'scene-editor-multi-apply-empty';
      empty.textContent = 'Других мониторов пока нет.';
      panel.append(empty);
      group.append(summary, panel);
      return group;
    }

    const list = document.createElement('div');
    list.className = 'scene-editor-multi-apply-list';
    const inputs = [];
    const locationInputs = new Map();
    for (const target of targets) {
      const row = document.createElement('label');
      row.className = 'scene-editor-multi-apply-target';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(target.id);
      checkbox.setAttribute('aria-label', `Применить к ${labelForScreen(target)}`);
      const caption = document.createElement('span');
      caption.textContent = labelForScreen(target);
      row.append(checkbox, caption);
      list.append(row);
      inputs.push(checkbox);
      const key=String(target.location_id || target.location_name || '');
      if(!locationInputs.has(key)) locationInputs.set(key,{ label:target.location_name || 'Торговая точка', inputs:[] });
      locationInputs.get(key).inputs.push(checkbox);
    }

    if((kind==='theme' || kind==='saved-theme') && locationInputs.size){
      const points=document.createElement('div');
      points.className='scene-theme-point-selectors';
      for(const group of locationInputs.values()){
        const button=document.createElement('button');
        button.type='button';
        button.className='scene-theme-point-button';
        button.textContent=`Вся точка: ${group.label}`;
        button.addEventListener('click',()=>{
          const next=!group.inputs.every((input)=>input.checked);
          group.inputs.forEach((input)=>{ input.checked=next; input.dispatchEvent(new Event('change',{bubbles:true})); });
        });
        points.append(button);
      }
      panel.append(points);
    }

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'button button-secondary scene-editor-multi-apply-button';
    apply.textContent = 'Применить к выбранным';
    apply.disabled = true;
    const syncButton = () => { apply.disabled = !inputs.some((input) => input.checked); };
    inputs.forEach((input) => input.addEventListener('change', syncButton));

    apply.addEventListener('click', async () => {
      const targetIds = inputs.filter((input) => input.checked).map((input) => Number(input.value));
      if (!targetIds.length || !currentScreenId) return;
      const payload = { kind, target_screen_ids: targetIds };
      if (kind === 'theme') {
        const theme=themeState();
        payload.theme=structuredClone(theme);
        payload.override_settings=Object.fromEntries(
          theme.overrides.filter((key)=>MENU_THEME_OVERRIDE_KEYS.includes(key)).map((key)=>[key,state.settings[key]])
        );
        payload.bound_elements={ logo:null,weather:null };
      } else if (kind === 'background') {
        payload.background = {
          background_color: state.settings.background_color || '#101828',
          background_image_url: state.settings.background_image_url || ''
        };
      } else if (kind !== 'saved-theme') {
        const current = state.scene?.elements?.find((item) => item.id === sceneElement?.id);
        if (!current) return;
        const sameType = state.scene.elements.filter((item) => item?.type === current.type);
        payload.element = structuredClone(current);
        payload.type_index = Math.max(0, sameType.findIndex((item) => item.id === current.id));
      }

      setPending(apply, true, 'Применяем…');
      try {
        let result;
        if(kind==='saved-theme'){
          const templateId=Number(typeof templateIdProvider==='function' ? templateIdProvider() : templateIdProvider);
          if(!Number.isSafeInteger(templateId) || templateId<1) throw new Error('Сначала выберите сохранённую тему.');
          result=await api.post(`${API.screens}/menu-themes/custom/${templateId}/apply`,{target_screen_ids:targetIds});
        }else{
          result=await api.put(`${API.screens}/${currentScreenId}/scene/apply`, payload);
        }
        const count = Array.isArray(result.applied_screen_ids) ? result.applied_screen_ids.length : targetIds.length;
        setMessage('scene-editor-message', `Настройки применены к ${count} ${count === 1 ? 'монитору' : 'мониторам'}.`, 'success');
      } catch (error) {
        if (active()) setMessage('scene-editor-message', error.message);
      } finally {
        if (active()) setPending(apply, false, 'Применяем…');
      }
    });

    panel.append(list, apply);
    group.append(summary, panel);
    return group;
  }

  async function applyBackgroundUpload(file) {
    if (!currentScreenId || !file) return;
    const upload = propertiesRoot.querySelector('[data-scene-background-upload]');
    setPending(upload, true, 'Загружаем…');
    const dirtyBefore = state.dirty;
    try {
      const result = await api.put(`${API.screens}/${currentScreenId}/background`, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Draft-Revision': String(state.draftRevision)
        }
      });
      if (!active()) return;
      state.settings = {
        ...state.settings,
        background_image_url: result.draft?.settings?.background_image_url || ''
      };
      markThemeOverrides(['background_image_url']);
      state.draftRevision = Number(result.draft?.revision || state.draftRevision);
      state.screen = structuredClone(result.screen || state.screen);
      state.dirty = dirtyBefore;
      setDirty();
      await renderFullPreview();
      renderInspector();
      setMessage('scene-editor-message', 'Фон загружен.', 'success');
    } catch (error) {
      if (active()) setMessage('scene-editor-message', error.message);
    } finally {
      if (active()) setPending(upload, false, 'Загружаем…');
    }
  }

  async function removeBackground() {
    if (!currentScreenId || !state.settings.background_image_url) return;
    const dirtyBefore = state.dirty;
    try {
      const result = await api.delete(`${API.screens}/${currentScreenId}/background`, {
        headers: { 'X-Draft-Revision': String(state.draftRevision) }
      });
      if (!active()) return;
      state.settings = { ...state.settings, background_image_url: '' };
      markThemeOverrides(['background_image_url']);
      state.draftRevision = Number(result.draft?.revision || state.draftRevision);
      state.screen = structuredClone(result.screen || state.screen);
      state.dirty = dirtyBefore;
      setDirty();
      await renderFullPreview();
      renderInspector();
      setMessage('scene-editor-message', 'Фон удалён.', 'success');
    } catch (error) {
      if (active()) setMessage('scene-editor-message', error.message);
    }
  }

  function closeTableEditor({ restoreFocus = true } = {}) {
    if (!tableEditorOpen && tableEditLayer.hidden) return;
    tableEditorOpen = false;
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    document.body.classList.remove('scene-table-editor-open');
    scheduleDocumentRender();
    if (restoreFocus) requestAnimationFrame(() => tableLayer.focus({ preventScroll:true }));
  }

  function renderTableEditLayer({ rebuildInspector = false } = {}) {
    const activeTable = selectedOwner === 'table' && tableEditorOpen;
    tableEditLayer.hidden = !activeTable;
    document.body.classList.toggle('scene-table-editor-open', activeTable);
    if (!activeTable) {
      tableEditLayer.replaceChildren();
      return;
    }
    renderTableEditorRows(state, {
      target: tableEditLayer,
      products: currentBundle?.products || [],
      packaging: currentBundle?.packaging || [],
      onBeforeMutate: () => history.checkpoint(),
      onVisualChange: () => {
        state.dirty = true;
        setDirty();
        scheduleDocumentRender();
      },
      onStructureChange: () => {
        state.dirty = true;
        setDirty();
        scheduleDocumentRender();
        renderTableEditLayer({ rebuildInspector:true });
      },
      onClose: () => closeTableEditor()
    });
    if (rebuildInspector) setSelectionStatus();
  }

  function openTableEditor() {
    if (selectedOwner !== 'table') {
      selectedOwner = 'table';
      state.selectedElementId = null;
      renderLayers();
      renderInspector();
      syncOverlaySelection();
    }
    tableEditorOpen = true;
    renderTableEditLayer();
  }

  function renderThemeInspector() {
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    propertiesRoot.replaceChildren();

    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack';
    const theme = themeState();
    const preset = menuThemePreset(theme.preset_id);

    const main = document.createElement('details');
    main.className = 'scene-editor-inspector-group';
    main.open = true;
    main.append(Object.assign(document.createElement('summary'), { textContent:'Тема меню' }));
    const panel = document.createElement('div');
    panel.className = 'scene-editor-inspector-panel';

    const presetSelect = document.createElement('select');
    presetSelect.setAttribute('aria-label','Тема меню');
    for (const item of MENU_THEME_PRESETS) presetSelect.add(new Option(item.label,item.id));
    presetSelect.value = theme.preset_id;
    presetSelect.addEventListener('change', () => {
      history.checkpoint();
      const current = themeState();
      const nextPreset = menuThemePreset(presetSelect.value);
      const visual = nextPreset.visual || {};
      const weatherPreset = nextPreset.weather || {};
      const switchingToConstructor = nextPreset.id === 'legacy';
      const next = {
        ...current,
        preset_id:nextPreset.id,
        preset_version:nextPreset.preset_version || 1,
        brand:{
          ...current.brand,
          name:current.brand.name || visual.brandText || '',
          caption:visual.brandCaption ?? current.brand.caption,
          logo_element_id:'',
          name_font_family:visual.brandNameFontFamily || current.brand.name_font_family,
          name_font_size_px:Number(visual.brandNameFontSizePx) || current.brand.name_font_size_px,
          name_font_weight:Number(visual.brandNameFontWeight) || current.brand.name_font_weight,
          caption_font_family:visual.brandCaptionFontFamily || current.brand.caption_font_family,
          caption_font_size_px:Number(visual.brandCaptionFontSizePx) || current.brand.caption_font_size_px,
          caption_font_weight:Number(visual.brandCaptionFontWeight) || current.brand.caption_font_weight
        },
        utility_slot:{
          ...current.utility_slot,
          mode:switchingToConstructor ? 'none' : nextPreset.default_utility_mode || 'weather',
          weather_element_id:'',
          font_family:visual.utilityFontFamily || current.utility_slot.font_family,
          font_size_px:Number(visual.utilityFontSizePx) || current.utility_slot.font_size_px,
          font_weight:Number(visual.utilityFontWeight) || current.utility_slot.font_weight,
          temperature_font_family:weatherPreset.temperature_font_family || current.utility_slot.temperature_font_family,
          temperature_font_size_pt:Number(weatherPreset.temperature_font_size_pt) || current.utility_slot.temperature_font_size_pt,
          location_font_size_pt:Number(weatherPreset.location_font_size_pt) || current.utility_slot.location_font_size_pt,
          icon_scale_percent:Number(weatherPreset.icon_scale_percent) || current.utility_slot.icon_scale_percent,
          weather:{
            ...current.utility_slot.weather,
            show_condition:weatherPreset.show_condition !== false,
            show_forecast:weatherPreset.show_forecast !== false,
            forecast_items:Number(weatherPreset.forecast_items) || current.utility_slot.weather.forecast_items || 3
          }
        },
        decor:{ source_url:'' },
        legal:{
          text:visual.footerText || current.legal.text,
          age_text:visual.ageText || '18+',
          font_family:visual.legalFontFamily || current.legal.font_family,
          font_size_px:Number(visual.legalFontSizePx) || current.legal.font_size_px,
          font_weight:Number(visual.legalFontWeight) || current.legal.font_weight,
          letter_spacing_px:Number(visual.legalLetterSpacingPx) || 0
        },
        overrides:[]
      };
      setThemeState(next,{ rerenderInspector:true });
      renderLayers();
    });

    const description = document.createElement('small');
    description.className = 'scene-theme-description';
    description.textContent = preset.description || '';
    panel.append(makeField('Тема',presetSelect),description);

    const backgroundControls = () => {
      const section = document.createElement('div');
      section.className = 'scene-theme-subsection';
      const title = document.createElement('strong');
      title.className = 'scene-theme-subsection-title';
      title.textContent = 'Фон';

      const color = compactInput('color',state.settings.background_color || '#101828');
      color.setAttribute('aria-label','Цвет фона темы');
      checkpointControl(color);
      color.addEventListener('input',()=>{
        patchMenuSettings({ background_color:color.value });
      });

      const file = compactInput('file',null);
      file.accept='image/png,image/jpeg,image/webp';
      file.setAttribute('aria-label','Фоновое изображение темы');
      const upload = document.createElement('button');
      upload.type='button';
      upload.className='button button-secondary';
      upload.dataset.sceneBackgroundUpload='true';
      upload.textContent='Загрузить фон';
      upload.addEventListener('click',()=>{
        const selected=file.files?.[0];
        if(selected) void applyBackgroundUpload(selected);
      });

      const remove = document.createElement('button');
      remove.type='button';
      remove.className='button button-secondary';
      remove.textContent='Убрать фон';
      remove.disabled=!state.settings.background_image_url;
      remove.addEventListener('click',()=>void removeBackground());

      const grid=document.createElement('div');
      grid.className='compact-form-grid';
      grid.append(makeField('Цвет',color),makeField('Изображение',file),upload,remove);
      section.append(title,grid);
      return section;
    };

    if (preset.id === 'legacy') {
      const constructor = document.createElement('div');
      constructor.className = 'scene-theme-subsection scene-theme-constructor';
      const title = document.createElement('strong');
      title.className = 'scene-theme-subsection-title';
      title.textContent = 'Конструктор темы';
      const note = document.createElement('small');
      note.textContent = 'Добавляйте универсальные элементы и свободно размещайте их на сцене. Готовые пресеты эти элементы не создают и не используют.';
      const actions = document.createElement('div');
      actions.className = 'scene-theme-constructor-actions';

      const existingWeather = (state.scene?.elements || []).some((item)=>item?.type==='weather');
      for(const [type,label] of [['text','Текстовое поле'],['logo','Логотип'],['image','Картинка'],['weather','Погода']]){
        const button=document.createElement('button');
        button.type='button';
        button.className='button button-secondary';
        button.textContent=`+ ${label}`;
        if(type==='weather' && existingWeather) {
          button.disabled=true;
          button.title='На сцене уже есть элемент «Погода»';
        }
        button.addEventListener('click',()=>{
          history.checkpoint();
          const created=appendSceneElement(state,type);
          if(!created) return;
          selectedOwner='element';
          state.selectedElementId=created.id;
          setDirty();
          scheduleSceneRender();
          renderSelectionOwners();
          if(window.matchMedia('(max-width: 1100px)').matches) document.body.dataset.sceneMobilePanel='properties';
        });
        actions.append(button);
      }
      constructor.append(title,note,actions);
      panel.append(constructor,backgroundControls());

      const savedThemes = document.createElement('div');
      savedThemes.className = 'scene-theme-subsection scene-theme-saved';
      const savedTitle = document.createElement('strong');
      savedTitle.className = 'scene-theme-subsection-title';
      savedTitle.textContent = 'Мои темы';
      const savedNote = document.createElement('small');
      savedNote.textContent = 'Сохраните текущую сборку Конструктора под своим названием и повторно применяйте её к другим ТВ и торговым точкам.';

      const savedName = compactInput('text','');
      savedName.maxLength = 80;
      savedName.placeholder = 'Например: Бир Фиш — основная';
      savedName.setAttribute('aria-label','Название пользовательской темы');

      const savedSelect = document.createElement('select');
      savedSelect.setAttribute('aria-label','Сохранённые темы');
      savedSelect.add(new Option('Выберите сохранённую тему',''));
      userThemeTemplates.forEach((item)=>savedSelect.add(new Option(item.name,String(item.id))));
      savedSelect.addEventListener('change',()=>{
        const selected=userThemeTemplates.find((item)=>Number(item.id)===Number(savedSelect.value));
        if(selected) savedName.value=selected.name;
      });

      const refreshSavedThemes = async (selectedId = null) => {
        userThemeTemplates = await api.get(`${API.screens}/menu-themes/custom`);
        if(!active()) return;
        renderInspector();
        if(selectedId){
          const nextSelect=propertiesRoot.querySelector('[aria-label="Сохранённые темы"]');
          if(nextSelect instanceof HTMLSelectElement) nextSelect.value=String(selectedId);
        }
      };

      const saveTheme = document.createElement('button');
      saveTheme.type='button';
      saveTheme.className='button button-secondary';
      saveTheme.textContent='Сохранить как тему';
      saveTheme.addEventListener('click',async()=>{
        setPending(saveTheme,true,'Сохраняем…');
        try{
          const created=await api.post(`${API.screens}/menu-themes/custom`,{
            name:savedName.value,
            settings:structuredClone(state.settings),
            scene:structuredClone(state.scene)
          });
          setMessage('scene-editor-message',`Тема «${created.name}» сохранена.`,'success');
          await refreshSavedThemes(created.id);
        }catch(error){ if(active()) setMessage('scene-editor-message',error.message); }
        finally{ if(active() && saveTheme.isConnected) setPending(saveTheme,false,'Сохраняем…'); }
      });

      const updateTheme = document.createElement('button');
      updateTheme.type='button';
      updateTheme.className='button button-secondary';
      updateTheme.textContent='Обновить выбранную';
      updateTheme.disabled=!userThemeTemplates.length;
      updateTheme.addEventListener('click',async()=>{
        const templateId=Number(savedSelect.value);
        if(!Number.isSafeInteger(templateId) || templateId<1) return setMessage('scene-editor-message','Сначала выберите сохранённую тему.');
        setPending(updateTheme,true,'Обновляем…');
        try{
          const updated=await api.put(`${API.screens}/menu-themes/custom/${templateId}`,{
            name:savedName.value,
            settings:structuredClone(state.settings),
            scene:structuredClone(state.scene)
          });
          setMessage('scene-editor-message',`Тема «${updated.name}» обновлена.`,'success');
          await refreshSavedThemes(updated.id);
        }catch(error){ if(active()) setMessage('scene-editor-message',error.message); }
        finally{ if(active() && updateTheme.isConnected) setPending(updateTheme,false,'Обновляем…'); }
      });

      const applyTheme = document.createElement('button');
      applyTheme.type='button';
      applyTheme.className='button button-secondary';
      applyTheme.textContent='Применить к текущему ТВ';
      applyTheme.disabled=!userThemeTemplates.length;
      applyTheme.addEventListener('click',async()=>{
        const templateId=Number(savedSelect.value);
        if(!Number.isSafeInteger(templateId) || templateId<1) return setMessage('scene-editor-message','Сначала выберите сохранённую тему.');
        setPending(applyTheme,true,'Применяем…');
        try{
          await api.post(`${API.screens}/menu-themes/custom/${templateId}/apply`,{target_screen_ids:[currentScreenId]});
          await loadScreen(currentScreenId);
          if(!active()) return;
          selectedOwner='theme';
          renderSelectionOwners();
          setMessage('scene-editor-message','Сохранённая тема применена к текущему ТВ.','success');
        }catch(error){ if(active()) setMessage('scene-editor-message',error.message); }
        finally{ if(active() && applyTheme.isConnected) setPending(applyTheme,false,'Применяем…'); }
      });

      const deleteTheme = document.createElement('button');
      deleteTheme.type='button';
      deleteTheme.className='button button-secondary';
      deleteTheme.textContent='Удалить выбранную';
      deleteTheme.disabled=!userThemeTemplates.length;
      deleteTheme.addEventListener('click',async()=>{
        const templateId=Number(savedSelect.value);
        const selected=userThemeTemplates.find((item)=>Number(item.id)===templateId);
        if(!selected) return setMessage('scene-editor-message','Сначала выберите сохранённую тему.');
        if(!window.confirm(`Удалить тему «${selected.name}»?`)) return;
        try{
          await api.delete(`${API.screens}/menu-themes/custom/${templateId}`);
          setMessage('scene-editor-message',`Тема «${selected.name}» удалена.`,'success');
          await refreshSavedThemes();
        }catch(error){ if(active()) setMessage('scene-editor-message',error.message); }
      });

      const savedGrid=document.createElement('div');
      savedGrid.className='compact-form-grid';
      savedGrid.append(
        makeField('Название',savedName),
        makeField('Сохранённая тема',savedSelect),
        saveTheme,updateTheme,applyTheme,deleteTheme
      );
      savedThemes.append(savedTitle,savedNote,savedGrid);
      panel.append(savedThemes);
      stack.append(multiScreenApplyGroup('saved-theme',null,()=>propertiesRoot.querySelector('[aria-label="Сохранённые темы"]')?.value || ''));

      const compatibility = document.createElement('small');
      compatibility.className='scene-theme-description';
      compatibility.textContent='Существующие свободные сцены автоматически считаются «Конструктором темы» и сохраняют прежние координаты и настройки.';
      panel.append(compatibility);

      main.append(panel);
      stack.append(main);
      propertiesRoot.append(stack);
      return;
    }

    const themeFontSelect=(value,labelText)=>{
      const select=document.createElement('select');
      select.setAttribute('aria-label',labelText);
      for(const [key,name] of THEME_FONTS) select.add(new Option(name,key));
      select.value=value || 'system-sans';
      return select;
    };
    const weightSelect=(value,labelText)=>{
      const select=document.createElement('select');
      select.setAttribute('aria-label',labelText);
      for(const weight of [300,400,500,600,700,800,900]) select.add(new Option(String(weight),String(weight)));
      select.value=String(value || 700);
      return select;
    };
    const subsection=(titleText)=>{
      const section=document.createElement('div');
      section.className='scene-theme-subsection';
      const title=document.createElement('strong');
      title.className='scene-theme-subsection-title';
      title.textContent=titleText;
      section.append(title);
      return section;
    };

    const brandSection=subsection('Бренд');
    const brandName=compactInput('text',theme.brand.name);
    brandName.maxLength=120;
    brandName.setAttribute('aria-label','Название бренда');
    checkpointControl(brandName);
    brandName.addEventListener('input',()=>{ const next=themeState(); next.brand.name=brandName.value; setThemeState(next); });
    const brandFont=themeFontSelect(theme.brand.name_font_family,'Шрифт названия бренда');
    brandFont.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.brand.name_font_family=brandFont.value; setThemeState(next); });
    const brandSize=compactInput('number',theme.brand.name_font_size_px,{min:24,max:128,step:1});
    brandSize.setAttribute('aria-label','Размер названия бренда');
    checkpointControl(brandSize);
    brandSize.addEventListener('input',()=>{ const next=themeState(); next.brand.name_font_size_px=clamp(Number(brandSize.value)||64,24,128); setThemeState(next); });
    const brandWeight=weightSelect(theme.brand.name_font_weight,'Жирность названия бренда');
    brandWeight.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.brand.name_font_weight=Number(brandWeight.value); setThemeState(next); });

    const caption=compactInput('text',theme.brand.caption);
    caption.maxLength=160;
    caption.setAttribute('aria-label','Подпись бренда');
    checkpointControl(caption);
    caption.addEventListener('input',()=>{ const next=themeState(); next.brand.caption=caption.value; setThemeState(next); });
    const captionFont=themeFontSelect(theme.brand.caption_font_family,'Шрифт подписи бренда');
    captionFont.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.brand.caption_font_family=captionFont.value; setThemeState(next); });
    const captionSize=compactInput('number',theme.brand.caption_font_size_px,{min:10,max:64,step:1});
    captionSize.setAttribute('aria-label','Размер подписи бренда');
    checkpointControl(captionSize);
    captionSize.addEventListener('input',()=>{ const next=themeState(); next.brand.caption_font_size_px=clamp(Number(captionSize.value)||20,10,64); setThemeState(next); });
    const captionWeight=weightSelect(theme.brand.caption_font_weight,'Жирность подписи бренда');
    captionWeight.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.brand.caption_font_weight=Number(captionWeight.value); setThemeState(next); });

    const logoFile=compactInput('file',null);
    logoFile.accept='image/png,image/jpeg,image/webp';
    logoFile.setAttribute('aria-label','Логотип пресета');
    const logoUpload=document.createElement('button');
    logoUpload.type='button';
    logoUpload.className='button button-secondary';
    logoUpload.textContent=theme.brand.logo_url ? 'Заменить логотип' : 'Загрузить логотип';
    logoUpload.addEventListener('click',async()=>{
      const file=logoFile.files?.[0];
      if(!file) return;
      setPending(logoUpload,true,'Загружаем…');
      try{
        const asset=await uploadSceneAsset(file);
        const next=themeState();
        next.brand.logo_url=asset.source_url || '';
        next.brand.logo_element_id='';
        setThemeState(next,{rerenderInspector:true});
      }catch(error){ if(active()) setMessage('scene-editor-message',error.message); }
      finally{ if(active()) setPending(logoUpload,false,'Загружаем…'); }
    });
    const logoRemove=document.createElement('button');
    logoRemove.type='button';
    logoRemove.className='button button-secondary';
    logoRemove.textContent='Убрать логотип';
    logoRemove.disabled=!theme.brand.logo_url;
    logoRemove.addEventListener('click',()=>{ history.checkpoint(); const next=themeState(); next.brand.logo_url=''; next.brand.logo_element_id=''; setThemeState(next,{rerenderInspector:true}); });

    const brandGrid=document.createElement('div');
    brandGrid.className='compact-form-grid';
    brandGrid.append(
      makeField('Название',brandName),makeField('Шрифт названия',brandFont),
      makeField('Размер названия, px',brandSize),makeField('Насыщенность названия',brandWeight),
      makeField('Подпись / слоган',caption),makeField('Шрифт подписи',captionFont),
      makeField('Размер подписи, px',captionSize),makeField('Насыщенность подписи',captionWeight),
      makeField('Логотип',logoFile),logoUpload,logoRemove
    );
    brandSection.append(brandGrid);

    const decorSection=subsection('Тематическое изображение');
    const decorNote=document.createElement('small');
    decorNote.textContent='По умолчанию используется изображение утверждённого пресета. При необходимости его можно заменить.';
    const decorFile=compactInput('file',null);
    decorFile.accept='image/png,image/jpeg,image/webp';
    decorFile.setAttribute('aria-label','Изображение пресета');
    const decorUpload=document.createElement('button');
    decorUpload.type='button';
    decorUpload.className='button button-secondary';
    decorUpload.textContent=theme.decor.source_url ? 'Заменить изображение' : 'Загрузить своё изображение';
    decorUpload.addEventListener('click',async()=>{
      const file=decorFile.files?.[0];
      if(!file) return;
      setPending(decorUpload,true,'Загружаем…');
      try{
        const asset=await uploadSceneAsset(file);
        const next=themeState(); next.decor.source_url=asset.source_url || ''; setThemeState(next,{rerenderInspector:true});
      }catch(error){ if(active()) setMessage('scene-editor-message',error.message); }
      finally{ if(active()) setPending(decorUpload,false,'Загружаем…'); }
    });
    const decorReset=document.createElement('button');
    decorReset.type='button';
    decorReset.className='button button-secondary';
    decorReset.textContent='Вернуть изображение пресета';
    decorReset.disabled=!theme.decor.source_url;
    decorReset.addEventListener('click',()=>{ history.checkpoint(); const next=themeState(); next.decor.source_url=''; setThemeState(next,{rerenderInspector:true}); });
    decorSection.append(decorNote,makeField('Файл',decorFile),decorUpload,decorReset);

    const utilitySection=subsection('Информационный блок');
    const utility=document.createElement('select');
    for(const [value,labelText] of [['weather','Погода'],['clock','Часы'],['text','Текстовый блок'],['none','Не использовать']]){
      utility.add(new Option(labelText,value));
    }
    utility.value=theme.utility_slot.mode;
    utility.setAttribute('aria-label','Содержимое полезного слота');
    utility.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.utility_slot.mode=utility.value; next.utility_slot.weather_element_id=''; setThemeState(next,{rerenderInspector:true}); });
    utilitySection.append(makeField('Содержимое',utility));

    if(theme.utility_slot.mode==='weather'){
      const weather=theme.utility_slot.weather;
      const location=compactInput('text',weather.location_name);
      location.autocomplete='off';
      location.setAttribute('aria-label','Город встроенной погоды');
      const results=document.createElement('div');
      results.className='weather-location-results scene-weather-location-results';
      results.hidden=true;
      let searchTimer=null;
      let searchGeneration=0;

      const closeResults=()=>{ results.hidden=true; results.replaceChildren(); };
      const applyLocation=(item)=>{
        if(!item || !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))) return;
        history.checkpoint();
        const next=themeState();
        next.utility_slot.weather={
          ...next.utility_slot.weather,
          location_name:String(item.name || ''),
          latitude:Number(item.latitude),
          longitude:Number(item.longitude),
          timezone:String(item.timezone || 'auto')
        };
        setThemeState(next,{rerenderInspector:true});
      };
      const searchLocations=(query)=>{
        if(searchTimer) clearTimeout(searchTimer);
        const current=String(query || '').trim();
        const generation=++searchGeneration;
        if(current.length<2){ closeResults(); return; }
        searchTimer=setTimeout(async()=>{
          try{
            const items=await api.get('/api/weather/locations?q='+encodeURIComponent(current));
            if(generation!==searchGeneration || !location.isConnected || location.value.trim()!==current) return;
            results.replaceChildren();
            for(const item of (Array.isArray(items)?items.slice(0,8):[])){
              const button=document.createElement('button');
              button.type='button';
              button.className='weather-location-option';
              const name=document.createElement('span'); name.textContent=item.name || '';
              const detail=document.createElement('small'); detail.textContent=[item.admin1,item.country].filter(Boolean).join(', ');
              button.append(name,detail);
              button.addEventListener('pointerdown',(event)=>event.preventDefault());
              button.addEventListener('click',()=>applyLocation(item));
              results.append(button);
            }
            results.hidden=!results.childElementCount;
          }catch{ if(generation===searchGeneration) closeResults(); }
        },220);
      };
      checkpointControl(location);
      location.addEventListener('input',()=>{
        const next=themeState();
        next.utility_slot.weather={...next.utility_slot.weather,location_name:location.value,latitude:null,longitude:null,timezone:'auto'};
        setThemeState(next);
        searchLocations(location.value);
      });
      location.addEventListener('blur',()=>setTimeout(closeResults,120));
      const locationWrap=document.createElement('div');
      locationWrap.className='scene-weather-location-search';
      locationWrap.append(makeField('Город',location),results);

      const weatherStatus=document.createElement('small');
      weatherStatus.className='scene-theme-weather-status';
      const weatherLatitude=Number(weather.latitude);
      const weatherLongitude=Number(weather.longitude);
      const hasWeatherCoordinates=weather.latitude !== null && weather.latitude !== undefined && weather.latitude !== ''
        && weather.longitude !== null && weather.longitude !== undefined && weather.longitude !== ''
        && Number.isFinite(weatherLatitude) && Number.isFinite(weatherLongitude);
      weatherStatus.textContent=hasWeatherCoordinates
        ? `${weatherLatitude.toFixed(4)}, ${weatherLongitude.toFixed(4)} · ${weather.timezone || 'auto'}`
        : 'Выберите город из подсказок — координаты и часовой пояс сохранятся в пресете.';

      const weatherFont=themeFontSelect(theme.utility_slot.temperature_font_family,'Шрифт температуры темы');
      weatherFont.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.utility_slot.temperature_font_family=weatherFont.value; setThemeState(next); });
      const temperatureSize=compactInput('number',theme.utility_slot.temperature_font_size_pt,{min:24,max:96,step:1});
      temperatureSize.setAttribute('aria-label','Кегль температуры темы');
      checkpointControl(temperatureSize);
      temperatureSize.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.temperature_font_size_pt=clamp(Number(temperatureSize.value)||48,24,96); setThemeState(next); });
      const locationSize=compactInput('number',theme.utility_slot.location_font_size_pt,{min:8,max:32,step:1});
      locationSize.setAttribute('aria-label','Кегль города темы');
      checkpointControl(locationSize);
      locationSize.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.location_font_size_pt=clamp(Number(locationSize.value)||14,8,32); setThemeState(next); });
      const iconScale=compactInput('number',theme.utility_slot.icon_scale_percent,{min:80,max:200,step:1});
      iconScale.setAttribute('aria-label','Масштаб иконки погоды темы');
      checkpointControl(iconScale);
      iconScale.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.icon_scale_percent=clamp(Number(iconScale.value)||100,80,200); setThemeState(next); });
      const refresh=compactInput('number',weather.refresh_minutes,{min:5,max:120,step:1});
      refresh.setAttribute('aria-label','Обновление погоды темы');
      checkpointControl(refresh);
      refresh.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.weather.refresh_minutes=clamp(Number(refresh.value)||15,5,120); setThemeState(next); });
      const forecastItems=compactInput('number',weather.forecast_items,{min:1,max:6,step:1});
      forecastItems.setAttribute('aria-label','Количество прогнозов темы');
      checkpointControl(forecastItems);
      forecastItems.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.weather.forecast_items=clamp(Number(forecastItems.value)||3,1,6); setThemeState(next); });

      const weatherGrid=document.createElement('div');
      weatherGrid.className='compact-form-grid';
      weatherGrid.append(
        locationWrap,
        makeField('Шрифт температуры',weatherFont),
        makeField('Температура, pt',temperatureSize),
        makeField('Город, pt',locationSize),
        makeField('Иконка, %',iconScale),
        makeField('Обновление, мин',refresh),
        makeField('Прогнозов',forecastItems)
      );
      utilitySection.append(weatherStatus,weatherGrid);
    }else if(theme.utility_slot.mode==='text'){
      const utilityText=compactInput('text',theme.utility_slot.text);
      utilityText.maxLength=240;
      utilityText.setAttribute('aria-label','Текст полезного слота');
      checkpointControl(utilityText);
      utilityText.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.text=utilityText.value; setThemeState(next); });
      const utilityFont=themeFontSelect(theme.utility_slot.font_family,'Шрифт текстового слота');
      utilityFont.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.utility_slot.font_family=utilityFont.value; setThemeState(next); });
      const utilitySize=compactInput('number',theme.utility_slot.font_size_px,{min:12,max:72,step:1});
      utilitySize.setAttribute('aria-label','Размер текста полезного слота');
      checkpointControl(utilitySize);
      utilitySize.addEventListener('input',()=>{ const next=themeState(); next.utility_slot.font_size_px=clamp(Number(utilitySize.value)||28,12,72); setThemeState(next); });
      utilitySection.append(makeField('Текст',utilityText),makeField('Шрифт',utilityFont),makeField('Размер, px',utilitySize));
    }else if(theme.utility_slot.mode==='clock'){
      const clockNote=document.createElement('small');
      clockNote.textContent='Часы используют отдельный дизайн выбранного пресета и часовой пояс телевизора.';
      utilitySection.append(clockNote);
    }

    const legalSection=subsection('Предупреждение 18+');
    const legalText=document.createElement('textarea');
    legalText.rows=2;
    legalText.maxLength=220;
    legalText.value=theme.legal.text;
    legalText.setAttribute('aria-label','Текст предупреждения');
    checkpointControl(legalText);
    legalText.addEventListener('input',()=>{ const next=themeState(); next.legal.text=legalText.value; setThemeState(next); });
    const ageText=compactInput('text',theme.legal.age_text);
    ageText.maxLength=12;
    ageText.setAttribute('aria-label','Текст возрастного знака');
    checkpointControl(ageText);
    ageText.addEventListener('input',()=>{ const next=themeState(); next.legal.age_text=ageText.value; setThemeState(next); });
    const legalFont=themeFontSelect(theme.legal.font_family,'Шрифт предупреждения');
    legalFont.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.legal.font_family=legalFont.value; setThemeState(next); });
    const legalSize=compactInput('number',theme.legal.font_size_px,{min:16,max:52,step:1});
    legalSize.setAttribute('aria-label','Размер предупреждения');
    checkpointControl(legalSize);
    legalSize.addEventListener('input',()=>{ const next=themeState(); next.legal.font_size_px=clamp(Number(legalSize.value)||30,16,52); setThemeState(next); });
    const legalWeight=weightSelect(theme.legal.font_weight,'Насыщенность предупреждения');
    legalWeight.addEventListener('change',()=>{ history.checkpoint(); const next=themeState(); next.legal.font_weight=Number(legalWeight.value); setThemeState(next); });
    const legalSpacing=compactInput('number',theme.legal.letter_spacing_px,{min:0,max:14,step:1});
    legalSpacing.setAttribute('aria-label','Межбуквенный интервал предупреждения');
    checkpointControl(legalSpacing);
    legalSpacing.addEventListener('input',()=>{ const next=themeState(); next.legal.letter_spacing_px=clamp(Number(legalSpacing.value)||0,0,14); setThemeState(next); });
    const legalGrid=document.createElement('div');
    legalGrid.className='compact-form-grid';
    legalGrid.append(
      makeField('Текст',legalText),makeField('Возрастной знак',ageText),
      makeField('Шрифт',legalFont),makeField('Размер, px',legalSize),
      makeField('Насыщенность',legalWeight),makeField('Трекинг, px',legalSpacing)
    );
    legalSection.append(legalGrid);

    const overrideState=document.createElement('div');
    overrideState.className='scene-theme-overrides';
    const overrideCopy=document.createElement('small');
    overrideCopy.textContent=theme.overrides.length
      ? `Ручных переопределений: ${theme.overrides.length}. Они сохраняются поверх пресета.`
      : 'Используются настройки пресета без ручных переопределений.';
    const reset=document.createElement('button');
    reset.type='button';
    reset.className='button button-secondary';
    reset.textContent='Сбросить ручные настройки темы';
    reset.disabled=!theme.overrides.length;
    reset.addEventListener('click',()=>{ history.checkpoint(); const next=themeState(); next.overrides=[]; setThemeState(next,{rerenderInspector:true}); });
    overrideState.append(overrideCopy,reset);

    panel.append(brandSection,utilitySection,decorSection,legalSection,backgroundControls(),overrideState);
    main.append(panel);
    stack.append(main,multiScreenApplyGroup('theme'));
    propertiesRoot.append(stack);
  }

  function renderBackgroundInspector() {
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    propertiesRoot.replaceChildren();
    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack';

    const appearance = document.createElement('details');
    appearance.className = 'scene-editor-inspector-group';
    appearance.open = true;
    const appearanceSummary = document.createElement('summary');
    appearanceSummary.textContent = 'Фон';
    const appearancePanel = document.createElement('div');
    appearancePanel.className = 'scene-editor-inspector-panel';

    const color = compactInput('color', state.settings.background_color || '#101828');
    color.setAttribute('aria-label', 'Цвет фона');
    checkpointControl(color);
    color.addEventListener('input', () => patchMenuSettings({ background_color: color.value.toUpperCase() }));
    appearancePanel.append(makeField('Цвет', color));

    const file = compactInput('file');
    file.accept = 'image/png,image/jpeg,image/webp';
    file.setAttribute('aria-label', 'Фоновое изображение');
    const status = document.createElement('small');
    status.className = 'scene-editor-background-state';
    status.textContent = state.settings.background_image_url ? 'Изображение загружено' : 'Без изображения';

    const actions = document.createElement('div');
    actions.className = 'scene-editor-inspector-actions';
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'button button-secondary';
    upload.dataset.sceneBackgroundUpload = '';
    upload.textContent = 'Загрузить';
    upload.addEventListener('click', () => {
      const selected = file.files?.[0];
      if (!selected) {
        setMessage('scene-editor-message', 'Выберите PNG, JPEG или WebP.');
        return;
      }
      void applyBackgroundUpload(selected);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-danger';
    remove.textContent = 'Удалить';
    remove.disabled = !state.settings.background_image_url;
    remove.addEventListener('click', () => void removeBackground());
    actions.append(upload, remove);
    appearancePanel.append(makeField('Изображение', file), status, actions);
    appearance.append(appearanceSummary, appearancePanel);
    stack.append(appearance, multiScreenApplyGroup('background'));
    propertiesRoot.append(stack);
  }

  function renderPromotionInspector() {
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    propertiesRoot.replaceChildren();

    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack';
    const style = document.createElement('details');
    style.className = 'scene-editor-inspector-group';
    style.open = true;
    style.append(Object.assign(document.createElement('summary'), { textContent:'Плашка акции' }));
    const stylePanel = document.createElement('div');
    stylePanel.className = 'scene-editor-inspector-panel';

    const shape = document.createElement('select');
    for (const [value,label] of [
      ['base','База'],['capsule','Скруглённая капсула'],['cut','Срезанные углы'],
      ['chevron','Шеврон'],['tag','Ярлык / Tag']
    ]) shape.add(new Option(label,value));
    shape.value = state.settings.promotion_badge_shape || 'base';
    shape.setAttribute('aria-label','Форма плашки акции');
    checkpointControl(shape);
    shape.addEventListener('change', () => patchMenuSettings({ promotion_badge_shape:shape.value }));

    const font = document.createElement('select');
    for (const [value,label] of TABLE_FONTS) font.add(new Option(label,value));
    font.value = state.settings.promotion_font_family || 'arial-narrow';
    font.setAttribute('aria-label','Шрифт акции');
    checkpointControl(font);
    font.addEventListener('change', () => patchMenuSettings({ promotion_font_family:font.value }));

    const fontSize = compactInput('number', state.settings.promotion_font_size_percent || 100, { min:60,max:180,step:1 });
    fontSize.setAttribute('aria-label','Размер шрифта акции');
    checkpointControl(fontSize);
    fontSize.addEventListener('input', () => {
      const value = Number(fontSize.value);
      if (Number.isFinite(value)) patchMenuSettings({ promotion_font_size_percent:clamp(Math.round(value),60,180) });
    });

    const weight = document.createElement('select');
    for (const value of [400,500,600,700,800,900]) weight.add(new Option(String(value),String(value)));
    weight.value = String(state.settings.promotion_font_weight || 900);
    weight.setAttribute('aria-label','Жирность шрифта акции');
    checkpointControl(weight);
    weight.addEventListener('change', () => patchMenuSettings({ promotion_font_weight:Number(weight.value) }));

    const height = compactInput('number', state.settings.promotion_font_height_percent || 112, { min:70,max:180,step:1 });
    height.setAttribute('aria-label','Высота шрифта акции');
    checkpointControl(height);
    height.addEventListener('input', () => {
      const value = Number(height.value);
      if (Number.isFinite(value)) patchMenuSettings({ promotion_font_height_percent:clamp(Math.round(value),70,180) });
    });

    const tracking = compactInput('number', state.settings.promotion_letter_spacing_px || 0, { min:-2,max:8,step:1 });
    tracking.setAttribute('aria-label','Межбуквенный интервал акции');
    checkpointControl(tracking);
    tracking.addEventListener('input', () => {
      const value = Number(tracking.value);
      if (Number.isFinite(value)) patchMenuSettings({ promotion_letter_spacing_px:clamp(Math.round(value),-2,8) });
    });

    const grid = document.createElement('div');
    grid.className = 'compact-form-grid';
    grid.append(
      makeField('Форма',shape), makeField('Шрифт',font),
      makeField('Размер, %',fontSize), makeField('Жирность',weight),
      makeField('Высота, %',height), makeField('Трекинг, px',tracking)
    );
    stylePanel.append(grid);
    style.append(stylePanel);
    stack.append(style);
    propertiesRoot.append(stack);
  }

  function renderTableInspector() {
    propertiesRoot.replaceChildren();
    const stack = document.createElement('div');
    stack.className = 'scene-editor-inspector-stack';

    const geometry = document.createElement('details');
    geometry.className = 'scene-editor-inspector-group';
    geometry.open = true;
    geometry.append(Object.assign(document.createElement('summary'), { textContent:'Трансформация' }));
    const geometryPanel = document.createElement('div');
    geometryPanel.className = 'scene-editor-inspector-panel';
    const grid = document.createElement('div');
    grid.className = 'geometry-grid';
    for (const [caption, key, min, max] of [
      ['X','table_x',0,1919], ['Y','table_y',0,1079],
      ['W','table_width_px',1,1920], ['H','table_height_px',1,1080]
    ]) {
      const control = compactInput('number', state.settings[key], { min, max, step:1 });
      control.setAttribute('aria-label', caption === 'W' ? 'Ширина таблицы' : caption === 'H' ? 'Высота таблицы' : caption);
      checkpointControl(control);
      control.addEventListener('input', () => {
        const value = Number(control.value);
        if (!Number.isFinite(value)) return;
        const next = Math.round(value);
        const patch = { [key]:next };
        if (key === 'table_x') patch.table_x = clamp(next, 0, SCENE_WIDTH - Number(state.settings.table_width_px || 1));
        if (key === 'table_y') patch.table_y = clamp(next, 0, SCENE_HEIGHT - Number(state.settings.table_height_px || 1));
        if (key === 'table_width_px') patch.table_width_px = clamp(next, 1, SCENE_WIDTH - Number(state.settings.table_x || 0));
        if (key === 'table_height_px') patch.table_height_px = clamp(next, 1, SCENE_HEIGHT - Number(state.settings.table_y || 0));
        patchMenuSettings(patch);
      });
      grid.append(makeField(caption, control));
    }
    geometryPanel.append(grid);
    geometry.append(geometryPanel);

    const typography = document.createElement('details');
    typography.className = 'scene-editor-inspector-group';
    typography.open = true;
    typography.append(Object.assign(document.createElement('summary'), { textContent:'Типографика' }));
    const typePanel = document.createElement('div');
    typePanel.className = 'scene-editor-inspector-panel';
    const font = document.createElement('select');
    for (const [value,label] of TABLE_FONTS) font.add(new Option(label,value));
    font.value = state.settings.font_family || 'arial-narrow';
    font.setAttribute('aria-label','Шрифт таблицы');
    checkpointControl(font);
    font.addEventListener('change', () => patchMenuSettings({ font_family:font.value }));
    const scale = compactInput('number', state.settings.font_scale_percent || 100, { min:55,max:130,step:1 });
    scale.setAttribute('aria-label','Масштаб шрифта таблицы');
    checkpointControl(scale);
    scale.addEventListener('input', () => {
      const value = Number(scale.value);
      if (Number.isFinite(value)) patchMenuSettings({ font_scale_percent:clamp(Math.round(value),55,130) });
    });
    const priceSize = compactInput('number', state.settings.price_font_size_pt || MENU_PRICE_FONT_SIZE.defaultPt, { min:MENU_PRICE_FONT_SIZE.minPt,max:MENU_PRICE_FONT_SIZE.maxPt,step:1 });
    priceSize.setAttribute('aria-label','Кегль цен');
    checkpointControl(priceSize);
    priceSize.addEventListener('input', () => {
      const value = Number(priceSize.value);
      if (Number.isFinite(value)) patchMenuSettings({ price_font_size_pt:clamp(Math.round(value),MENU_PRICE_FONT_SIZE.minPt,MENU_PRICE_FONT_SIZE.maxPt) });
    });
    typePanel.append(makeField('Шрифт',font), makeField('Масштаб, %',scale), makeField('Кегль цен, pt',priceSize));
    typography.append(typePanel);

    const palette = document.createElement('details');
    palette.className = 'scene-editor-inspector-group';
    palette.append(Object.assign(document.createElement('summary'), { textContent:'Оформление' }));
    const palettePanel = document.createElement('div');
    palettePanel.className = 'scene-editor-inspector-panel';
    const paletteGrid = document.createElement('div');
    paletteGrid.className = 'compact-form-grid';
    for (const [caption,key,fallback] of [['Акцент','accent_color','#F4C915'],['Текст','text_color','#F8FAFC']]) {
      const control = compactInput('color', state.settings[key] || fallback);
      control.setAttribute('aria-label',caption);
      checkpointControl(control);
      control.addEventListener('input', () => patchMenuSettings({ [key]:control.value.toUpperCase() }));
      paletteGrid.append(makeField(caption,control));
    }
    palettePanel.append(paletteGrid);
    palette.append(palettePanel);

    const content = document.createElement('details');
    content.className = 'scene-editor-inspector-group';
    content.open = true;
    content.append(Object.assign(document.createElement('summary'), { textContent:'Содержимое' }));
    const contentPanel = document.createElement('div');
    contentPanel.className = 'scene-editor-inspector-panel';
    const openEditor = document.createElement('button');
    openEditor.type = 'button';
    openEditor.className = 'button button-secondary scene-editor-open-table-editor';
    openEditor.textContent = 'Редактировать содержимое';
    openEditor.addEventListener('click', openTableEditor);
    const rowCount = document.createElement('small');
    rowCount.className = 'scene-editor-table-content-state';
    rowCount.textContent = `${state.rows.filter((row) => row?.enabled !== false).length} строк · изменения сразу видны в Preview`;
    contentPanel.append(openEditor, rowCount);
    content.append(contentPanel);

    stack.append(geometry, typography, palette, content);
    propertiesRoot.append(stack);
  }

  function refreshSelectionOverlay() {
    selectionLayer.replaceChildren();
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];

    const tableBox = document.createElement('button');
    tableBox.type = 'button';
    tableBox.className = 'scene-editor-table-selection-box';
    tableBox.classList.toggle('is-selected', selectedOwner === 'table');
    tableBox.setAttribute('aria-label', 'Выбрать таблицу меню');
    const applyTableGeometry = () => {
      tableBox.style.left = `${(Number(state.settings.table_x || 0) / SCENE_WIDTH) * 100}%`;
      tableBox.style.top = `${(Number(state.settings.table_y || 0) / SCENE_HEIGHT) * 100}%`;
      tableBox.style.width = `${(Number(state.settings.table_width_px || 1) / SCENE_WIDTH) * 100}%`;
      tableBox.style.height = `${(Number(state.settings.table_height_px || 1) / SCENE_HEIGHT) * 100}%`;
    };
    applyTableGeometry();
    const tableLabel = document.createElement('span');
    tableLabel.className = 'scene-editor-selection-label';
    tableLabel.textContent = 'Таблица меню';
    tableBox.append(tableLabel);

    if (selectedOwner === 'table') {
      for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const resize = document.createElement('span');
        resize.className = 'scene-editor-resize-handle';
        resize.dataset.direction = direction;
        resize.setAttribute('aria-hidden', 'true');
        resize.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          interactionActive = true;
          const pointerStartX = event.clientX;
          const pointerStartY = event.clientY;
          const startLeft = Number(state.settings.table_x || 0);
          const startTop = Number(state.settings.table_y || 0);
          const startRight = startLeft + Math.max(1, Number(state.settings.table_width_px || 1));
          const startBottom = startTop + Math.max(1, Number(state.settings.table_height_px || 1));
          const rect = shell.getBoundingClientRect();
          resize.setPointerCapture?.(event.pointerId);

          const move = (moveEvent) => {
            const deltaX = (moveEvent.clientX - pointerStartX) * (SCENE_WIDTH / Math.max(1, rect.width));
            const deltaY = (moveEvent.clientY - pointerStartY) * (SCENE_HEIGHT / Math.max(1, rect.height));
            let left = startLeft;
            let top = startTop;
            let right = startRight;
            let bottom = startBottom;
            if (direction.includes('w')) left = clamp(startLeft + deltaX, 0, right - 40);
            if (direction.includes('e')) right = clamp(startRight + deltaX, left + 40, SCENE_WIDTH);
            if (direction.includes('n')) top = clamp(startTop + deltaY, 0, bottom - 40);
            if (direction.includes('s')) bottom = clamp(startBottom + deltaY, top + 40, SCENE_HEIGHT);
            state.settings = {
              ...state.settings,
              table_x:Math.round(left),
              table_y:Math.round(top),
              table_width_px:Math.round(right - left),
              table_height_px:Math.round(bottom - top)
            };
            state.dirty = true;
            setDirty();
            setSelectionStatus();
            applyTableGeometry();
            scheduleDocumentRender();
          };
          const end = () => {
            interactionActive = false;
            resize.removeEventListener('pointermove', move);
            resize.removeEventListener('pointerup', end);
            resize.removeEventListener('pointercancel', end);
            renderSelectionOwners();
            scheduleDocumentRender();
          };
          resize.addEventListener('pointermove', move);
          resize.addEventListener('pointerup', end);
          resize.addEventListener('pointercancel', end);
        });
        tableBox.append(resize);
      }
    }

    tableBox.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.scene-editor-resize-handle')) return;
      event.preventDefault();
      history.checkpoint();
      selectOwner('table');
      interactionActive = true;
      const startX = event.clientX;
      const startY = event.clientY;
      const startTableX = Number(state.settings.table_x || 0);
      const startTableY = Number(state.settings.table_y || 0);
      const width = Math.max(1, Number(state.settings.table_width_px || 1));
      const height = Math.max(1, Number(state.settings.table_height_px || 1));
      const rect = shell.getBoundingClientRect();
      let moved = false;
      tableBox.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 4) moved = true;
        if (!moved) return;
        const deltaX = (moveEvent.clientX - startX) * (SCENE_WIDTH / Math.max(1, rect.width));
        const deltaY = (moveEvent.clientY - startY) * (SCENE_HEIGHT / Math.max(1, rect.height));
        state.settings = {
          ...state.settings,
          table_x:Math.round(clamp(startTableX + deltaX, 0, SCENE_WIDTH - width)),
          table_y:Math.round(clamp(startTableY + deltaY, 0, SCENE_HEIGHT - height))
        };
        state.dirty = true;
        setDirty();
        setSelectionStatus();
        applyTableGeometry();
        scheduleDocumentRender();
      };
      const end = (endEvent) => {
        const shouldOpenEditor = endEvent.type === 'pointerup' && !moved;
        interactionActive = false;
        tableBox.removeEventListener('pointermove', move);
        tableBox.removeEventListener('pointerup', end);
        tableBox.removeEventListener('pointercancel', end);
        renderSelectionOwners();
        scheduleDocumentRender();
        if (shouldOpenEditor) openTableEditor();
      };
      tableBox.addEventListener('pointermove', move);
      tableBox.addEventListener('pointerup', end);
      tableBox.addEventListener('pointercancel', end);
    });
    selectionLayer.append(tableBox);

    elements.forEach((sceneElement, index) => {
      if (sceneElement.enabled === false) return;
      const box = document.createElement('button');
      box.type = 'button';
      box.className = 'scene-editor-selection-box';
      box.classList.toggle('is-selected', selectedOwner === 'element' && sceneElement.id === state.selectedElementId);
      box.dataset.sceneElementId = sceneElement.id;
      applyBoxGeometry(box, sceneElement);
      box.setAttribute('aria-label', `Выбрать Элемент ${index + 1}`);
      const label = document.createElement('span');
      label.className = 'scene-editor-selection-label';
      label.textContent = `Элемент ${index + 1}`;
      box.append(label);

      if (selectedOwner === 'element' && sceneElement.id === state.selectedElementId) {
        for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
          const resize = document.createElement('span');
          resize.className = 'scene-editor-resize-handle';
          resize.dataset.direction = direction;
          resize.setAttribute('aria-hidden', 'true');
          resize.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            history.checkpoint();
            interactionActive = true;
            const pointerStartX = event.clientX;
            const pointerStartY = event.clientY;
            const startLeft = Number(sceneElement.x || 0);
            const startTop = Number(sceneElement.y || 0);
            const startRight = startLeft + Math.max(1, Number(sceneElement.width || 1));
            const startBottom = startTop + Math.max(1, Number(sceneElement.height || 1));
            const rect = shell.getBoundingClientRect();
            resize.setPointerCapture?.(event.pointerId);

            const move = (moveEvent) => {
              const deltaX = (moveEvent.clientX - pointerStartX) * (SCENE_WIDTH / Math.max(1, rect.width));
              const deltaY = (moveEvent.clientY - pointerStartY) * (SCENE_HEIGHT / Math.max(1, rect.height));
              let left = startLeft;
              let top = startTop;
              let right = startRight;
              let bottom = startBottom;
              if (direction.includes('w')) left = clamp(startLeft + deltaX, 0, right - 20);
              if (direction.includes('e')) right = clamp(startRight + deltaX, left + 20, SCENE_WIDTH);
              if (direction.includes('n')) top = clamp(startTop + deltaY, 0, bottom - 20);
              if (direction.includes('s')) bottom = clamp(startBottom + deltaY, top + 20, SCENE_HEIGHT);
              updateSceneElement(state, sceneElement.id, {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(right - left),
                height: Math.round(bottom - top)
              });
              const current = state.scene?.elements?.find((item) => item.id === sceneElement.id);
              if (current) applyBoxGeometry(box, current);
              setDirty();
              setSelectionStatus();
              scheduleSceneRender();
            };
            const end = () => {
              interactionActive = false;
              resize.removeEventListener('pointermove', move);
              resize.removeEventListener('pointerup', end);
              resize.removeEventListener('pointercancel', end);
              renderSelectionOwners();
            };
            resize.addEventListener('pointermove', move);
            resize.addEventListener('pointerup', end);
            resize.addEventListener('pointercancel', end);
          });
          box.append(resize);
        }
      }

      box.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.scene-editor-resize-handle')) return;
        event.preventDefault();
        history.checkpoint();
        selectInCanvas(sceneElement.id);
        interactionActive = true;

        const startX = event.clientX;
        const startY = event.clientY;
        const startSceneX = Number(sceneElement.x || 0);
        const startSceneY = Number(sceneElement.y || 0);
        const rect = shell.getBoundingClientRect();
        const width = Math.max(1, Number(sceneElement.width || 1));
        const height = Math.max(1, Number(sceneElement.height || 1));
        box.setPointerCapture?.(event.pointerId);

        const move = (moveEvent) => {
          const deltaX = (moveEvent.clientX - startX) * (SCENE_WIDTH / Math.max(1, rect.width));
          const deltaY = (moveEvent.clientY - startY) * (SCENE_HEIGHT / Math.max(1, rect.height));
          updateSceneElement(state, sceneElement.id, {
            x: Math.round(clamp(startSceneX + deltaX, 0, SCENE_WIDTH - width)),
            y: Math.round(clamp(startSceneY + deltaY, 0, SCENE_HEIGHT - height))
          });
          const current = state.scene?.elements?.find((item) => item.id === sceneElement.id);
          if (current) applyBoxGeometry(box, current);
          setDirty();
          setSelectionStatus();
          scheduleSceneRender();
        };
        const end = () => {
          interactionActive = false;
          box.removeEventListener('pointermove', move);
          box.removeEventListener('pointerup', end);
          box.removeEventListener('pointercancel', end);
          renderSelectionOwners();
        };
        box.addEventListener('pointermove', move);
        box.addEventListener('pointerup', end);
        box.addEventListener('pointercancel', end);
      });
      selectionLayer.append(box);
    });
    setSelectionStatus();
  }

  function sceneContext() {
    return {
      screen: state.screen,
      draft: { rows: state.rows, settings: state.settings },
      products: currentBundle?.products || [],
      packaging: currentBundle?.packaging || [],
      scene: state.scene
    };
  }

  async function renderScene() {
    if (!renderer || !active()) return;
    await renderer.render(sceneContext(), ['scene']);
    if (!active()) return;
    if (!interactionActive) refreshSelectionOverlay();
  }

  function scheduleSceneRender() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      void renderScene();
    });
  }

  function syncAddMenuAvailability() {
    const elements = Array.isArray(state.scene?.elements) ? state.scene.elements : [];
    const hasWeather = elements.some((item) => item?.type === 'weather');
    addButton.hidden = true;
    addMenu.querySelectorAll('[data-scene-element-type]').forEach((button) => {
      const type = button.dataset.sceneElementType;
      const unavailable = type === 'weather' && hasWeather;
      button.disabled = unavailable;
      if (type === 'weather') button.title = unavailable ? 'На сцене уже есть Погода' : '';
    });
  }

  function setAddMenuOpen(open) {
    const next = open === true && !addButton.disabled;
    addMenu.hidden = !next;
    addButton.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) syncAddMenuAvailability();
  }

  function renderLayers() {
    themeLayer.classList.toggle('is-selected', selectedOwner === 'theme');
    backgroundLayer.classList.toggle('is-selected', selectedOwner === 'background');
    promotionLayer.classList.toggle('is-selected', selectedOwner === 'promotion');
    tableLayer.classList.toggle('is-selected', selectedOwner === 'table');
    renderSceneLayerList(state, {
      container: layersRoot,
      onVisualChange: () => {
        setDirty();
        scheduleSceneRender();
      },
      onStructureChange: () => {
        setDirty();
        renderSelectionOwners();
        scheduleSceneRender();
      },
      onSelect: () => {
        selectedOwner = 'element';
        renderSelectionOwners();
        if (window.matchMedia('(max-width: 1100px)').matches) document.body.dataset.sceneMobilePanel = 'properties';
      }
    });
  }

  async function uploadSceneAsset(file) {
    if (!currentScreenId) throw new Error('Монитор не выбран.');
    return api.put(`${API.screens}/${currentScreenId}/scene-asset`, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' }
    });
  }

  function renderInspector() {
    if (selectedOwner === 'theme') {
      renderThemeInspector();
      setSelectionStatus();
      return;
    }
    if (selectedOwner === 'background') {
      renderBackgroundInspector();
      setSelectionStatus();
      return;
    }
    if (selectedOwner === 'promotion') {
      renderPromotionInspector();
      setSelectionStatus();
      return;
    }
    if (selectedOwner === 'table') {
      renderTableInspector();
      setSelectionStatus();
      return;
    }
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    const selected = renderSceneElementInspector(state, {
      container: propertiesRoot,
      onBeforeMutate: () => history.checkpoint(),
      onVisualChange: () => {
        setDirty();
        scheduleSceneRender();
      },
      onStructureChange: () => {
        setDirty();
        renderSelectionOwners();
        scheduleSceneRender();
      },
      onUpload: uploadSceneAsset
    });
    if (selected && ['weather', 'image'].includes(selected.type)) {
      propertiesRoot.querySelector('.scene-editor-inspector-stack')?.append(multiScreenApplyGroup(selected.type, selected));
    }
    if (!selected) {
      const title = element('scene-editor-properties-title');
      if (title) title.textContent = 'Элемент не выбран';
    }
  }

  function renderSelectionOwners() {
    renderLayers();
    renderInspector();
    syncAddMenuAvailability();
    refreshSelectionOverlay();
  }

  async function renderFullPreview() {
    renderer?.destroy();
    stage.replaceChildren();
    stage.dataset.playerActive = 'true';
    renderer = new PlayerSceneRenderer(stage, { autoplay: false, weatherPreview: true });
    await renderer.render(sceneContext(), ['screen', 'menu', 'scene']);
    fitPreviewShell();
    refreshSelectionOverlay();
    if (selectedOwner === 'table' && tableEditorOpen) renderTableEditLayer();
  }

  function hydrate(bundle) {
    currentBundle = bundle;
    replaceEditorState(state, {
      screen:bundle.screen,
      rows:Array.isArray(bundle.draft?.rows) ? bundle.draft.rows : [],
      settings:bundle.draft?.settings || {},
      scene:bundle.draft?.scene || { version:1, elements:[] },
      selectedElementId:null,
      dirty:false,
      revision:0,
      draftRevision:Number(bundle.draft?.revision || 0)
    });
    selectedOwner = 'none';
    tableEditorOpen = false;
    tableEditLayer.hidden = true;
    tableEditLayer.replaceChildren();
    document.body.classList.remove('scene-table-editor-open');
    history.clear();
    const resolution = element('scene-editor-resolution');
    if (resolution) resolution.textContent = state.screen?.resolution || '—';
    const previewTitle = element('scene-editor-preview-title');
    if (previewTitle) previewTitle.textContent = state.screen?.name || 'Рабочий экран';
    const menuLink = element('scene-editor-menu-link');
    if (menuLink instanceof HTMLAnchorElement) menuLink.href = `/screen-editor?id=${state.screen.id}`;
    setDirty();
    renderSelectionOwners();
  }

  async function loadScreen(screenId) {
    const id = Number(screenId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    currentScreenId = id;
    screenSelect.disabled = true;
    addButton.disabled = true;
    themeLayer.disabled = true;
    backgroundLayer.disabled = true;
    promotionLayer.disabled = true;
    tableLayer.disabled = true;
    const saveButton = element('scene-editor-save');
    if (saveButton) saveButton.disabled = true;
    setMessage('scene-editor-message', '');
    const bundle = await api.get(`${API.screens}/${id}/editor`);
    if (!active() || currentScreenId !== id) return;
    hydrate(bundle);
    rememberScreen(id);
    screenSelect.value = String(id);
    await renderFullPreview();
    if (!active()) return;
    form.setAttribute('aria-busy', 'false');
    element('scene-editor-save').disabled = false;
    addButton.disabled = false;
    themeLayer.disabled = false;
    backgroundLayer.disabled = false;
    promotionLayer.disabled = false;
    tableLayer.disabled = false;
    syncAddMenuAvailability();
    screenSelect.disabled = false;
  }

  async function loadScreens() {
    const [screenList,templateList] = await Promise.all([
      api.get(API.screens),
      api.get(`${API.screens}/menu-themes/custom`)
    ]);
    screens = Array.isArray(screenList) ? screenList : [];
    userThemeTemplates = Array.isArray(templateList) ? templateList : [];
    if (!active()) return;
    screenSelect.replaceChildren();
    if (!screens.length) {
      screenSelect.add(new Option('Нет мониторов', ''));
      screenSelect.disabled = true;
      layersRoot.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'scene-editor-empty',
        textContent: 'Сначала создайте монитор.'
      }));
      propertiesRoot.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'scene-editor-empty',
        textContent: 'Нет доступной сцены.'
      }));
      form.setAttribute('aria-busy', 'false');
      return;
    }
    screens.forEach((screen) => screenSelect.add(new Option(labelForScreen(screen), String(screen.id))));
    const selected = screenFromQuery(screens);
    screenSelect.value = String(selected.id);
    await loadScreen(selected.id);
  }

  screenSelect.addEventListener('change', () => {
    const next = Number(screenSelect.value);
    if (!Number.isSafeInteger(next) || next < 1 || next === currentScreenId) return;
    if (state.dirty && !window.confirm('Есть несохранённые изменения сцены. Переключить монитор без сохранения?')) {
      screenSelect.value = String(currentScreenId);
      return;
    }
    void loadScreen(next).catch((error) => {
      if (!active()) return;
      screenSelect.value = String(currentScreenId || '');
      setMessage('scene-editor-message', error.message);
    });
  });

  undoButton.addEventListener('click', () => {
    if (history.undo()) syncAfterHistory();
  });
  redoButton.addEventListener('click', () => {
    if (history.redo()) syncAfterHistory();
  });

  shell.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.scene-editor-selection-box,.scene-editor-table-selection-box,.scene-editor-table-edit-layer')) return;
    if (selectedOwner === 'none') return;
    selectedOwner = 'none';
    state.selectedElementId = null;
    renderSelectionOwners();
  });

  const onEditorKeydown = (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' && tableEditorOpen) {
      const openChoice = tableEditLayer.querySelector('.editor-preview-choice-popup:not([hidden])');
      if (openChoice) return;
      event.preventDefault();
      closeTableEditor();
      return;
    }
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const changed = event.shiftKey ? history.redo() : history.undo();
      if (changed) syncAfterHistory();
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (history.redo()) syncAfterHistory();
      return;
    }
    if (editing) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedOwner === 'element' && state.selectedElementId) {
      const removeButton = propertiesRoot.querySelector('.editor-element-delete');
      if (removeButton instanceof HTMLButtonElement) {
        event.preventDefault();
        removeButton.click();
      }
    }
  };
  form.addEventListener('keydown', onEditorKeydown);

  themeLayer.addEventListener('click', () => selectOwner('theme'));
  backgroundLayer.addEventListener('click', () => selectOwner('background'));
  promotionLayer.addEventListener('click', () => selectOwner('promotion'));
  tableLayer.addEventListener('click', () => {
    selectOwner('table');
    openTableEditor();
  });

  mobileToolbar?.querySelectorAll('[data-scene-mobile-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.dataset.sceneMobilePanel;
      if (panel === 'add') {
        document.body.dataset.sceneMobilePanel = 'layers';
        setAddMenuOpen(true);
        return;
      }
      document.body.dataset.sceneMobilePanel = document.body.dataset.sceneMobilePanel === panel ? '' : panel;
    });
  });

  addButton.addEventListener('click', () => {
    setAddMenuOpen(addMenu.hidden);
  });

  addMenu.querySelectorAll('[data-scene-element-type]').forEach((button) => {
    button.addEventListener('click', () => {
      history.checkpoint();
      const created = appendSceneElement(state, button.dataset.sceneElementType);
      if (!created) {
        syncAddMenuAvailability();
        return;
      }
      setAddMenuOpen(false);
      selectedOwner = 'element';
      setDirty();
      renderSelectionOwners();
      scheduleSceneRender();
    });
  });

  addMenu.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!addMenu.contains(document.activeElement) && document.activeElement !== addButton) setAddMenuOpen(false);
    }, 0);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentScreenId || !currentBundle) return;
    const save = element('scene-editor-save');
    setPending(save, true, 'Сохраняем…');
    try {
      const saved = await api.put(`${API.screens}/${currentScreenId}/draft`, {
        revision: state.draftRevision,
        rows: structuredClone(state.rows),
        settings: structuredClone(state.settings),
        scene: structuredClone(state.scene)
      });
      if (!active()) return;
      currentBundle = { ...currentBundle, screen:saved.screen, draft:saved.draft };
      state.screen = structuredClone(saved.screen);
      state.rows = structuredClone(saved.draft.rows || []);
      state.settings = structuredClone(saved.draft.settings || {});
      state.scene = structuredClone(saved.draft.scene || { version: 1, elements: [] });
      if (selectedOwner === 'element' && !state.scene.elements.some((item) => item.id === state.selectedElementId)) {
        state.selectedElementId = state.scene.elements[0]?.id || null;
        selectedOwner = state.selectedElementId ? 'element' : 'table';
      }
      state.draftRevision = Number(saved.draft.revision || state.draftRevision);
      state.dirty = false;
      history.clear();
      setDirty();
      renderSelectionOwners();
      setMessage('scene-editor-message', 'Сцена сохранена и отправлена на TV Player.', 'success');
    } catch (error) {
      if (active()) setMessage('scene-editor-message', error.message);
    } finally {
      if (active()) setPending(save, false, 'Сохраняем…');
    }
  });

  const onBeforeUnload = (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  resizeObserver = new ResizeObserver(() => {
    fitPreviewShell();
    refreshSelectionOverlay();
  });
  resizeObserver.observe(canvasPane);

  void loadScreens().catch((error) => {
    if (!active()) return;
    form.setAttribute('aria-busy', 'false');
    setMessage('scene-editor-message', error.message);
  });

  return {
    canLeave() {
      return !state.dirty || window.confirm('Есть несохранённые изменения сцены. Перейти без сохранения?');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      if (previewFrame) cancelAnimationFrame(previewFrame);
      if (documentPreviewFrame) cancelAnimationFrame(documentPreviewFrame);
      resizeObserver?.disconnect();
      renderer?.destroy();
      renderer = null;
      tableEditorOpen = false;
      tableEditLayer.hidden = true;
      tableEditLayer.replaceChildren();
      document.body.classList.remove('scene-table-editor-open');
      window.removeEventListener('beforeunload', onBeforeUnload);
      form.removeEventListener('keydown', onEditorKeydown);
      delete document.body.dataset.sceneMobilePanel;
    }
  };
}
