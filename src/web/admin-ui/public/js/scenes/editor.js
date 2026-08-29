import {
  appendSlide,
  createElement,
  createScene,
  findScene,
  removeSlide,
  saveScene,
  setDisplayCount,
  touchScene
} from './model.js';

const state = {
  scene: null,
  selectedElementId: null,
  preview: false
};

const TYPE_LABELS = Object.freeze({
  text: 'Текст',
  table: 'Таблица',
  image: 'Изображение',
  logo: 'Логотип',
  video: 'Видео',
  weather: 'Погода',
  clock: 'Часы',
  shape: 'Фигура'
});

function currentSlide() {
  return state.scene.slides.find((slide) => slide.id === state.scene.active_slide_id) || state.scene.slides[0];
}

function selectedElement() {
  return currentSlide().elements.find((element) => element.id === state.selectedElementId) || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function showMessage(message) {
  const target = document.querySelector('#scene-editor-message');
  target.textContent = message;
  target.classList.remove('is-hidden', 'is-error');
  window.setTimeout(() => target.classList.add('is-hidden'), 1600);
}

function saveCurrentScene() {
  state.scene.name = document.querySelector('#scene-name').value.trim() || 'Новая сцена';
  state.scene = saveScene(state.scene);
  render();
  showMessage('Сцена сохранена как шаблон.');
}

function renderGuides() {
  const guides = document.querySelector('#scene-tv-guides');
  guides.replaceChildren();
  for (let index = 0; index < state.scene.display_count; index += 1) {
    const guide = document.createElement('div');
    guide.className = 'scene-tv-guide';
    guide.style.left = `${(index / state.scene.display_count) * 100}%`;
    guide.style.width = `${100 / state.scene.display_count}%`;
    const label = document.createElement('span');
    label.textContent = `TV ${index + 1}`;
    guide.append(label);
    guides.append(guide);
  }
}

function appendTextElement(parent, tagName, text, className = '') {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function renderElementContent(node, element) {
  if (element.type === 'clock') {
    appendTextElement(node, 'span', new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date()), 'scene-clock-value');
    const date = element.variant === 'minimal'
      ? ''
      : new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    appendTextElement(node, 'small', date);
    return;
  }
  if (element.type === 'weather') {
    appendTextElement(node, 'span', '☀', 'scene-weather-icon');
    appendTextElement(node, 'span', '+18°', 'scene-weather-temp');
    appendTextElement(node, 'small', element.variant === 'forecast' ? 'Сегодня · +18° · завтра +16°' : 'Ясно');
    return;
  }
  if (element.type === 'table') {
    appendTextElement(node, 'strong', element.content || 'Таблица каталога');
    const demo = document.createElement('div');
    demo.className = 'scene-table-demo';
    [['Позиция меню', '450 ₽'], ['Позиция меню', '520 ₽'], ['Позиция меню', '390 ₽']].forEach(([title, price]) => {
      appendTextElement(demo, 'span', title);
      appendTextElement(demo, 'b', price);
    });
    node.append(demo);
    return;
  }
  if (element.type === 'video') {
    appendTextElement(node, 'span', '▶', 'scene-media-symbol');
    appendTextElement(node, 'strong', element.content || 'Видео');
    return;
  }
  if (element.type === 'image' || element.type === 'logo') {
    appendTextElement(node, 'span', '▧', 'scene-media-symbol');
    appendTextElement(node, 'strong', element.content || TYPE_LABELS[element.type]);
    return;
  }
  if (element.type === 'shape') {
    node.textContent = '';
    return;
  }
  node.textContent = element.content || TYPE_LABELS[element.type];
}

function applyElementStyle(node, element) {
  const scene = state.scene;
  const stageWidth = document.querySelector('#scene-stage').clientWidth || scene.canvas_width;
  node.style.left = `${(element.x / scene.canvas_width) * 100}%`;
  node.style.top = `${(element.y / scene.canvas_height) * 100}%`;
  node.style.width = `${(element.width / scene.canvas_width) * 100}%`;
  node.style.height = `${(element.height / scene.canvas_height) * 100}%`;
  node.style.zIndex = String(element.z_index);
  node.style.opacity = String(element.opacity);
  node.style.color = element.style.color;
  node.style.background = element.style.background;
  node.style.borderRadius = `${element.style.radius || 0}px`;
  node.style.fontSize = `${Math.max(12, element.style.font_size * (stageWidth / scene.canvas_width))}px`;
  node.classList.toggle('has-shadow', element.effects.shadow);
  node.classList.toggle('has-glow', element.effects.glow);
  node.dataset.entrance = element.animation.entrance;
  node.dataset.loop = element.animation.loop;
}

function markSelected(node, element) {
  state.selectedElementId = element.id;
  document.querySelectorAll('.scene-element.is-selected').forEach((item) => item.classList.remove('is-selected'));
  node.classList.add('is-selected');
  renderInspector();
}

function installDrag(node, element) {
  node.addEventListener('pointerdown', (event) => {
    if (state.preview || event.target.closest('.scene-resize-handle')) return;
    markSelected(node, element);
    const stage = document.querySelector('#scene-stage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const start = { x: event.clientX, y: event.clientY, elementX: element.x, elementY: element.y };
    node.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.x) * (state.scene.canvas_width / rect.width);
      const dy = (moveEvent.clientY - start.y) * (state.scene.canvas_height / rect.height);
      element.x = clamp(start.elementX + dx, 0, state.scene.canvas_width - element.width);
      element.y = clamp(start.elementY + dy, 0, state.scene.canvas_height - element.height);
      touchScene(state.scene);
      applyElementStyle(node, element);
      renderInspectorGeometry();
    };
    const stop = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', stop);
      node.removeEventListener('pointercancel', stop);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', stop);
    node.addEventListener('pointercancel', stop);
  });

  const handle = node.querySelector('.scene-resize-handle');
  handle?.addEventListener('pointerdown', (event) => {
    if (state.preview) return;
    event.stopPropagation();
    markSelected(node, element);
    const stage = document.querySelector('#scene-stage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const start = { x: event.clientX, y: event.clientY, width: element.width, height: element.height };
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.x) * (state.scene.canvas_width / rect.width);
      const dy = (moveEvent.clientY - start.y) * (state.scene.canvas_height / rect.height);
      element.width = clamp(start.width + dx, 40, state.scene.canvas_width - element.x);
      element.height = clamp(start.height + dy, 40, state.scene.canvas_height - element.y);
      touchScene(state.scene);
      applyElementStyle(node, element);
      renderInspectorGeometry();
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });
}

function renderElements() {
  const layer = document.querySelector('#scene-elements-layer');
  layer.replaceChildren();
  for (const element of [...currentSlide().elements].sort((a, b) => a.z_index - b.z_index)) {
    const node = document.createElement('div');
    node.className = `scene-element scene-element-${element.type}`;
    node.dataset.elementId = element.id;
    node.classList.toggle('is-selected', !state.preview && element.id === state.selectedElementId);
    renderElementContent(node, element);
    if (!state.preview) {
      const handle = document.createElement('span');
      handle.className = 'scene-resize-handle';
      handle.setAttribute('aria-hidden', 'true');
      node.append(handle);
    }
    applyElementStyle(node, element);
    node.addEventListener('click', (event) => {
      if (state.preview) return;
      event.stopPropagation();
      state.selectedElementId = element.id;
      renderElements();
      renderInspector();
    });
    installDrag(node, element);
    layer.append(node);
  }
}

function renderSlides() {
  const target = document.querySelector('#scene-slide-list');
  target.replaceChildren();
  state.scene.slides.forEach((slide, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-slide-card';
    button.classList.toggle('active', slide.id === state.scene.active_slide_id);
    appendTextElement(button, 'span', String(index + 1));
    appendTextElement(button, 'strong', slide.name);
    appendTextElement(button, 'small', `${Math.round(slide.duration_ms / 1000)} сек · ${slide.elements.length} эл.`);
    button.addEventListener('click', () => {
      state.scene.active_slide_id = slide.id;
      state.selectedElementId = null;
      render();
    });
    const actions = document.createElement('div');
    actions.className = 'scene-slide-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Удалить слайд';
    remove.disabled = state.scene.slides.length <= 1;
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      if (removeSlide(state.scene, slide.id)) {
        state.selectedElementId = null;
        render();
      }
    });
    actions.append(remove);
    const wrapper = document.createElement('div');
    wrapper.className = 'scene-slide-item';
    wrapper.append(button, actions);
    target.append(wrapper);
  });
}

function renderInspectorGeometry() {
  const element = selectedElement();
  if (!element) return;
  document.querySelector('#element-x').value = Math.round(element.x);
  document.querySelector('#element-y').value = Math.round(element.y);
  document.querySelector('#element-width').value = Math.round(element.width);
  document.querySelector('#element-height').value = Math.round(element.height);
}

function renderInspector() {
  const element = selectedElement();
  document.querySelector('#inspector-empty').classList.toggle('is-hidden', Boolean(element));
  document.querySelector('#inspector-fields').classList.toggle('is-hidden', !element);
  document.querySelector('#inspector-title').textContent = element ? TYPE_LABELS[element.type] : 'Слайд';
  if (!element) return;
  renderInspectorGeometry();
  document.querySelector('#element-content').value = element.content || '';
  document.querySelector('#element-color').value = element.style.color || '#ffffff';
  document.querySelector('#element-background').value = element.style.background || 'transparent';
  document.querySelector('#element-font-size').value = element.style.font_size || 40;
  document.querySelector('#element-opacity').value = element.opacity ?? 1;
  document.querySelector('#element-variant').value = element.variant || 'default';
  document.querySelector('#element-shadow').checked = Boolean(element.effects.shadow);
  document.querySelector('#element-glow').checked = Boolean(element.effects.glow);
  document.querySelector('#element-entrance').value = element.animation.entrance || 'none';
  document.querySelector('#element-loop').value = element.animation.loop || 'none';
  document.querySelector('#element-exit').value = element.animation.exit || 'none';
}

function render() {
  const scene = state.scene;
  document.body.classList.toggle('scene-preview-mode', state.preview);
  document.querySelector('#scene-name').value = scene.name;
  document.querySelector('#scene-display-count').value = String(scene.display_count);
  document.querySelector('#scene-resolution-label').textContent = `${scene.canvas_width} × ${scene.canvas_height}`;
  document.querySelector('#slide-background-color').value = currentSlide().background.color || '#10141c';
  const stage = document.querySelector('#scene-stage');
  stage.style.aspectRatio = `${scene.canvas_width} / ${scene.canvas_height}`;
  stage.style.background = currentSlide().background.color;
  renderGuides();
  renderElements();
  renderSlides();
  renderInspector();
}

function addElement(type) {
  const slide = currentSlide();
  const element = createElement(type, state.scene, slide);
  slide.elements.push(element);
  state.selectedElementId = element.id;
  touchScene(state.scene);
  render();
}

function updateSelected(mutator) {
  const element = selectedElement();
  if (!element) return;
  mutator(element);
  element.x = clamp(element.x, 0, state.scene.canvas_width - element.width);
  element.y = clamp(element.y, 0, state.scene.canvas_height - element.height);
  element.width = clamp(element.width, 40, state.scene.canvas_width - element.x);
  element.height = clamp(element.height, 40, state.scene.canvas_height - element.y);
  touchScene(state.scene);
  renderElements();
  renderInspector();
}

function bindInspector() {
  [['#element-x', 'x'], ['#element-y', 'y'], ['#element-width', 'width'], ['#element-height', 'height']].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener('input', (event) => updateSelected((element) => { element[key] = Number(event.target.value); }));
  });
  document.querySelector('#element-content').addEventListener('input', (event) => updateSelected((element) => { element.content = event.target.value; }));
  document.querySelector('#element-color').addEventListener('input', (event) => updateSelected((element) => { element.style.color = event.target.value; }));
  document.querySelector('#element-background').addEventListener('change', (event) => updateSelected((element) => { element.style.background = event.target.value || 'transparent'; }));
  document.querySelector('#element-font-size').addEventListener('input', (event) => updateSelected((element) => { element.style.font_size = Number(event.target.value); }));
  document.querySelector('#element-opacity').addEventListener('input', (event) => updateSelected((element) => { element.opacity = Number(event.target.value); }));
  document.querySelector('#element-variant').addEventListener('change', (event) => updateSelected((element) => { element.variant = event.target.value; }));
  document.querySelector('#element-shadow').addEventListener('change', (event) => updateSelected((element) => { element.effects.shadow = event.target.checked; }));
  document.querySelector('#element-glow').addEventListener('change', (event) => updateSelected((element) => { element.effects.glow = event.target.checked; }));
  document.querySelector('#element-entrance').addEventListener('change', (event) => updateSelected((element) => { element.animation.entrance = event.target.value; }));
  document.querySelector('#element-loop').addEventListener('change', (event) => updateSelected((element) => { element.animation.loop = event.target.value; }));
  document.querySelector('#element-exit').addEventListener('change', (event) => updateSelected((element) => { element.animation.exit = event.target.value; }));

  document.querySelector('#element-delete').addEventListener('click', () => {
    const slide = currentSlide();
    const index = slide.elements.findIndex((item) => item.id === state.selectedElementId);
    if (index < 0) return;
    slide.elements.splice(index, 1);
    state.selectedElementId = null;
    touchScene(state.scene);
    render();
  });
  document.querySelector('#element-forward').addEventListener('click', () => updateSelected((element) => {
    const max = Math.max(0, ...currentSlide().elements.map((item) => item.z_index));
    element.z_index = max + 1;
  }));
  document.querySelector('#element-backward').addEventListener('click', () => updateSelected((element) => {
    element.z_index = Math.max(0, element.z_index - 1);
  }));
}

function bindGlobalControls() {
  document.querySelectorAll('[data-add-element]').forEach((button) => {
    button.addEventListener('click', () => addElement(button.dataset.addElement));
  });
  document.querySelector('#scene-stage').addEventListener('click', () => {
    if (state.preview) return;
    state.selectedElementId = null;
    renderElements();
    renderInspector();
  });
  document.querySelector('#scene-save').addEventListener('click', saveCurrentScene);
  document.querySelector('#scene-name').addEventListener('input', (event) => {
    state.scene.name = event.target.value;
    touchScene(state.scene);
  });
  document.querySelector('#scene-display-count').addEventListener('change', (event) => {
    setDisplayCount(state.scene, Number(event.target.value));
    render();
  });
  document.querySelector('#slide-background-color').addEventListener('input', (event) => {
    currentSlide().background.color = event.target.value;
    touchScene(state.scene);
    render();
  });
  document.querySelector('#add-slide').addEventListener('click', () => {
    appendSlide(state.scene);
    state.selectedElementId = null;
    render();
  });
  document.querySelector('#scene-preview-toggle').addEventListener('click', (event) => {
    state.preview = !state.preview;
    event.target.textContent = state.preview ? 'Вернуться в редактор' : 'Предпросмотр';
    render();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' || !state.selectedElementId || state.preview) return;
    if (document.activeElement?.matches('input,select,textarea')) return;
    document.querySelector('#element-delete').click();
  });
}

export function initialiseSceneEditor() {
  const sceneId = new URLSearchParams(window.location.search).get('id');
  state.scene = sceneId ? findScene(sceneId) : null;
  if (!state.scene) state.scene = saveScene(createScene());
  bindInspector();
  bindGlobalControls();
  render();
  window.setInterval(() => {
    if (currentSlide().elements.some((element) => element.type === 'clock')) renderElements();
  }, 30000);
}
