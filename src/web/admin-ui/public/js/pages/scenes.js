import { createScene } from '../scenes/model.js';
import { createSceneRemote, deleteSceneRemote, duplicateSceneRemote, listScenes } from '../scenes/store.js';

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function openScene(sceneId) {
  window.location.href = `/scene-editor?id=${encodeURIComponent(sceneId)}`;
}

function showMessage(message, error = false) {
  const target = document.querySelector('#scenes-message');
  if (!target) return;
  target.textContent = message;
  target.classList.remove('is-hidden');
  target.classList.toggle('is-error', error);
}

function clearMessage() {
  document.querySelector('#scenes-message')?.classList.add('is-hidden');
}

function makeMeta(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

function setPending(button, pending, label) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
  button.disabled = pending;
  button.textContent = pending ? label : button.dataset.idleLabel;
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
  resolution.textContent = `${scene.canvas_width || scene.display_count * 1920} × ${scene.canvas_height || 1080}`;
  preview.append(previewGrid, name, resolution);

  const body = document.createElement('div');
  body.className = 'scene-card-body';
  const meta = document.createElement('div');
  const slideCount = Number(scene.slide_count) || 0;
  meta.append(
    makeMeta(`${slideCount} ${slideCount === 1 ? 'слайд' : 'слайда'}`),
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
  duplicate.addEventListener('click', async () => {
    clearMessage();
    setPending(duplicate, true, 'Копируем…');
    try {
      const copy = await duplicateSceneRemote(scene.id);
      openScene(copy.id);
    } catch (error) {
      setPending(duplicate, false, 'Копируем…');
      showMessage(error?.message || 'Не удалось скопировать сцену.', true);
    }
  });
  remove.addEventListener('click', async () => {
    if (!window.confirm(`Удалить сцену «${scene.name}»?`)) return;
    clearMessage();
    setPending(remove, true, 'Удаляем…');
    try {
      await deleteSceneRemote(scene.id);
      await renderLibrary();
    } catch (error) {
      setPending(remove, false, 'Удаляем…');
      showMessage(error?.message || 'Не удалось удалить сцену.', true);
    }
  });
  return card;
}

async function renderLibrary() {
  const target = document.querySelector('#scene-library');
  const empty = document.querySelector('#scene-empty');
  try {
    const scenes = await listScenes();
    target.replaceChildren(...scenes.map(renderSceneCard));
    target.classList.toggle('is-hidden', scenes.length === 0);
    empty.classList.toggle('is-hidden', scenes.length > 0);
  } catch (error) {
    target.replaceChildren();
    target.classList.add('is-hidden');
    empty.classList.add('is-hidden');
    showMessage(error?.message || 'Не удалось загрузить сцены.', true);
  }
}

async function createNewScene(button) {
  clearMessage();
  setPending(button, true, 'Создаём…');
  try {
    const scene = await createSceneRemote(createScene());
    openScene(scene.id);
  } catch (error) {
    setPending(button, false, 'Создаём…');
    showMessage(error?.message || 'Не удалось создать сцену.', true);
  }
}

export function initialiseScenes() {
  document.querySelector('#create-scene')?.addEventListener('click', (event) => void createNewScene(event.currentTarget));
  document.querySelector('#create-first-scene')?.addEventListener('click', (event) => void createNewScene(event.currentTarget));
  void renderLibrary();
}
