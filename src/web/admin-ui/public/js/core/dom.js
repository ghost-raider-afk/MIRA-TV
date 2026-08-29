import { showToast } from './toasts.js';

export function element(id) {
  return document.getElementById(id);
}

function messageCategory(id) {
  const source = String(id || '');
  if (/product|packaging|catalog/i.test(source)) return 'catalog';
  if (/sftp/i.test(source)) return 'sftp';
  if (/screen|editor|monitor/i.test(source)) return 'monitors';
  if (/device|connect-tv/i.test(source)) return 'tv';
  if (/site|settings|profile|password/i.test(source)) return 'settings';
  if (/auth|signin|login/i.test(source)) return 'auth';
  return 'interface';
}

function messageSeverity(kind) {
  if (kind === 'success') return 'success';
  if (kind === 'warning') return 'warning';
  if (kind === 'info') return 'info';
  return 'error';
}

export function setMessage(id, message, kind = 'error') {
  const target = element(id);
  if (target) {
    target.textContent = message;
    target.className = 'form-message is-hidden';
  }
  showToast(message, {
    severity: messageSeverity(kind),
    category: messageCategory(id),
    persist: true
  });
}

export function clearMessage(id) {
  const target = element(id);
  if (!target) return;
  target.textContent = '';
  target.className = 'form-message is-hidden';
}

export function setPending(button, pending, pendingLabel) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (!button.dataset.label) button.dataset.label = button.textContent.trim();
  button.disabled = pending;
  button.textContent = pending ? pendingLabel : button.dataset.label;
}

export function makeButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `small-button ${className || ''}`.trim();
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

export function recordRow(title, details, actions = []) {
  const row = document.createElement('article');
  row.className = 'record-row';
  const copy = document.createElement('div');
  const heading = document.createElement('p');
  heading.className = 'record-title';
  heading.textContent = title;
  const meta = document.createElement('p');
  meta.className = 'record-meta';
  meta.textContent = details;
  copy.append(heading, meta);
  const buttons = document.createElement('div');
  buttons.className = 'record-actions';
  buttons.append(...actions);
  row.append(copy, buttons);
  return row;
}

export function refreshList(list, empty, rows) {
  list.replaceChildren(...rows);
  empty.classList.toggle('is-hidden', rows.length !== 0);
}

export function price(value) {
  return `${String(value || '0').replace('.', ',')} ₽`;
}
