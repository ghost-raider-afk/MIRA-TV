import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, makeButton, setMessage } from '../core/dom.js';
import { formatDate } from '../core/presentation.js';

async function loadScreens() {
  const [locations, screens, bindings, revisions, assignments] = await Promise.all([
    api.get(API.locations), api.get(API.screens), api.get(API.deviceBindings),
    api.get(`${API.scenes}/published/revisions`), api.get(API.sceneAssignments)
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

function statusForBinding(binding) {
  if (!binding) return { label: 'Не подключён', detail: 'Ожидает привязки ТВ', className: 'is-offline' };
  const lastSeen = binding.session_last_seen_at || binding.device_last_seen_at;
  return {
    label: 'Подключён',
    detail: lastSeen ? `Связь: ${formatDate(lastSeen)}` : 'Ожидаем первый сеанс',
    className: 'is-online'
  };
}

function createSceneCell(screen, assignment) {
  const cell = document.createElement('div');
  cell.className = 'screen-scene-cell';
  const current = document.createElement('strong');
  current.textContent = assignment ? assignment.scene_name : 'Сцена не назначена';
  const revision = document.createElement('small');
  revision.textContent = assignment ? `Ревизия ${assignment.revision_number}` : 'Выберите опубликованную сцену';
  const controls = document.createElement('div');
  controls.className = 'screen-scene-quick-actions';
  const select = document.createElement('select');
  select.className = 'screen-scene-select';
  select.setAttribute('aria-label', `Сцена для ${screen.name}`);
  select.append(new Option('Выберите сцену', ''));
  const available = singleDisplayRevisions();
  for (const item of available) select.append(new Option(`${item.scene_name} · ${item.revision_number}`, item.id));
  if (assignment?.scene_revision_id) select.value = assignment.scene_revision_id;
  const apply = makeButton(assignment ? 'Сменить' : 'Применить', '', () => void assignScene(screen, select));
  apply.disabled = available.length === 0;
  controls.append(select, apply);
  if (assignment) controls.append(makeButton('Снять', 'secondary', () => void clearSceneAssignment(screen)));
  cell.append(current, revision, controls);
  if (available.length === 0) {
    const hint = document.createElement('small');
    hint.className = 'screen-scene-hint';
    hint.textContent = state.sceneRevisions.length
      ? 'Опубликованы только панорамные сцены. Для них нужен Display Group.'
      : 'Сначала опубликуйте сцену в разделе «Сцены».';
    cell.append(hint);
  }
  return cell;
}

function createMonitorRow(screen) {
  const binding = bindingForScreen(screen.id);
  const assignment = assignmentForScreen(screen.id);
  const status = statusForBinding(binding);
  const row = document.createElement('div');
  row.className = 'screen-monitor-row';

  const identity = document.createElement('div');
  identity.className = 'screen-monitor-cell screen-monitor-name';
  const name = document.createElement('strong');
  name.textContent = screen.name;
  const resolution = document.createElement('small');
  resolution.textContent = screen.resolution || '1920×1080';
  identity.append(name, resolution);

  const scene = createSceneCell(screen, assignment);

  const connection = document.createElement('div');
  connection.className = `screen-monitor-cell screen-connection ${status.className}`;
  const badge = document.createElement('strong');
  badge.textContent = status.label;
  const detail = document.createElement('small');
  detail.textContent = status.detail;
  connection.append(badge, detail);

  const actions = document.createElement('div');
  actions.className = 'screen-monitor-actions';
  if (binding) actions.append(makeButton('Отвязать', 'secondary', () => void unbindScreen(screen)));
  actions.append(makeButton('Удалить', 'danger', () => void deleteScreen(screen)));
  row.append(identity, scene, connection, actions);
  return row;
}

function renderScreens() {
  const list = document.querySelector('[data-screen-hierarchy]');
  const empty = document.querySelector('[data-screens-empty]');
  if (!list || !empty) return;
  const groups = state.locations.map((location) => {
    const group = document.createElement('section');
    group.className = 'screen-location-group';
    const header = document.createElement('header');
    header.className = 'screen-location-header';
    const title = document.createElement('div');
    title.className = 'screen-location-title';
    const heading = document.createElement('h2');
    heading.textContent = location.name;
    const address = document.createElement('p');
    address.textContent = location.address || 'Адрес не указан';
    title.append(heading, address);
    const add = makeButton('+ Монитор', '', () => void createScreenAtLocation(location));
    add.classList.add('screen-location-add');
    header.append(title, add);

    const body = document.createElement('div');
    body.className = 'screen-monitor-table';
    const tableHead = document.createElement('div');
    tableHead.className = 'screen-monitor-head';
    ['Монитор', 'Сцена', 'Подключение', 'Действия'].forEach((label) => {
      const cell = document.createElement('span');
      cell.textContent = label;
      tableHead.append(cell);
    });
    body.append(tableHead);
    const screens = state.screens.filter((screen) => Number(screen.location_id) === Number(location.id));
    if (screens.length) body.append(...screens.map(createMonitorRow));
    else {
      const hint = document.createElement('p');
      hint.className = 'screen-location-empty';
      hint.textContent = 'В этой точке пока нет мониторов.';
      body.append(hint);
    }
    group.append(header, body);
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
  } catch (error) { setMessage('screens-message', error.message); }
}

async function clearSceneAssignment(screen) {
  try {
    await api.delete(`${API.screens}/${screen.id}/scene-assignment`);
    setMessage('screens-message', `Сцена снята с монитора «${screen.name}».`, 'success');
    await loadScreens();
  } catch (error) { setMessage('screens-message', error.message); }
}

async function unbindScreen(screen) {
  if (!window.confirm(`Отвязать телевизор от монитора «${screen.name}»? На ТВ снова появится экран подключения.`)) return;
  try {
    await api.delete(`${API.deviceBindings}/${screen.id}`);
    setMessage('screens-message', `ТВ отвязан от монитора «${screen.name}».`, 'success');
    await loadScreens();
  } catch (error) { setMessage('screens-message', error.message); }
}

async function deleteScreen(screen) {
  const binding = bindingForScreen(screen.id);
  const warning = binding ? ' Подключённый ТВ также потеряет эту привязку.' : '';
  if (!window.confirm(`Удалить монитор «${screen.name}»?${warning}`)) return;
  try { await api.delete(`${API.screens}/${screen.id}`); await loadScreens(); }
  catch (error) { setMessage('screens-message', error.message); }
}

async function createScreenAtLocation(location) {
  try {
    await api.post(`${API.locations}/${location.id}/screens`, {});
    setMessage('screens-message', `Монитор создан в точке «${location.name}». Назначьте ему опубликованную сцену.`, 'success');
    await loadScreens();
  } catch (error) { setMessage('screens-message', error.message); }
}

export function initialiseScreens() {
  if (!document.querySelector('[data-screen-hierarchy]')) return;
  void loadScreens().catch((error) => setMessage('screens-message', error.message));
  element('refresh-screens')?.addEventListener('click', () => { void loadScreens(); });
}
