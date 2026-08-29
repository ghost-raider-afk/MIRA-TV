import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

async function loadLocations() {
  state.locations = await api.get(API.locations);
  renderLocations();
  renderLocationCopyOptions();
  return state.locations;
}

function renderLocations() {
  const list = document.querySelector('[data-locations-list]');
  const empty = document.querySelector('[data-locations-empty]');
  if (!list || !empty) return;
  refreshList(list, empty, state.locations.map((location) => recordRow(
    location.name,
    `${location.address || 'Адрес не указан'} · мониторов: ${location.screen_count} · ${location.sftp_directory_name ? `SFTP: ${location.sftp_directory_name} (${location.sftp_username})` : 'SFTP не настроен'}`,
    [makeButton('Изменить', '', () => editLocation(location)), makeButton('Удалить', 'danger', () => void deleteLocation(location))]
  )));
}

function renderLocationCopyOptions() {
  const select = element('location-copy-source');
  if (!(select instanceof HTMLSelectElement)) return;
  const selected = select.value;
  select.replaceChildren(
    new Option('Пустая точка', ''),
    ...state.locations.map((location) => new Option(`По образцу: ${location.name}`, String(location.id)))
  );
  select.value = selected;
}

function resetLocationForm() {
  const form = element('location-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingLocationId = null;
  form.reset();
  element('location-active').checked = true;
  element('location-copy-source').disabled = false;
  element('location-copy-field')?.classList.remove('is-hidden');
  element('location-form-title').textContent = 'Новая точка';
  element('location-submit').textContent = 'Создать точку';
  element('cancel-location-edit')?.classList.add('is-hidden');
  clearMessage('location-message');
}

function editLocation(location) {
  state.editingLocationId = location.id;
  element('location-name').value = location.name;
  element('location-address').value = location.address || '';
  element('location-active').checked = location.active;
  element('location-copy-source').disabled = true;
  element('location-copy-field')?.classList.add('is-hidden');
  element('location-form-title').textContent = 'Редактирование точки';
  element('location-submit').textContent = 'Сохранить точку';
  element('cancel-location-edit')?.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteLocation(location) {
  if (!window.confirm(`Удалить точку «${location.name}»?`)) return;
  try {
    await api.delete(`${API.locations}/${location.id}`);
    await loadLocations();
  } catch (error) {
    setMessage('location-message', error.message);
  }
}

export function initialiseLocations() {
  const form = element('location-form');
  if (!(form instanceof HTMLFormElement)) return;
  void loadLocations().catch((error) => setMessage('location-message', error.message));
  element('refresh-locations')?.addEventListener('click', () => { void loadLocations(); });
  element('cancel-location-edit')?.addEventListener('click', resetLocationForm);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('location-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = {
        name: element('location-name').value,
        address: element('location-address').value,
        active: element('location-active').checked
      };
      if (state.editingLocationId) {
        await api.put(`${API.locations}/${state.editingLocationId}`, payload);
      } else {
        const sourceId = Number(element('location-copy-source').value);
        if (sourceId) await api.post(`${API.locations}/${sourceId}/clone`, payload);
        else await api.post(API.locations, payload);
      }
      resetLocationForm();
      await loadLocations();
      await loadNotifications();
    } catch (error) {
      setMessage('location-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
