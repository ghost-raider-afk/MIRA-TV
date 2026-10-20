// Shared CRM presentation: one journal and one status vocabulary for both roles.
export const REQUEST_STATUSES = Object.freeze({
  pending:'На рассмотрении',
  rework:'На доработке',
  approved:'Завершена',
  resolved:'Завершена', // historical message cards
  rejected:'Отклонено',
  conflict:'Ошибка' // historical status; storage semantics remain compatible
});

export const REQUEST_TOPICS = Object.freeze({
  price_change:'Изменить цену',
  property_change:'Изменить свойства товара',
  menu_add:'Добавить позиции в меню',
  product_create:'Добавить новый товар в общую базу',
  menu_remove:'Убрать позиции из меню',
  message:'Другое обращение'
});

export function requestStatus(proposal) {
  return REQUEST_STATUSES[proposal.status] || 'Ошибка';
}

export function requestTopic(proposal) {
  const kind = proposal.request_type || proposal.kind || proposal.entity_type;
  if (kind === 'message') return proposal.title || REQUEST_TOPICS.message;
  return REQUEST_TOPICS[kind] || (kind === 'product' || kind === 'packaging' ? 'Изменение каталога' : 'Заявка');
}

export function requestDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—'
    : date.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

export function requestJournalHeader() {
  const heading = document.createElement('div');
  heading.className = 'request-journal-header';
  heading.setAttribute('aria-hidden', 'true');
  ['№','Дата создания','Тема','Статус','Дата'].forEach((label) => {
    const span = document.createElement('span');
    span.textContent = label;
    heading.append(span);
  });
  return heading;
}

export function requestJournalRow(proposal, onOpen) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `request-journal-row status-${proposal.status}`;
  row.setAttribute('aria-label', `Заявка №${proposal.id}. ${requestTopic(proposal)}. ${requestStatus(proposal)}. Открыть карточку`);
  [
    String(proposal.id),
    requestDate(proposal.created_at),
    requestTopic(proposal),
    requestStatus(proposal),
    requestDate(proposal.status_changed_at || proposal.decided_at || proposal.updated_at || proposal.created_at)
  ].forEach((value, index) => {
    const cell = document.createElement('span');
    cell.className = index === 3 ? 'crm-status request-journal-status' : '';
    cell.textContent = value;
    if (index === 4 || index === 1) cell.classList.add('request-journal-date');
    row.append(cell);
  });
  row.addEventListener('click', () => onOpen(proposal));
  return row;
}
