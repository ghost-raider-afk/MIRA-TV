import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList, price } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { initialiseProductImport } from '../catalog/import-preview.js';

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

function normalizedQuery(id) {
  return String(element(id)?.value || '').trim().toLocaleLowerCase('ru-RU');
}

function matchesQuery(values, query) {
  if (!query) return true;
  return values.some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query));
}

function catalogDialog(id) {
  const dialog = element(id);
  return dialog instanceof HTMLDialogElement ? dialog : null;
}

function openCatalogDialog(id) {
  const dialog = catalogDialog(id);
  if (dialog && !dialog.open) dialog.showModal();
}

function closeCatalogDialog(id) {
  catalogDialog(id)?.close();
}

async function loadCatalog() {
  const [products, packaging] = await Promise.all([api.get(API.products), api.get(API.packaging)]);
  state.products = products;
  state.packaging = packaging;
  renderCatalogProducts();
  renderCatalogPackaging();
}

function renderCatalogProducts() {
  const list = document.querySelector('[data-products-list]');
  const empty = document.querySelector('[data-products-empty]');
  if (!list || !empty) return;
  const query = normalizedQuery('product-filter');
  const products = state.products.filter((product) => matchesQuery([
    product.name, product.producer, product.address, product.characteristics, product.strength
  ], query));
  const rows = products.map((product) => recordRow(
    product.name,
    [product.producer || 'Производитель не указан', product.address || 'Адрес не указан', product.characteristics || product.strength || 'Без характеристик', `1 л: ${price(product.price_primary)} · 1,5 л (расчётная): ${price(product.price_secondary)}`, product.active ? 'активна' : 'скрыта'].join(' · '),
    [makeButton('Изменить', '', () => editProduct(product)), makeButton('Удалить', 'danger', () => void deleteProduct(product))]
  ));
  empty.textContent = query && state.products.length ? 'По запросу ничего не найдено.' : 'Продукции пока нет.';
  refreshList(list, empty, rows);
}

function renderCatalogPackaging() {
  const list = document.querySelector('[data-packaging-list]');
  const empty = document.querySelector('[data-packaging-empty]');
  if (!list || !empty) return;
  const query = normalizedQuery('packaging-filter');
  const packaging = state.packaging.filter((item) => matchesQuery([item.name], query));
  const rows = packaging.map((item) => recordRow(item.name, `${price(item.unit_price)} · ${item.active ? 'активна' : 'скрыта'}`, [makeButton('Изменить', '', () => editPackaging(item)), makeButton('Удалить', 'danger', () => void deletePackaging(item))]));
  empty.textContent = query && state.packaging.length ? 'По запросу ничего не найдено.' : 'Тара пока не добавлена.';
  refreshList(list, empty, rows);
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
    const summary = document.createElement('p');
    summary.textContent = proposal.entity_type === 'message'
      ? proposal.description || ''
      : changes.length
        ? changes.slice(0, 3).map((change) => `${change.label}: ${approvalValue(change.before)} → ${approvalValue(change.after)}`).join(' · ')
        : proposal.description || 'Значения не изменены';
    copy.append(head, summary);
    const review = makeButton(proposal.status === 'pending' ? 'Рассмотреть' : 'Просмотреть', '', () => openApproval(proposal));
    card.append(copy, review);
    list.append(card);
  }
  empty.textContent = element('catalog-approvals-filter')?.value === 'history'
    ? 'Завершённых карточек пока нет.' : 'Новых предложений нет.';
  empty.classList.toggle('is-hidden', proposals.length !== 0);
}

async function loadApprovals() {
  const button = element('refresh-catalog-approvals');
  if (button) setPending(button, true, 'Обновляем…');
  try {
    const filter = element('catalog-approvals-filter')?.value === 'history' ? 'history' : 'pending';
    const proposals = await api.get(`${API.adminManagerProposals}?status=${filter}`);
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
    for (const change of changes) {
      const row = document.createElement('div');
      row.className = 'catalog-approval-diff-row';
      const label = document.createElement('strong');
      label.textContent = change.label;
      const before = document.createElement('span');
      before.className = 'catalog-approval-before';
      before.textContent = approvalValue(change.before);
      const arrow = document.createElement('span');
      arrow.className = 'catalog-approval-arrow';
      arrow.textContent = '→';
      const after = document.createElement('span');
      after.className = 'catalog-approval-after';
      after.textContent = approvalValue(change.after);
      row.append(label, before, arrow, after);
      diff.append(row);
    }
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
    await Promise.all([loadApprovals(), loadCatalog(), loadNotifications()]);
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

function resetProductForm() {
  const form = element('product-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingProductId = null;
  form.reset();
  element('product-active').checked = true;
  element('product-alcoholic').checked = false;
  element('product-beverage-color').value = 'none';
  element('product-filtration').value = 'none';
  element('product-form-title').textContent = 'Новая продукция';
  element('product-submit').textContent = 'Добавить продукцию';
  clearMessage('product-message');
}

function editProduct(product) {
  state.editingProductId = product.id;
  element('product-name').value = product.name;
  element('product-producer').value = product.producer || '';
  element('product-address').value = product.address || '';
  element('product-characteristics').value = product.characteristics || '';
  element('product-strength').value = product.strength || '';
  element('product-price-primary').value = product.price_primary || '';
  element('product-alcoholic').checked = product.alcoholic === true;
  element('product-beverage-color').value = product.beverage_color || 'none';
  element('product-filtration').value = product.filtration || 'none';
  element('product-active').checked = product.active !== false;
  element('product-form-title').textContent = 'Редактирование продукции';
  element('product-submit').textContent = 'Сохранить продукцию';
  openCatalogDialog('product-dialog');
}

async function deleteProduct(product) {
  if (!window.confirm(`Удалить продукцию «${product.name}»?`)) return;
  try { await api.delete(`${API.products}/${product.id}`); await loadCatalog(); }
  catch (error) { setMessage('product-message', error.message); }
}

function downloadCsv(csv) {
  const content = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'products.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportProducts() {
  const button = element('product-export');
  setPending(button, true, 'Выгружаем…');
  clearMessage('product-message');
  try {
    const csv = await api.get(API.productsExport);
    downloadCsv(csv);
    setMessage('product-message', `CSV выгружен. Записей: ${state.products.length}.`, 'success');
  } catch (error) {
    setMessage('product-message', error.message);
  } finally {
    setPending(button, false, 'Выгружаем…');
  }
}

function resetPackagingForm() {
  const form = element('packaging-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingPackagingId = null;
  form.reset();
  element('packaging-active').checked = true;
  element('packaging-form-title').textContent = 'Новая тара';
  element('packaging-submit').textContent = 'Добавить тару';
  clearMessage('packaging-message');
}

function editPackaging(item) {
  state.editingPackagingId = item.id;
  element('packaging-name').value = item.name;
  element('packaging-price').value = item.unit_price || '';
  element('packaging-active').checked = item.active !== false;
  element('packaging-form-title').textContent = 'Редактирование тары';
  element('packaging-submit').textContent = 'Сохранить тару';
  openCatalogDialog('packaging-dialog');
}

async function deletePackaging(item) {
  if (!window.confirm(`Удалить тару «${item.name}»?`)) return;
  try { await api.delete(`${API.packaging}/${item.id}`); await loadCatalog(); }
  catch (error) { setMessage('packaging-message', error.message); }
}

export function initialiseCatalog() {
  const productForm = element('product-form');
  const packagingForm = element('packaging-form');
  if (!(productForm instanceof HTMLFormElement) || !(packagingForm instanceof HTMLFormElement)) return;

  void Promise.all([loadCatalog(), loadApprovals()]).catch((error) => setMessage('product-message', error.message));
  initialiseProductImport({
    onApplied: async () => {
      resetProductForm();
      closeCatalogDialog('product-dialog');
      await Promise.all([loadCatalog(), loadNotifications()]);
    }
  });

  element('refresh-catalog')?.addEventListener('click', () => { void Promise.all([loadCatalog(), loadApprovals()]); });
  element('refresh-catalog-approvals')?.addEventListener('click', () => { void loadApprovals(); });
  element('product-filter')?.addEventListener('input', renderCatalogProducts);
  element('packaging-filter')?.addEventListener('input', renderCatalogPackaging);
  element('new-product')?.addEventListener('click', () => {
    resetProductForm();
    openCatalogDialog('product-dialog');
    requestAnimationFrame(() => element('product-name')?.focus());
  });
  element('new-packaging')?.addEventListener('click', () => {
    resetPackagingForm();
    openCatalogDialog('packaging-dialog');
    requestAnimationFrame(() => element('packaging-name')?.focus());
  });
  element('cancel-product-edit')?.addEventListener('click', () => { resetProductForm(); closeCatalogDialog('product-dialog'); });
  element('cancel-packaging-edit')?.addEventListener('click', () => { resetPackagingForm(); closeCatalogDialog('packaging-dialog'); });
  for (const id of ['product-dialog','packaging-dialog']) {
    catalogDialog(id)?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) {
        if (id === 'product-dialog') resetProductForm(); else resetPackagingForm();
        closeCatalogDialog(id);
      }
    });
  }
  catalogDialog('catalog-approval-dialog')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeApproval();
  });
  element('catalog-approval-close')?.addEventListener('click', closeApproval);
  element('catalog-approvals-filter')?.addEventListener('change', () => { void loadApprovals(); });
  element('catalog-approval-approve')?.addEventListener('click', () => { void decideApproval('approve'); });
  element('catalog-approval-reject')?.addEventListener('click', () => { void decideApproval('reject'); });
  element('product-export')?.addEventListener('click', () => { void exportProducts(); });

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('product-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = {
        name: element('product-name').value,
        producer: element('product-producer').value,
        address: element('product-address').value,
        characteristics: element('product-characteristics').value,
        strength: element('product-strength').value,
        price_primary: element('product-price-primary').value,
        alcoholic: element('product-alcoholic').checked,
        beverage_color: element('product-beverage-color').value,
        filtration: element('product-filtration').value,
        active: element('product-active').checked
      };
      if (state.editingProductId) await api.put(`${API.products}/${state.editingProductId}`, payload);
      else await api.post(API.products, payload);
      resetProductForm();
      closeCatalogDialog('product-dialog');
      await Promise.all([loadCatalog(), loadApprovals(), loadNotifications()]);
    } catch (error) {
      setMessage('product-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });

  packagingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('packaging-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = { name: element('packaging-name').value, unit_price: element('packaging-price').value, active: element('packaging-active').checked };
      if (state.editingPackagingId) await api.put(`${API.packaging}/${state.editingPackagingId}`, payload);
      else await api.post(API.packaging, payload);
      resetPackagingForm();
      closeCatalogDialog('packaging-dialog');
      await Promise.all([loadCatalog(), loadApprovals(), loadNotifications()]);
    } catch (error) {
      setMessage('packaging-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
