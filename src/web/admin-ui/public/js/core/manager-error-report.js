// Error reports reuse CRM message cards and their administrator notifications.
const ENDPOINT = '/api/manager/proposals/error-report';
let installed = false;

function short(value, max = 160) {
  return String(value ?? '').slice(0, max);
}

function selected(row, name) {
  return row.querySelector('[name="' + name + '"]');
}

function reportPositions() {
  const rows = document.querySelectorAll('#manager-crm-dialog[open] #crm-form-items .crm-form-row');
  return [...rows].slice(0, 12).map((row) => {
    const product = selected(row, 'product_id');
    return {
      product_id:product?.value || '',
      product_name:product?.selectedOptions?.[0]?.textContent || '',
      location_id:selected(row, 'location_id')?.value || '',
      screen_id:selected(row, 'screen_id')?.value || '',
      row_id:selected(row, 'row_id')?.value || '',
      property:selected(row, 'property')?.value || '',
      new_value:selected(row, 'value')?.value || ''
    };
  });
}

export function managerErrorPayload(message, error = null, source = '') {
  const detail = document.getElementById('manager-request-detail');
  const activeDetail = detail?.open ? detail.querySelector('#manager-request-body') : null;
  const request = error?.request || {};
  return {
    message:short(error?.message || message, 1000),
    stack:short(error?.stack || '', 6000),
    page:window.location.pathname,
    source:short(source, 160),
    operation:short(document.getElementById('manager-crm-dialog')?.open
      ? document.getElementById('crm-preset')?.value || source || 'Заявка'
      : source || 'Рабочее место менеджера', 120),
    request:{
      method:request.method || '',
      path:request.path || '',
      status:request.status ?? error?.status ?? null
    },
    preset:document.getElementById('manager-crm-dialog')?.open
      ? document.getElementById('crm-preset')?.value || '' : '',
    proposal_id:activeDetail?.dataset.requestId || null,
    positions:reportPositions(),
    occurred_at:new Date().toISOString()
  };
}

export function attachManagerErrorAction(body, message, { error = null, source = '' } = {}) {
  // Capture the state at failure time, not later after the manager has changed fields.
  const report = managerErrorPayload(message, error, source);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'manager-error-report-button';
  button.textContent = 'Сообщить об ошибке';
  const status = document.createElement('span');
  status.className = 'manager-error-report-status';
  status.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Отправляем…';
    status.textContent = '';
    try {
      const response = await fetch(ENDPOINT, {
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(report)
      });
      if (!response.ok) throw new Error('Не удалось передать отчёт.');
      const result = await response.json();
      if (!Number.isSafeInteger(Number(result.id)) || Number(result.id) <= 0) throw new Error('Нет номера отчёта.');
      button.textContent = 'Отчёт отправлен';
      status.textContent = 'Администратор получил заявку №'+result.id+'.';
      document.dispatchEvent(new CustomEvent('crm-request-created'));
    } catch {
      button.disabled = false;
      button.textContent = 'Повторить отправку';
      status.textContent = 'Нет связи с сервером. Повторите отправку, когда связь восстановится.';
    }
  });
  body.append(button,status);
}

export function showManagerInlineError(target, error, source = '') {
  if (!target) return;
  const message = String(error?.message || error || 'Произошла ошибка.');
  target.replaceChildren(document.createTextNode(message));
  target.classList.remove('is-hidden');
  target.classList.add('is-error');
  attachManagerErrorAction(target, message, { error, source });
}

export function installManagerGlobalErrorReporting(showToast) {
  if (installed) return;
  installed = true;
  const present = (message,error,source) => {
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    const dialog = dialogs.at(-1);
    if (dialog) {
      const note = document.createElement('p');
      note.className = 'form-message';
      dialog.append(note);
      showManagerInlineError(note, error, source);
    } else showToast(message, { severity:'error',persist:false,error,source });
  };
  window.addEventListener('error', (event) => {
    present('Произошла ошибка интерфейса.',
      event.error || new Error(event.message || 'Ошибка'),short(event.filename || 'javascript',160));
  });
  window.addEventListener('unhandledrejection', (event) => {
    present('Не удалось выполнить действие.',
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      'unhandledrejection');
  });
}
