import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { clearMessage, element, setMessage, setPending } from '../core/dom.js';
import { showToast } from '../core/toasts.js';
import { formatDate } from '../core/presentation.js';

const SEVERITY_LABELS = Object.freeze({ success: 'Успешно', warning: 'Предупреждение', error: 'Ошибка', info: 'Информация' });
const CATEGORY_LABELS = Object.freeze({
  interface: 'Интерфейс', catalog: 'Каталог', monitors: 'Мониторы', tv: 'ТВ', auth: 'Авторизация', settings: 'Настройки', weather: 'Погода', system: 'Система'
});
let journal = { items: [], stats: {}, retention_days: 0, max_entries: 0 };
let filterTimer = null;

function metadataValue(event, key) {
  return event?.metadata && typeof event.metadata === 'object' ? event.metadata[key] : undefined;
}

function eventCard(event) {
  const article = document.createElement('article');
  article.className = `settings-card event-journal-entry is-${event.severity || 'info'}`;

  const head = document.createElement('div');
  head.className = 'event-journal-entry-head';
  const badges = document.createElement('div');
  badges.className = 'event-journal-badges';
  const severity = document.createElement('span');
  severity.className = `event-severity is-${event.severity || 'info'}`;
  severity.textContent = SEVERITY_LABELS[event.severity] || event.severity || 'Информация';
  const category = document.createElement('span');
  category.className = 'event-category';
  category.textContent = CATEGORY_LABELS[event.category] || event.category || 'Система';
  badges.append(severity, category);
  const time = document.createElement('time');
  time.dateTime = event.created_at || '';
  time.textContent = formatDate(event.created_at);
  head.append(badges, time);

  const message = document.createElement('p');
  message.className = 'event-journal-entry-message';
  message.textContent = event.message;

  const meta = document.createElement('div');
  meta.className = 'event-journal-entry-meta';
  const metaValues = [
    event.actor_username ? `Пользователь: ${event.actor_username}` : '',
    event.action ? `Действие: ${event.action}` : '',
    metadataValue(event, 'page') ? `Страница: ${metadataValue(event, 'page')}` : '',
    metadataValue(event, 'source') ? `Источник: ${metadataValue(event, 'source')}${metadataValue(event, 'line_number') !== null && metadataValue(event, 'line_number') !== undefined ? `:${metadataValue(event, 'line_number')}${metadataValue(event, 'column_number') !== null && metadataValue(event, 'column_number') !== undefined ? `:${metadataValue(event, 'column_number')}` : ''}` : ''}` : '',
    metadataValue(event, 'user_agent') ? `Браузер: ${metadataValue(event, 'user_agent')}` : ''
  ].filter(Boolean);
  for (const value of metaValues) {
    const line = document.createElement('span');
    line.textContent = value;
    meta.append(line);
  }

  article.append(head, message, meta);
  if (event.details) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = event.severity === 'error' ? 'Подробности ошибки' : 'Подробнее';
    const pre = document.createElement('pre');
    pre.textContent = event.details;
    details.append(summary, pre);
    article.append(details);
  }
  return article;
}

function eventDay(event) {
  const date = new Date(event?.created_at || 0);
  if (!Number.isFinite(date.getTime())) return { key:'unknown', label:'Без даты' };
  const key = [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const label = new Intl.DateTimeFormat('ru-RU',{ day:'2-digit',month:'long',year:'numeric' }).format(date);
  return { key,label };
}

function groupedEvents(items) {
  const groups = [];
  for (const item of items) {
    const day = eventDay(item);
    let group = groups[groups.length - 1];
    if (!group || group.key !== day.key) {
      group = { ...day, items:[] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function eventDaySection(group) {
  const section = document.createElement('section');
  section.className = 'event-journal-day';
  section.dataset.eventDay = group.key;
  const head = document.createElement('div');
  head.className = 'event-journal-day-head';
  const title = document.createElement('strong');
  title.textContent = group.label;
  const count = document.createElement('span');
  count.textContent = `${group.items.length} ${group.items.length === 1 ? 'событие' : 'событий'}`;
  head.append(title,count);
  const body = document.createElement('div');
  body.className = 'event-journal-day-list';
  body.replaceChildren(...group.items.map(eventCard));
  section.append(head,body);
  return section;
}

function render() {
  const list = element('event-list');
  const empty = element('event-empty');
  if (!list || !empty) return;
  list.replaceChildren(...groupedEvents(journal.items).map(eventDaySection));
  empty.classList.toggle('is-hidden', journal.items.length !== 0);
  element('event-count').textContent = String(journal.items.length);
  element('event-total').textContent = String(journal.stats?.total || 0);
  element('event-errors').textContent = String(journal.stats?.errors || 0);
  element('event-warnings').textContent = String(journal.stats?.warnings || 0);
  element('event-policy').textContent = `Хранение: ${journal.retention_days} дн. · максимум ${journal.max_entries} записей`;
}

function queryString() {
  const params = new URLSearchParams({ limit: '500' });
  const severity = String(element('event-filter-severity')?.value || '').trim();
  const category = String(element('event-filter-category')?.value || '').trim();
  const query = String(element('event-filter-query')?.value || '').trim();
  if (severity) params.set('severity', severity);
  if (category) params.set('category', category);
  if (query) params.set('q', query);
  return params.toString();
}

async function loadJournal() {
  const button = element('event-refresh');
  setPending(button, true, 'Обновляем…');
  clearMessage('event-message');
  try {
    journal = await api.get(`${API.notifications}/events?${queryString()}`);
    render();
  } catch (error) {
    setMessage('event-message', error.message);
  } finally {
    setPending(button, false, 'Обновляем…');
  }
}

async function clearJournal() {
  const button = element('event-clear');
  if (!window.confirm('Очистить весь журнал событий? Это действие нельзя отменить.')) return;
  setPending(button, true, 'Очищаем…');
  clearMessage('event-message');
  try {
    const result = await api.delete(`${API.notifications}/events`);
    showToast(`Журнал событий очищен. Удалено записей: ${Number(result?.deleted_count || 0)}.`, {
      severity: 'success',
      category: 'system',
      persist: false
    });
    window.dispatchEvent(new CustomEvent('mira-tv:event-recorded'));
    await loadJournal();
  } catch (error) {
    setMessage('event-message', error.message);
  } finally {
    setPending(button, false, 'Очищаем…');
  }
}

function scheduleLoad(delay = 250) {
  window.clearTimeout(filterTimer);
  filterTimer = window.setTimeout(() => void loadJournal(), delay);
}

export function initialiseEvents() {
  element('event-filter-query')?.addEventListener('input', () => scheduleLoad());
  element('event-filter-severity')?.addEventListener('change', () => scheduleLoad(0));
  element('event-filter-category')?.addEventListener('change', () => scheduleLoad(0));
  element('event-refresh')?.addEventListener('click', () => void loadJournal());
  element('event-clear')?.addEventListener('click', () => void clearJournal());
  void loadJournal();
}
