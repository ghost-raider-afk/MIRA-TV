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

function scaledLength(value, ratio) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? `${number * ratio}px` : value;
}

function rescaleRenderedElements(stage, newScale) {
  for (const node of stage.querySelectorAll('.scene-render-element')) {
    const oldScale = Number.parseFloat(node.style.getPropertyValue('--scene-render-scale'));
    if (!Number.isFinite(oldScale) || oldScale <= 0 || Math.abs(oldScale - newScale) < 0.00001) continue;
    const ratio = newScale / oldScale;
    node.style.fontSize = scaledLength(node.style.fontSize, ratio);
    node.style.letterSpacing = scaledLength(node.style.letterSpacing, ratio);
    node.style.setProperty('--scene-element-blur', scaledLength(node.style.getPropertyValue('--scene-element-blur'), ratio));

    if (node.classList.contains('scene-element-table')) {
      node.style.setProperty('--scene-table-radius', scaledLength(node.style.getPropertyValue('--scene-table-radius'), ratio));
      node.style.setProperty('--scene-table-border-width', scaledLength(node.style.getPropertyValue('--scene-table-border-width'), ratio));
    } else {
      node.style.borderRadius = scaledLength(node.style.borderRadius, ratio);
      node.style.borderWidth = scaledLength(node.style.borderWidth, ratio);
    }
    node.style.setProperty('--scene-render-scale', String(newScale));
  }
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
  if (!stage) return;
  const metrics = canvasMetrics();
  const nextScale = Math.min(2, Math.max(0.1, Number(scale) || 1));
  const width = Math.max(1, Math.round(metrics.width * nextScale));
  const currentWidth = stage.clientWidth;
  stage.style.transform = '';
  stage.style.width = `${width}px`;
  stage.style.maxWidth = 'none';
  if (Math.abs(currentWidth - width) >= 1) rescaleRenderedElements(stage, nextScale);
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
  const stage = document.querySelector('#scene-stage');
  const metrics = canvasMetrics();
  return stage?.clientWidth ? stage.clientWidth / metrics.width : (zoomMode === 'fit' ? 1 : manualZoom);
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
  const fit = zoomButton('scene-zoom-fit', 'Вписать', 'Вписать слайд в рабочую область');
  const value = document.createElement('span');
  value.id = 'scene-zoom-value';
  value.className = 'scene-zoom-value';
  value.textContent = '100%';
  const input = zoomButton('scene-zoom-in', '+', 'Увеличить масштаб');
  const actual = zoomButton('scene-zoom-actual', '100%', 'Масштаб 1:1');
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

  document.querySelector('#scene-display-count')?.addEventListener('change', () => requestAnimationFrame(refreshStageZoom));
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
