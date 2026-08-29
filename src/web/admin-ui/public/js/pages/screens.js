import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { navigate } from '../core/router.js';
import { state } from '../core/state.js';
import { element, makeButton, setMessage } from '../core/dom.js';
import { formatDate } from '../core/presentation.js';

async function loadScreens() {
  const [locations, screens, bindings] = await Promise.all([
    api.get(API.locations),
    api.get(API.screens),
    api.get(API.deviceBindings)
  ]);
  state.locations = locations;
  state.screens = screens;
  state.deviceBindings = Array.isArray(bindings) ? bindings : [];
  renderScreens();
  return screens;
}

function createSourceSelect() {
  const select = document.createElement('select');
  select.className = 'screen-copy-source';
  select.setAttribute('aria-label', 'Образец нового монитора');
  select.append(new Option('Пустой монитор', ''));
  state.screens.forEach((screen) => {
    select.append(new Option(`По образцу: ${screen.location_name} · ${screen.name}`, String(screen.id)));
  });
  return select;
}

function bindingForScreen(screenId) {
  return state.deviceBindings.find((binding) => Number(binding.screen_id) === Number(screenId)) || null;
}

function bindingSummary(binding) {
  if (!binding) return 'ТВ не подключён';
  const lastSeen = binding.session_last_seen_at || binding.device_last_seen_at;
  return lastSeen ? `ТВ подключён · связь ${formatDate(lastSeen)}` : 'ТВ подключён · ожидаем первый сеанс';
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

    const create = document.createElement('div');
    create.className = 'screen-create-control';
    const source = createSourceSelect();
    const add = makeButton('+ Монитор', '', () => void createScreenAtLocation(location, source.value));
    add.classList.add('screen-location-add');
    create.append(source, add);
    header.append(title, create);

    const screens = state.screens.filter((screen) => screen.location_id === location.id);
    const items = document.createElement('div');
    items.className = 'screen-location-items';
    screens.forEach((screen) => {
      const binding = bindingForScreen(screen.id);
      const row = document.createElement('div');
      row.className = 'screen-location-item';
      row.classList.toggle('has-tv-binding', Boolean(binding));
      const link = document.createElement('a');
      link.href = `/screen-editor?id=${screen.id}`;
      const name = document.createElement('strong');
      name.textContent = screen.name;
      const info = document.createElement('span');
      const status = screen.status === 'published' ? 'опубликовано' : screen.status === 'ready' ? 'готово' : 'черновик';
      info.textContent = `${screen.resolution} · ${status}`;
      const tv = document.createElement('span');
      tv.className = `screen-tv-binding${binding ? ' is-bound' : ''}`;
      tv.textContent = bindingSummary(binding);
      link.append(name, info, tv);

      const actions = document.createElement('div');
      actions.className = 'screen-location-actions';
      if (binding) {
        const unbind = makeButton('Отвязать ТВ', 'secondary', () => void unbindScreen(screen));
        unbind.classList.add('screen-tv-unbind');
        actions.append(unbind);
      }
      actions.append(makeButton('Удалить', 'danger', () => void deleteScreen(screen)));
      row.append(link, actions);
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

async function createScreenAtLocation(location, sourceId) {
  try {
    const payload = sourceId ? { source_screen_id: Number(sourceId) } : {};
    const screen = await api.post(`${API.locations}/${location.id}/screens`, payload);
    await navigate(`/screen-editor?id=${screen.id}`);
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

export function initialiseScreens() {
  if (!document.querySelector('[data-screen-hierarchy]')) return;
  void loadScreens().catch((error) => setMessage('screens-message', error.message));
  element('refresh-screens')?.addEventListener('click', () => { void loadScreens(); });
}
