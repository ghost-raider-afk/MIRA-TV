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

function fitStageToWorkspace() {
  const shell = document.querySelector('#scene-stage-shell');
  const stage = document.querySelector('#scene-stage');
  const displays = document.querySelector('#scene-display-count');
  if (!shell || !stage) return;

  const count = Math.min(6, Math.max(1, Number(displays?.value) || 1));
  const aspect = (1920 * count) / 1080;
  const available = availableSize(shell);

  // Keep one real authoring width. Fit the complete Canvas as one visual surface
  // instead of resizing it and forcing every child element to recalculate.
  stage.style.width = '100%';
  stage.style.maxWidth = '100%';
  stage.style.transformOrigin = 'center center';
  const naturalHeight = available.width / aspect;
  const scale = naturalHeight > available.height ? available.height / naturalHeight : 1;
  stage.style.transform = scale < 0.9995 ? `scale(${scale})` : '';
}

function syncPanelState(body, toolsButton, inspectorButton) {
  const toolsOpen = !body.classList.contains('scene-tools-collapsed');
  const inspectorOpen = !body.classList.contains('scene-inspector-collapsed');
  toolsButton.setAttribute('aria-pressed', String(toolsOpen));
  inspectorButton.setAttribute('aria-pressed', String(inspectorOpen));
  toolsButton.classList.toggle('is-active', toolsOpen);
  inspectorButton.classList.toggle('is-active', inspectorOpen);
}

export function initialiseSceneDesigner() {
  const body = document.body;
  const toolbar = document.querySelector('.scene-toolbar-controls');
  const shell = document.querySelector('#scene-stage-shell');
  const tools = document.querySelector('.scene-tools-panel');
  const inspector = document.querySelector('.scene-inspector');
  if (!toolbar || !shell || !tools || !inspector || body.dataset.sceneDesignerBound === '1') return;
  body.dataset.sceneDesignerBound = '1';
  body.classList.add('scene-designer-mode', 'scene-tools-collapsed', 'scene-inspector-collapsed');

  const toolsButton = designerButton('scene-tools-toggle', 'Вставка', 'Показать или скрыть элементы и фон');
  const inspectorButton = designerButton('scene-inspector-toggle', 'Свойства', 'Показать или скрыть точные свойства объекта');
  toolbar.prepend(inspectorButton);
  toolbar.prepend(toolsButton);

  const closeTools = () => {
    body.classList.add('scene-tools-collapsed');
    syncPanelState(body, toolsButton, inspectorButton);
  };
  const closeInspector = () => {
    body.classList.add('scene-inspector-collapsed');
    syncPanelState(body, toolsButton, inspectorButton);
  };

  tools.querySelector('.scene-panel-heading')?.append(panelCloseButton('Закрыть панель вставки', closeTools));
  inspector.querySelector('.scene-panel-heading')?.append(panelCloseButton('Закрыть панель свойств', closeInspector));

  toolsButton.addEventListener('click', () => {
    body.classList.toggle('scene-tools-collapsed');
    syncPanelState(body, toolsButton, inspectorButton);
  });
  inspectorButton.addEventListener('click', () => {
    body.classList.toggle('scene-inspector-collapsed');
    syncPanelState(body, toolsButton, inspectorButton);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!body.classList.contains('scene-tools-collapsed') || !body.classList.contains('scene-inspector-collapsed')) {
      closeTools();
      closeInspector();
    }
  });

  document.querySelector('#scene-display-count')?.addEventListener('change', () => requestAnimationFrame(fitStageToWorkspace));
  window.addEventListener('resize', fitStageToWorkspace, { passive: true });
  const observer = new ResizeObserver(() => fitStageToWorkspace());
  observer.observe(shell);

  syncPanelState(body, toolsButton, inspectorButton);
  requestAnimationFrame(fitStageToWorkspace);
}
