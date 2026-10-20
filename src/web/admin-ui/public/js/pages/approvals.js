import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, clearMessage, setPending, makeButton } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { requestStatus, requestTopic, requestJournalHeader, requestJournalRow } from '../core/requests.js';
import { openWorkflowApproval } from './approval-workflow.js';

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
  const table = document.createElement('div');
  table.className = 'request-journal';
  table.append(requestJournalHeader());
  for (const proposal of proposals) table.append(requestJournalRow(proposal, openApproval));
  const scroller = document.createElement('div');
  scroller.className = 'request-journal-scroller';
  scroller.append(table);
  list.append(scroller);
  empty.textContent = element('catalog-approvals-filter')?.value === 'history'
    ? 'Завершённых заявок пока нет.' : 'Заявок в выбранном разделе нет.';
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
  document.querySelectorAll('[data-crm-dynamic-action]').forEach((node)=>node.remove());
  const isMessage=proposal.entity_type === 'message';
  element('catalog-approval-title').textContent = requestTopic(proposal);
  element('catalog-approval-meta').textContent = [`Карточка №${proposal.id}`, `Менеджер ${proposal.manager_username}`,
    isMessage ? 'обращение' : proposal.entity_type === 'product' ? 'продукция' : 'тара', proposal.location_name].filter(Boolean).join(' · ');
  const historical = proposal.status !== 'pending';
  element('catalog-approval-approve').textContent = isMessage ? 'Завершить заявку' : 'Принять изменение';
  const commentField = element('catalog-approval-comment-field');
  const commentInput = element('catalog-approval-comment');
  const commentLabel = commentField?.querySelector('span');
  if (commentLabel) commentLabel.textContent = isMessage ? 'Ответ менеджеру' : 'Комментарий менеджеру';
  if (commentInput) {
    commentInput.required = isMessage;
    commentInput.placeholder = isMessage ? 'Напишите ответ менеджеру' : 'Необязательно';
  }
  element('catalog-approval-approve').hidden = historical;
  element('catalog-approval-reject').hidden = historical;
  element('catalog-approval-comment-field').hidden = historical;
  const historyDetail = element('catalog-approval-history-detail');
  historyDetail.hidden = !historical;
  historyDetail.textContent = historical
    ? [requestStatus(proposal),
      proposal.reviewer_username ? `Администратор: ${proposal.reviewer_username}` : '',
      proposal.review_comment ? `Ответ: ${proposal.review_comment}` : ''
    ].filter(Boolean).join(' · ')
    : '';
  element('catalog-approval-comment').value = '';
  clearMessage('catalog-approval-message');
  diff.replaceChildren();
  if (proposal.entity_type === 'request') {
    const onDone = async () => {
      closeApproval();
      await Promise.all([loadApprovals(),loadNotifications()]);
    };
    openWorkflowApproval(proposal,{onDone});
    if (!dialog.open) dialog.showModal();
    return;
  }
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
  const removeButton=document.createElement('button');
  removeButton.type='button';
  removeButton.className='button button-secondary';
  removeButton.textContent='Удалить заявку';
  removeButton.dataset.crmDynamicAction='true';
  removeButton.addEventListener('click',async()=>{
    if (!window.confirm('Удалить заявку №'+proposal.id+'?')) return;
    try {
      await api.delete(API.adminManagerProposals+'/'+proposal.id);
      closeApproval();
      await loadApprovals();
    } catch(error) {
      setMessage('catalog-approval-message',error.message);
    }
  });
  document.querySelector('.catalog-approval-actions')?.append(removeButton);
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
    const comment = String(element('catalog-approval-comment')?.value || '').trim();
    if (decision === 'approve' && approvalTarget.entity_type === 'message' && !comment) {
      setMessage('catalog-approval-message', 'Перед завершением заявки напишите ответ менеджеру.');
      return;
    }
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
