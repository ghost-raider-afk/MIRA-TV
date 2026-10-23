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
export function requestStatusBadge(proposal,label=requestStatus(proposal)) {
  const badge=document.createElement('span');
  badge.className='crm-status status-'+(REQUEST_STATUSES[proposal.status] ? proposal.status : 'conflict');
  badge.textContent=label;
  return badge;
}

export function requestTopic(proposal) {
  const kind = proposal.request_type || proposal.kind || proposal.entity_type;
  if (kind === 'message') return proposal.title || REQUEST_TOPICS.message;
  return REQUEST_TOPICS[kind] || (kind === 'product' || kind === 'packaging' ? 'Изменение каталога' : 'Заявка');
}

// Request snapshots take precedence over live location names.
export function requestLocationName(item,id=item?.location_id) {
  const name=String(
    (Number(item?.location_id)===Number(id) && item?.location_name)
    || item?.location_names?.[id] || ''
  ).trim();
  return name || 'Название торговой точки недоступно';
}

export function requestLocationDetails(item) {
  if (Array.isArray(item?.location_ids)) {
    return 'Торговые точки: ' + item.location_ids.map((id)=>requestLocationName(item,id)).join(', ');
  }
  return 'Торговая точка: ' + requestLocationName(item);
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

const HISTORY_ACTIONS = Object.freeze({
  created:'Заявка создана',
  returned:'Возвращена на доработку',
  reviewed:'Рассмотрены позиции',
  rework:'Возвращена на доработку',
  resubmitted:'Исправления отправлены',
  approved:'Завершена',
  rejected:'Отклонена',
  error:'Ошибка при применении',
  product_saved:'Товар сохранён в общую базу',
  completed:'Завершена с ответом',
  completed_manually:'Выполнение подтверждено администратором',
  deleted:'Заявка удалена'
});

export function requestHistoryEvent(entry) {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
  const action = HISTORY_ACTIONS[entry?.action] || 'Действие с заявкой';
  const notes = [];
  if (details.comment) notes.push(String(details.comment));
  if (details.reason) notes.push(String(details.reason));
  if (details.reply) notes.push('Ответ: ' + String(details.reply));
  if (details.product_id) notes.push('ID товара: ' + String(details.product_id));
  if (Array.isArray(details.decisions)) {
    const labels={approved:'Согласовано',rework:'На доработку',rejected:'Отклонено'};
    for (const line of details.decisions) {
      const label=labels[line?.decision] || 'Рассмотрено';
      notes.push('Позиция №' + line.key + ': ' + label + (line.comment ? ' — ' + line.comment : ''));
    }
  }
  if (Array.isArray(details.before) && Array.isArray(details.after)) {
    const after = new Map(details.after.map((item)=>[item.key,item]));
    for (const item of details.before) {
      const current=after.get(item.key);
      if (!current || JSON.stringify(item)===JSON.stringify(current)) continue;
      notes.push('Исправлена позиция №' + item.key);
    }
  }
  return [requestDate(entry.created_at), entry.actor || 'Система', action, ...notes].join(' · ');
}
