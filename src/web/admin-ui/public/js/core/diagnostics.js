import { API } from './config.js';

let installed = false;
let sending = false;
const queue = [];
const MAX_QUEUE = 20;

function errorDetails(value) {
  if (value instanceof Error) {
    return { message: value.message || value.name || 'Ошибка JavaScript', stack: value.stack || '' };
  }
  if (value && typeof value === 'object') {
    try { return { message: JSON.stringify(value), stack: '' }; }
    catch { return { message: String(value), stack: '' }; }
  }
  return { message: String(value ?? 'Неизвестная ошибка JavaScript'), stack: '' };
}

async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  try {
    while (queue.length) {
      const payload = queue[0];
      try {
        const response = await fetch(API.frontendErrors, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        queue.shift();
        if (response.status === 401) queue.length = 0;
      } catch {
        queue.shift();
      }
    }
  } finally {
    sending = false;
  }
}

export function reportFrontendError(error, context = {}) {
  const details = errorDetails(error);
  const payload = {
    error_type: context.type || 'error',
    message: details.message.slice(0, 2000),
    stack: details.stack.slice(0, 12000),
    page: `${window.location.pathname}${window.location.search}${window.location.hash}`.slice(0, 1000),
    source: String(context.source || '').slice(0, 1000),
    line_number: Number.isSafeInteger(Number(context.line)) ? Number(context.line) : null,
    column_number: Number.isSafeInteger(Number(context.column)) ? Number(context.column) : null
  };
  if (!payload.message) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(payload);
  void flush();
}

export function installFrontendDiagnostics() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    reportFrontendError(event.error || event.message, {
      type: 'error',
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportFrontendError(event.reason, { type: 'unhandledrejection' });
  });
}
