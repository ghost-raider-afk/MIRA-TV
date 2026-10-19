import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, clearMessage, setPending, makeButton } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

const APPROVAL_FIELD_LABELS = Object.freeze({
  name:'Название',
  producer:'Производитель',
  address:'Адрес',
  characteristics:'Характеристики',
  strength:'Крепость',
  price_primary:'Цена 1 л',
  price_secondary:'Цена 1,5 л',
  alcoholic:'Алкогольная продукция',
  beverage_color:'Цвет напитка',
  filtration:'Фильтрация',
  unit_price:'Цена тары',
  active:'Активна'
});

let approvalTarget = null;

const CARD_STATUSES = Object.freeze({
  pending:'На рассмотрении',
  approved:'Принято',
  rejected:'Отклонено',
  conflict:'Конфликт',
  resolved:'Обработано'
});


function catalogDialog() {
  const dialog = element('catalog-approval-dialog');
  return dialog instanceof HTMLDialogElement ? dialog : null;
}
function closeCatalogDialog() {
  catalogDialog()?.close();
}
function approvalValue(value) {
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function proposalChanges(proposal) {
  const base = proposal?.base_payload || {};
  const proposed = proposal?.proposed_payload || {};
  return Object.keys(proposed)
    .filter((key) => JSON.stringify(base[key] ?? null) !== JSON.stringify(proposed[key] ?? null))
    .map((key) => ({
      key,
      label:APPROVAL_FIELD_LABELS[key] || key,
      before:base[key],
      after:proposed[key]
    }));
}

function makeDiffRow(change, compact = false) {
  const row = document.createElement('div');
  row.className = `catalog-approval-diff-row${compact ? ' is-compact' : ''}`;
  const field = document.createElement('strong');
  field.className = 'catalog-approval-field-name';
  field.textContent = change.label;
  function valueCell(caption, value, className) {
    const cell = document.createElement('div');
    cell.className = 'catalog-approval-value-cell';
    const hint = document.createElement('small');
    hint.textContent = caption;
    const text = document.createElement('span');
    text.className = className;
    text.textContent = approvalValue(value);
    cell.append(hint, text);
    return cell;
  }
  row.append(field, valueCell('Было', change.before, 'catalog-approval-before'),
    valueCell('Стало', change.after, 'catalog-approval-after'));
  return row;
}

function renderApprovals(proposals) {
  const list = element('catalog-approvals-list');
  const empty = element('catalog-approvals-empty');
  if (!list || !empty) return;
  list.replaceChildren();
  for (const proposal of proposals) {
    const card = document.createElement('article');
    card.className = 'catalog-approval-card';
    const copy = document.createElement('div');
    copy.className = 'catalog-approval-card-copy';
    const head = document.createElement('div');
    head.className = 'catalog-approval-card-head';
    const title = document.createElement('strong');
    title.textContent = proposal.entity_type === 'message'
      ? proposal.title || `Обращение #${proposal.id}`
      : proposal.base_payload?.name || `${proposal.entity_type === 'product' ? 'Продукция' : 'Тара'} #${proposal.entity_id}`;
    const manager = document.createElement('span');
    const created = new Date(proposal.created_at);
    const date = Number.isNaN(created.getTime()) ? '' : created.toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' });
    manager.textContent = [`№${proposal.id}`, `Менеджер: ${proposal.manager_username}`, date, proposal.location_name].filter(Boolean).join(' · ');
    head.append(title, manager);
    if (proposal.status !== 'pending') {
      const badge = document.createElement('span');
      badge.className = 'catalog-approval-status';
      badge.textContent = CARD_STATUSES[proposal.status] || proposal.status;
      copy.append(badge);
    }
    const changes = proposalChanges(proposal);
    copy.prepend(head);
    if (proposal.entity_type !== 'message' && changes.length) {
      const preview = document.createElement('div');
      preview.className = 'catalog-approval-preview';
      changes.slice(0, 3).forEach((change) => preview.append(makeDiffRow(change, true)));
      copy.append(preview);
    } else {
      const summary = document.createElement('p');
      summary.textContent = proposal.description || (proposal.entity_type === 'message' ? '' : 'Значения не изменены');
      copy.append(summary);
    }
    const review = makeButton(proposal.status === 'pending' ? 'Рассмотреть' : 'Просмотреть', '', () => openApproval(proposal));
    card.append(copy, review);
    list.append(card);
  }
  empty.textContent = element('catalog-approvals-filter')?.value === 'history'
    ? 'Завершённых карточек пока нет.' : 'Заявок в выбранном разделе нет.';
  empty.classList.toggle('is-hidden', proposals.length !== 0);
}

async function loadApprovals() {
  const button = element('refresh-catalog-approvals');
  if (button) setPending(button, true, 'Обновляем…');
  try {
    const filter = element('catalog-approvals-filter')?.value || 'all';
    const url = filter === 'all' ? API.adminManagerProposals : `${API.adminManagerProposals}?status=${filter}`;
    const proposals = await api.get(url);
    renderApprovals(Array.isArray(proposals) ? proposals : []);
    clearMessage('catalog-approvals-message');
  } catch (error) {
    setMessage('catalog-approvals-message', error.message);
  } finally {
    if (button) setPending(button, false, 'Обновляем…');
  }
}

function openApproval(proposal) {
  approvalTarget = proposal;
  const dialog = catalogDialog('catalog-approval-dialog');
  const diff = element('catalog-approval-diff');
  if (!dialog || !diff) return;
  const isMessage=proposal.entity_type === 'message';
  element('catalog-approval-title').textContent = isMessage
    ? proposal.title || 'Обращение менеджера'
    : proposal.base_payload?.name || 'Предложение менеджера';
  element('catalog-approval-meta').textContent = [`Карточка №${proposal.id}`, `Менеджер ${proposal.manager_username}`,
    isMessage ? 'обращение' : proposal.entity_type === 'product' ? 'продукция' : 'тара', proposal.location_name].filter(Boolean).join(' · ');
  const historical = proposal.status !== 'pending';
  element('catalog-approval-approve').textContent = isMessage ? 'Отметить обработанным' : 'Принять изменение';
  element('catalog-approval-approve').hidden = historical;
  element('catalog-approval-reject').hidden = historical;
  element('catalog-approval-comment-field').hidden = historical;
  const historyDetail = element('catalog-approval-history-detail');
  historyDetail.hidden = !historical;
  historyDetail.textContent = historical
    ? [CARD_STATUSES[proposal.status] || proposal.status,
      proposal.reviewer_username ? `Администратор: ${proposal.reviewer_username}` : '',
      proposal.review_comment ? `Ответ: ${proposal.review_comment}` : ''
    ].filter(Boolean).join(' · ')
    : '';
  element('catalog-approval-comment').value = '';
  clearMessage('catalog-approval-message');
  diff.replaceChildren();
  const changes = proposalChanges(proposal);
  if (proposal.description) {
    const message=document.createElement('p');
    message.className='catalog-approval-no-changes';
    message.textContent=proposal.description;
    diff.append(message);
  }
  if (!changes.length && !proposal.description) {
    const empty = document.createElement('p');
    empty.className = 'catalog-approval-no-changes';
    empty.textContent = 'Без изменений данных.';
    diff.append(empty);
  } else {
    for (const change of changes) diff.append(makeDiffRow(change));
  }
  if (!dialog.open) dialog.showModal();
}

function closeApproval() {
  approvalTarget = null;
  closeCatalogDialog('catalog-approval-dialog');
  clearMessage('catalog-approval-message');
}

async function decideApproval(decision) {
  if (!approvalTarget) return;
  const approve = element('catalog-approval-approve');
  const reject = element('catalog-approval-reject');
  approve.disabled = true;
  reject.disabled = true;
  try {
    const comment = String(element('catalog-approval-comment')?.value || '');
    await api.post(`${API.adminManagerProposals}/${approvalTarget.id}/${decision}`, { comment });
    closeApproval();
    await Promise.all([loadApprovals(), loadNotifications()]);
    setMessage('catalog-approvals-message', decision === 'approve'
      ? 'Карточка обработана. Изменения каталога применены, если они были.'
      : 'Карточка отклонена.', 'success');
  } catch (error) {
    setMessage('catalog-approval-message', error.message);
    if (error?.status === 409) await loadApprovals();
  } finally {
    approve.disabled = false;
    reject.disabled = false;
  }
}


export function initialiseApprovals() {
  // The dialog must be part of <main>: client-side navigation only mounts <main>.
  void loadApprovals();
  element('refresh-catalog-approvals')?.addEventListener('click', () => { void loadApprovals(); });
  element('catalog-approvals-filter')?.addEventListener('change', () => { void loadApprovals(); });
  catalogDialog()?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeApproval();
  });
  element('catalog-approval-close')?.addEventListener('click', closeApproval);
  element('catalog-approval-approve')?.addEventListener('click', () => { void decideApproval('approve'); });
  element('catalog-approval-reject')?.addEventListener('click', () => { void decideApproval('reject'); });
}
