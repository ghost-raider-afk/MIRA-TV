import { productInput } from '../contracts/input.js';

const TYPES = new Set(['price_change','property_change','menu_add','product_create','menu_remove']);
const EDITABLE = new Set(['name','producer','address','characteristics','strength','alcoholic','beverage_color','filtration','active']);
const DECISIONS = new Set(['approved','rework','rejected']);

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function positive(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw invalid('Некорректное значение: ' + label);
  return id;
}
function authorised(access, locationId) {
  if (access.all_locations || access.location_ids.includes(locationId)) return;
  throw invalid('Торговая точка не назначена менеджеру.', 403);
}
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function uniqueKeys(items, valueFor) {
  const keys = items.map(valueFor);
  if (new Set(keys).size !== keys.length) throw invalid('Одинаковые позиции нельзя добавлять в заявку дважды.');
}

export async function prepareWorkflowRequest(store, { managerUsername, requestType, rawItems, access, description = '' }) {
  if (!TYPES.has(requestType)) throw invalid('Неизвестный пресет заявки.');
  if (!access?.catalog_enabled) throw invalid('Нет доступа к каталогу.', 403);
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) {
    throw invalid('Укажите от 1 до 100 позиций.');
  }
  if (requestType === 'product_create' && rawItems.length !== 1) {
    throw invalid('Один новый товар — одна заявка.');
  }
  const screens = requestType === 'menu_add' || requestType === 'menu_remove' ? await store.listScreens() : [];
  const prepared = [];
  for (const [index, input] of rawItems.entries()) {
    const item = { key:index + 1, decision:'pending', comment:'' };
    if (requestType === 'price_change' || requestType === 'property_change' || requestType === 'menu_add') {
      const productId = positive(input?.product_id,'Товар');
      const product = await store.getProduct(productId);
      if (!product || product.active === false) throw invalid('Товар не найден или неактивен.');
      item.product_id = productId;
      item.name = product.name;
      if (requestType === 'price_change') {
        item.property = 'price_primary';
        item.before = product.price_primary;
        item.value = productInput({ ...product, price_primary:input?.value }).price_primary;
      } else if (requestType === 'property_change') {
        const property = String(input?.property || '');
        if (!EDITABLE.has(property)) throw invalid('Характеристика для изменения выбрана неверно.');
        item.property = property;
        item.before = product[property];
        item.value = productInput({ ...product, [property]:input?.value })[property];
      } else {
        const locationId = positive(input?.location_id,'Торговая точка');
        authorised(access,locationId);
        const inPoint = screens.filter((screen) => Number(screen.location_id) === locationId);
        for (const screen of inPoint) {
          const draft = await store.getScreenDraft(screen.id);
          if ((draft.rows || []).some((row) => row.kind === 'item' && Number(row.product_id) === productId)) {
            throw invalid('Товар уже размещён на одном из ТВ выбранной точки.');
          }
        }
        item.location_id = locationId;
      }
    } else if (requestType === 'product_create') {
      const locations = input?.location_ids;
      if (!Array.isArray(locations) || !locations.length) throw invalid('Выберите хотя бы одну торговую точку.');
      item.location_ids = [...new Set(locations.map((v) => positive(v,'Торговая точка')))];
      for (const id of item.location_ids) authorised(access,id);
      item.payload = productInput(input?.payload || {});
      const products = await store.listProducts();
      if (products.some((product) => product.name.trim().toLocaleLowerCase('ru') === item.payload.name.trim().toLocaleLowerCase('ru'))) {
        throw invalid('Такой товар уже есть в общей базе.', 409);
      }
    } else if (requestType === 'menu_remove') {
      const screenId = positive(input?.screen_id,'ТВ');
      const screen = screens.find((v) => Number(v.id) === screenId);
      if (!screen || screen.active === false) throw invalid('ТВ не найден или неактивен.');
      authorised(access,Number(screen.location_id));
      const draft = await store.getScreenDraft(screenId);
      const rowId = String(input?.row_id || '');
      const row = (draft.rows || []).find((value) => value.id === rowId && value.kind === 'item' && value.enabled !== false);
      if (!row) throw invalid('Этой позиции нет в действующем меню указанного ТВ.', 409);
      item.screen_id = screenId;
      item.location_id = Number(screen.location_id);
      item.row_id = rowId;
      item.product_id = Number(row.product_id);
      item.revision = Number(draft.revision);
      item.name = row.name;
    }
    prepared.push(item);
  }
  uniqueKeys(prepared,(item) => requestType === 'property_change' || requestType === 'price_change'
    ? item.product_id + ':' + item.property
    : requestType === 'menu_add'
      ? item.product_id + ':' + item.location_id
      : requestType === 'menu_remove'
        ? item.screen_id + ':' + item.row_id : item.key);
  return store.transaction(async (tx) => {
    const proposal = await tx.createWorkflowRequest({
      managerUsername,requestType,items:prepared,description
    });
    await tx.recordProposalEvent(proposal.id,managerUsername,'created',{ requestType,items:prepared });
    return proposal;
  });
}

async function applyCatalogLines(tx, items) {
  const groups = new Map();
  for (const item of items) {
    if (item.decision !== 'approved') continue;
    const id = Number(item.product_id);
    if (!groups.has(id)) groups.set(id,[]);
    groups.get(id).push(item);
  }
  for (const [productId, lines] of [...groups].sort((a,b) => a[0]-b[0])) {
    const current = await tx.getProductForUpdate(productId);
    if (!current) throw invalid('Товар больше не существует.',409);
    const patch = {};
    for (const line of lines) {
      if (!same(current[line.property],line.before)) {
        throw invalid('Данные товара изменились после создания заявки.',409);
      }
      patch[line.property] = line.final_value ?? line.value;
    }
    await tx.updateProduct(productId,productInput({ ...current,...patch }));
  }
  if (!groups.size) return [];
  const affected = await tx.screensUsingCatalogIds('product',[...groups.keys()]);
  return tx.markScreenRenderChanged(affected.map((v) => v.screen_id),['menu'],'crm.catalog.applied','administrator');
}

async function applyMenuRemovals(tx, items) {
  const screens = new Map();
  for (const item of items) {
    if (item.decision !== 'approved') continue;
    if (!screens.has(item.screen_id)) screens.set(item.screen_id,[]);
    screens.get(item.screen_id).push(item);
  }
  const updated = [];
  for (const [screenId, lines] of [...screens].sort((a,b) => a[0]-b[0])) {
    if (!await tx.lockScreen(screenId)) throw invalid('ТВ больше не существует.',409);
    const draft = await tx.getScreenDraft(screenId);
    if (lines.some((line) => Number(draft.revision) !== Number(line.revision))) {
      throw invalid('Меню ТВ изменилось после создания заявки.',409);
    }
    const toDelete = new Set(lines.map((line) => line.row_id));
    for (const line of lines) {
      if (!(draft.rows || []).some((row) => row.id === line.row_id && row.kind === 'item'
        && row.enabled !== false && Number(row.product_id) === Number(line.product_id))) {
        throw invalid('Указанная строка меню уже изменилась.',409);
      }
    }
    const saved = await tx.saveScreenDraft(screenId,{
      rows:draft.rows.filter((row) => !toDelete.has(row.id)),
      settings:draft.settings,scene:draft.scene
    },Number(draft.revision));
    if (!saved) throw invalid('Меню изменилось параллельно с обработкой заявки.',409);
    updated.push(screenId);
  }
  return updated.length
    ? tx.markScreenRenderChanged(updated,['menu'],'crm.menu.removed','administrator')
    : [];
}

export async function reviewWorkflowRequest(store,{ proposalId,reviewerUsername,decisions }) {
  return store.transaction(async (tx) => {
    const proposal = await tx.getCatalogProposalForUpdate(proposalId);
    if (!proposal || proposal.entity_type !== 'request') throw invalid('Заявка не найдена.',404);
    if (proposal.status !== 'pending') throw invalid('Заявка уже рассмотрена или находится на доработке.',409);
    if (!['price_change','property_change','menu_remove'].includes(proposal.request_type)) {
      throw invalid('Эта заявка выполняется вручную.');
    }
    if (!Array.isArray(decisions) || decisions.length !== proposal.items.length) {
      throw invalid('Рассмотрите каждую позицию заявки.');
    }
    const items = proposal.items.map((item,index) => {
      const input = decisions[index];
      if (Number(input?.key) !== Number(item.key) || !DECISIONS.has(input?.decision)) {
        throw invalid('Для каждой позиции требуется корректное решение.');
      }
      const decision = input.decision;
      const comment = String(input.comment || '').trim();
      if (decision === 'rework' && comment.length < 10) throw invalid('Комментарий по доработке должен содержать минимум 10 символов.');
      const next = { ...item, decision, comment };
      if (decision === 'approved' && input.final_value !== undefined) {
        if (proposal.request_type === 'menu_remove') throw invalid('В удаляемой строке нельзя менять значения.');
        const product = { name:item.name, price_primary:item.property === 'price_primary' ? item.value : '1', active:true };
        if (item.property === 'price_primary') {
          next.final_value = productInput({ ...product, price_primary:input.final_value }).price_primary;
        } else {
          // The original property is the only correctable field.
          next.final_value = input.final_value;
        }
      }
      return next;
    });
    const requiresWork = items.some((item) => item.decision === 'rework');
    let revisions = [];
    let status;
    if (requiresWork) status = 'rework';
    else if (!items.some((item) => item.decision === 'approved')) status = 'rejected';
    else {
      revisions = proposal.request_type === 'menu_remove'
        ? await applyMenuRemovals(tx,items)
        : await applyCatalogLines(tx,items);
      status = 'approved';
    }
    const result = await tx.updateWorkflowRequest(proposalId,{ items,status,reviewerUsername });
    await tx.recordProposalEvent(proposalId,reviewerUsername,status === 'rework' ? 'returned' : 'reviewed',
      { decisions:items.map((item) => ({ key:item.key,decision:item.decision,comment:item.comment,final_value:item.final_value })) });
    return { proposal:result,revisions };
  });
}

export async function completeManualRequest(store,{ proposalId,reviewerUsername }) {
  return store.transaction(async (tx) => {
    const proposal = await tx.getCatalogProposalForUpdate(proposalId);
    if (!proposal || proposal.entity_type !== 'request') throw invalid('Заявка не найдена.',404);
    if (proposal.status !== 'pending') throw invalid('Заявка уже обработана.',409);
    if (!['menu_add','product_create'].includes(proposal.request_type)) throw invalid('Тип заявки не поддерживает ручное завершение.');
    if (proposal.request_type === 'product_create' && !proposal.catalog_product_id) {
      throw invalid('Сначала сохраните товар в общую базу.');
    }
    const updated = await tx.updateWorkflowRequest(proposalId,{items:proposal.items,status:'approved',reviewerUsername});
    await tx.recordProposalEvent(proposalId,reviewerUsername,'completed_manually',{});
    return updated;
  });
}

export async function saveNewProductFromRequest(store,{proposalId,reviewerUsername,correctedPayload}) {
  return store.transaction(async (tx) => {
    const proposal = await tx.getCatalogProposalForUpdate(proposalId);
    if (!proposal || proposal.entity_type !== 'request' || proposal.request_type !== 'product_create') {
      throw invalid('Заявка на создание товара не найдена.',404);
    }
    if (proposal.catalog_product_id) return {proposal,product:await tx.getProduct(proposal.catalog_product_id)};
    if (proposal.status !== 'pending') throw invalid('Заявка не находится на рассмотрении.',409);
    const item = proposal.items[0];
    const payload = productInput(correctedPayload || item.payload);
    const products = await tx.listProducts();
    if (products.some((x) => x.name.trim().toLocaleLowerCase('ru') === payload.name.trim().toLocaleLowerCase('ru'))) {
      throw invalid('Товар с таким названием уже существует.',409);
    }
    const product = await tx.createProduct(payload);
    const items = [{...item,payload}];
    const updated = await tx.updateWorkflowRequest(proposalId,{
      items,status:'pending',reviewerUsername,productId:product.id
    });
    await tx.recordProposalEvent(proposalId,reviewerUsername,'product_saved',{product_id:product.id,payload});
    return {proposal:updated,product};
  });
}

export async function returnOrRejectWorkflowRequest(store,{ proposalId,reviewerUsername,action,comment }) {
  return store.transaction(async (tx) => {
    const proposal = await tx.getCatalogProposalForUpdate(proposalId);
    if (!proposal || proposal.entity_type !== 'request') throw invalid('Заявка не найдена.',404);
    if (proposal.status !== 'pending') throw invalid('Заявка уже рассмотрена.',409);
    if (proposal.catalog_product_id) throw invalid('Товар уже сохранён. Завершите ручное размещение.');
    if (!['rework','rejected'].includes(action)) throw invalid('Решение не поддерживается.');
    const note = String(comment||'').trim();
    if (action === 'rework' && note.length < 10) throw invalid('Укажите причину доработки не короче 10 символов.');
    const items = proposal.items.map((item) => ({...item,decision:action,comment:note}));
    const updated = await tx.updateWorkflowRequest(proposalId,{
      items,status:action,reviewerUsername,reviewComment:note
    });
    await tx.recordProposalEvent(proposalId,reviewerUsername,action,{comment:note});
    return updated;
  });
}

export async function reviseWorkflowRequest(store,{proposalId,managerUsername,edits}) {
  return store.transaction(async (tx) => {
    const proposal = await tx.getCatalogProposalForUpdate(proposalId);
    if (!proposal || proposal.entity_type !== 'request' || proposal.manager_username !== managerUsername) {
      throw invalid('Заявка недоступна.',404);
    }
    if (proposal.status !== 'rework' || !Array.isArray(edits)) throw invalid('Заявка недоступна для исправления.',409);
    const changeMap = new Map(edits.map((v) => [Number(v.key),v]));
    if (changeMap.size !== edits.length) throw invalid('Одна позиция указана несколько раз.');
    const items = proposal.items.map((item) => {
      const edit = changeMap.get(Number(item.key));
      if (!edit) return item;
      if (item.decision !== 'rework') throw invalid('Изменять согласованные и отклонённые позиции запрещено.',403);
      if (proposal.request_type !== 'price_change' && proposal.request_type !== 'property_change') {
        throw invalid('Эту позицию необходимо уточнить через администратора.');
      }
      const next = { ...item,decision:'pending',comment:'' };
      const check = productInput({
        name:item.name,
        price_primary:item.property === 'price_primary' ? edit.value : '1',
        [item.property]:edit.value
      });
      next.value = check[item.property];
      delete next.final_value;
      return next;
    });
    if (items.some((item) => item.decision === 'rework')) throw invalid('Исправьте все возвращённые позиции.');
    const updated = await tx.updateWorkflowRequest(proposalId,{
      items,status:'pending',reviewerUsername:null,reviewComment:''
    });
    await tx.recordProposalEvent(proposalId,managerUsername,'resubmitted',{edited:edits.map((v) => v.key)});
    return updated;
  });
}
