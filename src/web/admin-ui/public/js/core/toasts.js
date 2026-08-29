const TOAST_LIFETIME_MS = 5000;
const SEVERITIES = new Set(['success', 'warning', 'error', 'info']);
let lastPersisted = { key: '', at: 0 };

function normalizedSeverity(value) {
  const candidate = String(value || 'info').toLowerCase();
  return SEVERITIES.has(candidate) ? candidate : 'info';
}

function ensureContainer() {
  let container = document.querySelector('[data-toast-region]');
  if (container) return container;
  container = document.createElement('section');
  container.className = 'toast-region';
  container.dataset.toastRegion = '';
  container.setAttribute('aria-label', 'Системные сообщения');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-relevant', 'additions');
  document.body.append(container);
  return container;
}

function persistEvent({ message, severity, category, details }) {
  if (document.body?.dataset?.page === 'signin') return;
  const key = `${severity}\u0000${category}\u0000${message}`;
  const now = Date.now();
  if (lastPersisted.key === key && now - lastPersisted.at < 1500) return;
  lastPersisted = { key, at: now };
  void fetch('/api/notifications/events', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: String(message).slice(0, 2000),
      severity,
      category,
      details: String(details || '').slice(0, 4000),
      page: `${window.location.pathname}${window.location.search}${window.location.hash}`.slice(0, 1000)
    })
  }).then((response) => {
    if (response.ok) window.dispatchEvent(new CustomEvent('menu-tv:event-recorded'));
  }).catch(() => undefined);
}

function installLifetime(toast, remove) {
  let remaining = TOAST_LIFETIME_MS;
  let startedAt = Date.now();
  let timer = window.setTimeout(remove, remaining);

  const pause = () => {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };
  const resume = () => {
    if (timer || remaining <= 0) return;
    startedAt = Date.now();
    timer = window.setTimeout(remove, remaining);
  };

  toast.addEventListener('mouseenter', pause);
  toast.addEventListener('mouseleave', resume);
  toast.addEventListener('focusin', pause);
  toast.addEventListener('focusout', resume);
}

export function showToast(message, { severity = 'info', category = 'interface', details = '', persist = true } = {}) {
  const text = String(message || '').trim();
  if (!text) return null;
  const level = normalizedSeverity(severity);
  const container = ensureContainer();
  const toast = document.createElement('article');
  toast.className = `system-toast is-${level}`;
  toast.setAttribute('role', level === 'error' ? 'alert' : 'status');

  const body = document.createElement('div');
  body.className = 'system-toast-body';
  const messageNode = document.createElement('p');
  messageNode.className = 'system-toast-message';
  messageNode.textContent = text;
  body.append(messageNode);

  if (details) {
    const disclosure = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Подробнее';
    const detailNode = document.createElement('p');
    detailNode.textContent = String(details);
    disclosure.append(summary, detailNode);
    body.append(disclosure);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'system-toast-close';
  close.setAttribute('aria-label', 'Закрыть сообщение');
  close.textContent = '×';

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 160);
  };
  close.addEventListener('click', remove);
  toast.append(body, close);
  container.append(toast);
  installLifetime(toast, remove);
  if (persist) persistEvent({ message: text, severity: level, category, details });
  return toast;
}

export function toastLifetimeMs() {
  return TOAST_LIFETIME_MS;
}
