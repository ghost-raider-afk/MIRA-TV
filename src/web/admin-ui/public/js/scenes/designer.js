const ZOOM_STEPS = Object.freeze([0.125, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2]);
let zoomMode = 'fit';
let manualZoom = 1;

function designerButton(id, label, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = 'button button-secondary scene-designer-toggle';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function panelCloseButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scene-panel-close';
  button.setAttribute('aria-label', label);
  button.textContent = '×';
  button.addEventListener('click', onClick);
  return button;
}

function availableSize(shell) {
  const style = getComputedStyle(shell);
  const horizontal = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const vertical = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  return {
    width: Math.max(1, shell.clientWidth - horizontal),
    height: Math.max(1, shell.clientHeight - vertical)
  };
}

function canvasMetrics() {
  const displays = document.querySelector('#scene-display-count');
  const count = Math.min(6, Math.max(1, Number(displays?.value) || 1));
  return { count, width: 1920 * count, height: 1080 };
}

function stageViewport() {
  return document.querySelector('#scene-stage-viewport');
}

function mountStageViewport() {
  const stage = document.querySelector('#scene-stage');
  const shell = document.querySelector('#scene-stage-shell');
  if (!stage || !shell) return null;
  const existing = stageViewport();
  if (existing) return existing;

  const viewport = document.createElement('div');
  viewport.id = 'scene-stage-viewport';
  viewport.className = 'scene-stage-viewport';
  viewport.style.position = 'relative';
  viewport.style.flex = '0 0 auto';
  viewport.style.margin = 'auto';
  viewport.style.overflow = 'visible';
  stage.before(viewport);
  viewport.append(stage);

  stage.style.position = 'absolute';
  stage.style.inset = '0 auto auto 0';
  stage.style.margin = '0';
  stage.style.transformOrigin = '0 0';
  stage.style.maxWidth = 'none';
  stage.style.maxHeight = 'none';
  return viewport;
}

function zoomLabel() {
  return document.querySelector('#scene-zoom-value');
}

function syncZoomControls(scale) {
  const value = zoomLabel();
  if (value) value.textContent = `${Math.round(scale * 100)}%`;
  document.querySelector('#scene-zoom-fit')?.classList.toggle('is-active', zoomMode === 'fit');
}

function applyStageScale(scale) {
  const stage = document.querySelector('#scene-stage');
  const viewport = mountStageViewport();
  if (!stage || !viewport) return;
  const metrics = canvasMetrics();
  const nextScale = Math.min(2, Math.max(0.05, Number(scale) || 1));

  // Canonical geometry always stays in final-pixel coordinates. Zoom is only a camera.
  stage.style.width = `${metrics.width}px`;
  stage.style.height = `${metrics.height}px`;
  stage.style.transform = `scale(${nextScale})`;
  viewport.style.width = `${Math.max(1, Math.round(metrics.width * nextScale))}px`;
  viewport.style.height = `${Math.max(1, Math.round(metrics.height * nextScale))}px`;
  syncZoomControls(nextScale);
}

function fitStageToWorkspace() {
  const shell = document.querySelector('#scene-stage-shell');
  if (!shell) return;
  const metrics = canvasMetrics();
  const aspect = metrics.width / metrics.height;
  const available = availableSize(shell);
  const width = Math.max(1, Math.floor(Math.min(available.width, available.height * aspect)));
  applyStageScale(width / metrics.width);
}

function refreshStageZoom() {
  if (zoomMode === 'fit') fitStageToWorkspace();
  else applyStageScale(manualZoom);
}

function currentScale() {
  const viewport = stageViewport();
  const metrics = canvasMetrics();
  return viewport?.clientWidth ? viewport.clientWidth / metrics.width : (zoomMode === 'fit' ? 1 : manualZoom);
}

function stepZoom(direction) {
  const current = currentScale();
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  const next = steps.find((value) => direction > 0 ? value > current + 0.005 : value < current - 0.005)
    ?? (direction > 0 ? ZOOM_STEPS.at(-1) : ZOOM_STEPS[0]);
  zoomMode = 'manual';
  manualZoom = next;
  applyStageScale(manualZoom);
}

function zoomButton(id, label, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = 'scene-zoom-button';
  button.textContent = label;
  button.title = title;
  return button;
}

function mountZoomControls() {
  const meta = document.querySelector('.scene-stage-meta');
  if (!meta || meta.querySelector('.scene-zoom-controls')) return;
  const controls = document.createElement('div');
  controls.className = 'scene-zoom-controls';
  const out = zoomButton('scene-zoom-out', '−', 'Уменьшить масштаб');
  const fit = zoomButton('scene-zoom-fit', 'Вписать', 'Вписать итоговый холст в рабочую область');
  const value = document.createElement('span');
  value.id = 'scene-zoom-value';
  value.className = 'scene-zoom-value';
  value.textContent = '100%';
  const input = zoomButton('scene-zoom-in', '+', 'Увеличить масштаб');
  const actual = zoomButton('scene-zoom-actual', '100%', 'Итоговый холст 1:1');
  controls.append(out, fit, value, input, actual);
  meta.append(controls);

  out.addEventListener('click', () => stepZoom(-1));
  input.addEventListener('click', () => stepZoom(1));
  fit.addEventListener('click', () => {
    zoomMode = 'fit';
    fitStageToWorkspace();
  });
  actual.addEventListener('click', () => {
    zoomMode = 'manual';
    manualZoom = 1;
    applyStageScale(1);
  });
}

function mountSlidesPanel() {
  const layout = document.querySelector('.scene-editor-layout');
  const stageColumn = document.querySelector('.scene-stage-column');
  const slides = document.querySelector('.scene-slides-bar');
  if (!layout || !stageColumn || !slides) return;
  slides.classList.add('scene-slides-panel');
  if (slides.parentElement !== layout) layout.insertBefore(slides, stageColumn);
}

function syncToolsState(body, button) {
  const open = !body.classList.contains('scene-tools-collapsed');
  button.setAttribute('aria-pressed', String(open));
  button.classList.toggle('is-active', open);
}

export function initialiseSceneDesigner() {
  const body = document.body;
  const toolbar = document.querySelector('.scene-toolbar-controls');
  const shell = document.querySelector('#scene-stage-shell');
  const tools = document.querySelector('.scene-tools-panel');
  const inspector = document.querySelector('.scene-inspector');
  if (!toolbar || !shell || !tools || !inspector || body.dataset.sceneDesignerBound === '1') return;
  body.dataset.sceneDesignerBound = '1';
  body.classList.add('scene-designer-mode', 'scene-tools-collapsed');
  body.classList.remove('scene-inspector-collapsed');
  mountSlidesPanel();
  mountStageViewport();
  mountZoomControls();

  const toolsButton = designerButton('scene-tools-toggle', 'Вставка', 'Элементы, фон и медиаданные слайда');
  toolbar.prepend(toolsButton);

  const closeTools = () => {
    body.classList.add('scene-tools-collapsed');
    syncToolsState(body, toolsButton);
  };

  tools.querySelector('.scene-panel-heading')?.append(panelCloseButton('Закрыть панель вставки', closeTools));

  toolsButton.addEventListener('click', () => {
    body.classList.toggle('scene-tools-collapsed');
    syncToolsState(body, toolsButton);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !body.classList.contains('scene-tools-collapsed')) closeTools();
  });

  // This listener is bound before the editor. Update canonical stage size first,
  // so renderer always sees final canvas pixels rather than viewport pixels.
  document.querySelector('#scene-display-count')?.addEventListener('change', refreshStageZoom);
  window.addEventListener('resize', () => {
    if (zoomMode === 'fit') fitStageToWorkspace();
  }, { passive: true });
  const observer = new ResizeObserver(() => {
    if (zoomMode === 'fit') fitStageToWorkspace();
  });
  observer.observe(shell);

  syncToolsState(body, toolsButton);
  requestAnimationFrame(refreshStageZoom);
}
