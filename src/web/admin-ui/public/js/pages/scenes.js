import { createScene, deleteScene, duplicateScene, loadScenes, saveScene } from '../scenes/model.js';

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function openScene(sceneId) {
  window.location.href = `/scene-editor?id=${encodeURIComponent(sceneId)}`;
}

function makeMeta(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

function renderSceneCard(scene) {
  const card = document.createElement('article');
  card.className = 'scene-card';

  const preview = document.createElement('button');
  preview.className = 'scene-card-preview';
  preview.type = 'button';
  preview.setAttribute('aria-label', `Открыть сцену ${scene.name}`);

  const previewGrid = document.createElement('span');
  previewGrid.className = 'scene-card-preview-grid';
  previewGrid.style.setProperty('--scene-card-displays', String(scene.display_count));

  const name = document.createElement('strong');
  name.textContent = scene.name;
  const resolution = document.createElement('small');
  const width = scene.canvas_width || scene.display_count * 1920;
  resolution.textContent = `${width} × ${scene.canvas_height}`;
  preview.append(previewGrid, name, resolution);

  const body = document.createElement('div');
  body.className = 'scene-card-body';
  const meta = document.createElement('div');
  meta.append(
    makeMeta(`${scene.slides.length} ${scene.slides.length === 1 ? 'слайд' : 'слайда'}`),
    makeMeta(`${scene.display_count} TV`),
    makeMeta(`Изменено ${formatUpdated(scene.updated_at)}`)
  );

  const actions = document.createElement('div');
  actions.className = 'scene-card-actions';
  const duplicate = document.createElement('button');
  duplicate.className = 'button button-secondary';
  duplicate.type = 'button';
  duplicate.textContent = 'Копировать';
  const remove = document.createElement('button');
  remove.className = 'button button-danger';
  remove.type = 'button';
  remove.textContent = 'Удалить';
  actions.append(duplicate, remove);
  body.append(meta, actions);
  card.append(preview, body);

  preview.addEventListener('click', () => openScene(scene.id));
  duplicate.addEventListener('click', () => {
    const copy = duplicateScene(scene.id);
    if (copy) openScene(copy.id);
  });
  remove.addEventListener('click', () => {
    if (!window.confirm(`Удалить сцену «${scene.name}»?`)) return;
    deleteScene(scene.id);
    renderLibrary();
  });
  return card;
}

function renderLibrary() {
  const target = document.querySelector('#scene-library');
  const empty = document.querySelector('#scene-empty');
  const scenes = loadScenes();
  target.replaceChildren(...scenes.map(renderSceneCard));
  target.classList.toggle('is-hidden', scenes.length === 0);
  empty.classList.toggle('is-hidden', scenes.length > 0);
}

function createNewScene() {
  const scene = saveScene(createScene());
  openScene(scene.id);
}

export function initialiseScenes() {
  document.querySelector('#create-scene')?.addEventListener('click', createNewScene);
  document.querySelector('#create-first-scene')?.addEventListener('click', createNewScene);
  renderLibrary();
}
