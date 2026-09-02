import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, makeButton, setMessage } from '../core/dom.js';
import { formatDate } from '../core/presentation.js';

async function loadScreens() {
  const [locations, screens, bindings, revisions, assignments] = await Promise.all([
    api.get(API.locations),
    api.get(API.screens),
    api.get(API.deviceBindings),
    api.get(`${API.scenes}/published/revisions`),
    api.get(API.sceneAssignments)
  ]);
  state.locations = Array.isArray(locations) ? locations : [];
  state.screens = Array.isArray(screens) ? screens : [];
  state.deviceBindings = Array.isArray(bindings) ? bindings : [];
  state.sceneRevisions = Array.isArray(revisions) ? revisions : [];
  state.sceneAssignments = Array.isArray(assignments) ? assignments : [];
  renderScreens();
  return state.screens;
}

function bindingForScreen(screenId) {
  return state.deviceBindings.find((binding) => Number(binding.screen_id) === Number(screenId)) || null;
}

function assignmentForScreen(screenId) {
  return state.sceneAssignments.find((assignment) => Number(assignment.screen_id) === Number(screenId)) || null;
}

function singleDisplayRevisions() {
  return state.sceneRevisions.filter((revision) => Number(revision.display_count) === 1);
}

function bindingSummary(binding) {
  if (!binding) return 'ТВ не подключён';
  const lastSeen = binding.session_last_seen_at || binding.device_last_seen_at;
  return lastSeen ? `ТВ подключён · связь ${formatDate(lastSeen)}` : 'ТВ подключён · ожидаем первый сеанс';
}

function assignmentSummary(assignment) {
  return assignment ? `${assignment.scene_name} · ревизия ${assignment.revision_number}` : 'Сцена не назначена';
}

function createSceneControl(screen, assignment) {
  const control = document.createElement('div');
  control.className = 'screen-scene-control';

  const current = document.createElement('div');
  current.className = 'screen-scene-current';
  const label = document.createElement('span');
  label.textContent = 'СЦЕНА ПОКАЗА';
  const value = document.createElement('strong');
  value.textContent = assignmentSummary(assignment);
  current.append(label, value);

  const actions = document.createElement('div');
  actions.className = 'screen-scene-actions';
  const select = document.createElement('select');
  select.className = 'screen-scene-select';
  select.setAttribute('aria-label', `Опубликованная сцена для ${screen.name}`);
  select.append(new Option('Выберите сцену', ''));
  for (const revision of singleDisplayRevisions()) {
    select.append(new Option(`${revision.scene_name} · ревизия ${revision.revision_number}`, revision.id));
  }
  if (assignment?.scene_revision_id) select.value = assignment.scene_revision_id;

  const apply = makeButton(assignment ? 'Применить другую' : 'Применить', '', () => void assignScene(screen, select));
  apply.classList.add('screen-scene-apply');
  apply.disabled = singleDisplayRevisions().length === 0;
  actions.append(select, apply);

  if (assignment) {
    const clear = makeButton('Снять сцену', 'secondary', () => void clearSceneAssignment(screen));
    clear.classList.add('screen-scene-clear');
    actions.append(clear);
  }

  control.append(current, actions);
  if (state.sceneRevisions.length === 0) {
    const hint = document.createElement('small');
    hint.textContent = 'Сначала создайте и опубликуйте сцену в разделе «Сцены».';
    control.append(hint);
  } else if (singleDisplayRevisions().length === 0) {
    const hint = document.createElement('small');
    hint.textContent = 'Опубликованы только панорамные сцены. Для них нужен Display Group.';
    control.append(hint);
  }
  return control;
}

function renderScreens() {
  const list = document.querySelector('[data-screen-hierarchy]');
  const empty = document.querySelector('[data-screens-empty]');
  if (!list || !empty) return;
  const groups = state.locations.map((location) => {
    const group = document.createElement('article');
    group.className = 'screen-location-group';
    const header = document.createElement('header');
    header.className = 'screen-location-header';
    const title = document.createElement('div');
    title.className = 'screen-location-title';
    const heading = document.createElement('h2');
    heading.textContent = location.name;
    heading.title = location.name;
    const details = document.createElement('p');
    details.textContent = location.address || 'Адрес не указан';
    title.append(heading, details);

    const add = makeButton('+ Монитор', '', () => void createScreenAtLocation(location));
    add.classList.add('screen-location-add');
    header.append(title, add);

    const screens = state.screens.filter((screen) => screen.location_id === location.id);
    const items = document.createElement('div');
    items.className = 'screen-location-items';
    screens.forEach((screen) => {
      const binding = bindingForScreen(screen.id);
      const assignment = assignmentForScreen(screen.id);
      const row = document.createElement('div');
      row.className = 'screen-location-item';
      row.classList.toggle('has-tv-binding', Boolean(binding));

      const main = document.createElement('div');
      main.className = 'screen-location-main';
      const identity = document.createElement('div');
      identity.className = 'screen-monitor-identity';
      const name = document.createElement('strong');
      name.textContent = screen.name;
      const info = document.createElement('span');
      info.textContent = screen.resolution || '1920×1080';
      const tv = document.createElement('span');
      tv.className = `screen-tv-binding${binding ? ' is-bound' : ''}`;
      tv.textContent = bindingSummary(binding);
      identity.append(name, info, tv);
      main.append(identity, createSceneControl(screen, assignment));

      const actions = document.createElement('div');
      actions.className = 'screen-location-actions';
      if (binding) {
        const unbind = makeButton('Отвязать ТВ', 'secondary', () => void unbindScreen(screen));
        unbind.classList.add('screen-tv-unbind');
        actions.append(unbind);
      }
      actions.append(makeButton('Удалить', 'danger', () => void deleteScreen(screen)));
      row.append(main, actions);
      items.append(row);
    });
    if (screens.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'empty-state compact-empty';
      hint.textContent = 'Мониторов пока нет.';
      items.append(hint);
    }
    group.append(header, items);
    return group;
  });
  list.replaceChildren(...groups);
  empty.classList.toggle('is-hidden', state.locations.length !== 0);
}

async function assignScene(screen, select) {
  const revisionId = String(select.value || '').trim();
  if (!revisionId) {
    setMessage('screens-message', 'Выберите опубликованную сцену.');
    select.focus();
    return;
  }
  try {
    await api.put(`${API.screens}/${screen.id}/scene-assignment`, { scene_revision_id: revisionId });
    setMessage('screens-message', `Сцена применена к монитору «${screen.name}».`, 'success');
    await loadScreens();
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function clearSceneAssignment(screen) {
  try {
    await api.delete(`${API.screens}/${screen.id}/scene-assignment`);
    setMessage('screens-message', `Сцена снята с монитора «${screen.name}».`, 'success');
    await loadScreens();
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function unbindScreen(screen) {
  if (!window.confirm(`Отвязать телевизор от монитора «${screen.name}»? На ТВ снова появится экран подключения.`)) return;
  try {
    await api.delete(`${API.deviceBindings}/${screen.id}`);
    setMessage('screens-message', `ТВ отвязан от монитора «${screen.name}».`, 'success');
    await loadScreens();
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function deleteScreen(screen) {
  const binding = bindingForScreen(screen.id);
  const warning = binding ? ' Подключённый ТВ также потеряет эту привязку.' : '';
  if (!window.confirm(`Удалить монитор «${screen.name}»?${warning}`)) return;
  try {
    await api.delete(`${API.screens}/${screen.id}`);
    await loadScreens();
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function createScreenAtLocation(location) {
  try {
    await api.post(`${API.locations}/${location.id}/screens`, {});
    setMessage('screens-message', `Монитор создан в точке «${location.name}». Назначьте ему опубликованную сцену.`, 'success');
    await loadScreens();
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

export function initialiseScreens() {
  if (!document.querySelector('[data-screen-hierarchy]')) return;
  void loadScreens().catch((error) => setMessage('screens-message', error.message));
  element('refresh-screens')?.addEventListener('click', () => { void loadScreens(); });
}
