import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { REQUEST_TOPICS, requestHistoryEvent } from '../core/requests.js';
import { CATALOG_FIELD_LABELS, CATALOG_OPTIONS, catalogValueLabel } from '../core/catalog-presentation.js';

const FIELDS = Object.freeze(Object.fromEntries(
  ['name','producer','address','characteristics','strength','beverage_color','filtration','alcoholic','active']
    .map((key)=>[key,CATALOG_FIELD_LABELS[key]])
));
const COLORS = CATALOG_OPTIONS.beverage_color;
const FILTERS = CATALOG_OPTIONS.filtration;
const BOOLEAN = CATALOG_OPTIONS.alcoholic;

let managerDialog = null;
let managerCatalog = [];
let managerLocations = [];
let rows = [];
let requestType = 'price_change';
let nextKey = 0;

function node(tag, className = '', content = '') {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (content) value.textContent = content;
  return value;
}
function select(name, choices, value) {
  const input = node('select');
  input.name = name;
  for (const [id,label] of choices) input.add(new Option(label,String(id)));
  if (value !== undefined) input.value = String(value);
  return input;
}
function input(name,value = '',type = 'text') {
  const field = node('input');
  field.name = name;
  field.type = type;
  field.value = value ?? '';
  return field;
}
function field(label, child) {
  const wrapper = node('label','manager-proposal-field');
  wrapper.append(node('span','',label),child);
  return wrapper;
}
function productChoice(id) {
  return select('product_id',managerCatalog.map((p)=>[p.id,p.name]),id);
}
function locationChoice(id) {
  return select('location_id',managerLocations.map((p)=>[p.id,p.name]),id);
}
function propertyChoice(value) {
  return select('property',Object.entries(FIELDS).map(([key,name])=>[key,name]),value);
}
function valueInput(property,value = '') {
  if (property === 'beverage_color') return select('value',COLORS,value || 'none');
  if (property === 'filtration') return select('value',FILTERS,value || 'none');
  if (property === 'active' || property === 'alcoholic') return select('value',BOOLEAN,String(value));
  return input('value',value);
}
function productById(id) { return managerCatalog.find((p)=>Number(p.id) === Number(id)); }
function rowValue(item, name) {
  const root = document.querySelector('[data-crm-key="' + item.key + '"]');
  return root?.querySelector('[name="' + name + '"]')?.value ?? '';
}
function collectRows() {
  return rows.map((item) => {
    if (requestType === 'price_change') return {
      product_id:Number(rowValue(item,'product_id')),value:rowValue(item,'value')
    };
    if (requestType === 'property_change') {
      const property = rowValue(item,'property');
      let value = rowValue(item,'value');
      if (property === 'active' || property === 'alcoholic') value = value === 'true';
      return { product_id:Number(rowValue(item,'product_id')),property,value };
    }
    if (requestType === 'menu_add') return {
      product_id:Number(rowValue(item,'product_id')),location_id:Number(rowValue(item,'location_id'))
    };
    if (requestType === 'menu_remove') return {
      screen_id:Number(rowValue(item,'screen_id')),row_id:rowValue(item,'row_id')
    };
    return null;
  });
}
async function renderRemovalSelector(container,item) {
  const locations = managerLocations;
  const location = locationChoice(item.location_id ?? locations[0]?.id);
  item.location_id = Number(location.value);
  container.append(field('Торговая точка',location));
  const tvField = field('Телевизор',select('screen_id',[],item.screen_id));
  const productField = field('Позиция из меню ТВ',select('row_id',[],item.row_id));
  container.append(tvField,productField);
  async function fillItems() {
    const screen = tvField.querySelector('select');
    const target = productField.querySelector('select');
    target.replaceChildren();
    if (!screen.value) return;
    target.add(new Option('Загружаем меню…',''));
    try {
      const context = await api.get(API.managerBase + '/screens/' + screen.value + '/context');
      if (screen.value !== String(item.screen_id)) return;
      target.replaceChildren();
      for (const row of (context?.draft?.rows || [])) {
        if (row.kind !== 'item' || row.enabled === false) continue;
        target.add(new Option(row.name || 'Позиция ' + row.id,row.id));
      }
      if (!target.options.length) target.add(new Option('На этом ТВ нет позиций',''));
      if (item.row_id) target.value = item.row_id;
      item.row_id = target.value;
    } catch {
      target.replaceChildren(new Option('Не удалось получить меню',''));
    }
  }
  async function fillScreens() {
    const screen = tvField.querySelector('select');
    const target = Number(location.value);
    const point = locations.find((p)=>Number(p.id) === target);
    screen.replaceChildren();
    for (const v of point?.screens || []) {
      if (v.status === 'published') screen.add(new Option(v.name,v.id));
    }
    if (item.screen_id && [...screen.options].some((v)=>v.value===String(item.screen_id))) screen.value = String(item.screen_id);
    item.screen_id = Number(screen.value);
    await fillItems();
  }
  location.addEventListener('change',()=>{item.location_id=Number(location.value);item.screen_id=null;item.row_id=null;void fillScreens();});
  tvField.querySelector('select').addEventListener('change',()=>{item.screen_id=Number(tvField.querySelector('select').value);item.row_id=null;void fillItems();});
  productField.querySelector('select').addEventListener('change',()=>{item.row_id=productField.querySelector('select').value;});
  await fillScreens();
}
function renderRow(item) {
  const container = node('div','crm-form-row');
  container.dataset.crmKey = String(item.key);
  if (requestType === 'menu_remove') {
    void renderRemovalSelector(container,item);
  } else {
    const product = productChoice(item.product_id || managerCatalog[0]?.id);
    container.append(field('Товар',product));
    if (requestType === 'menu_add') {
      container.append(field('Торговая точка',locationChoice(item.location_id || managerLocations[0]?.id)));
    } else if (requestType === 'price_change') {
      const previous = node('small','crm-form-before');
      const refresh = () => { previous.textContent = 'Текущая цена: ' + (productById(product.value)?.price_primary || '—') + ' ₽'; };
      product.addEventListener('change',refresh);
      refresh();
      container.append(previous,field('Новая цена',input('value',item.value)));
    } else {
      const property = propertyChoice(item.property || 'name');
      let valueWrapper = field('Новое значение',valueInput(property.value,item.value));
      const current = node('small','crm-form-before');
      function update() {
        const productData=productById(product.value);
        const key=property.value;
        const currentValue=productData?.[key];
        current.textContent = 'Сейчас: ' + catalogValueLabel(key,currentValue);
      }
      property.addEventListener('change',()=>{
        const updated=field('Новое значение',valueInput(property.value,productById(product.value)?.[property.value]));
        valueWrapper.replaceWith(updated);
        valueWrapper=updated;update();
      });
      product.addEventListener('change',update);
      update();
      container.append(field('Характеристика',property),current,valueWrapper);
    }
  }
  const remove=node('button','button button-secondary','Убрать строку');
  remove.type='button';
  remove.addEventListener('click',()=>{
    if (rows.length <= 1) return;
    rows=rows.filter((row)=>row.key!==item.key);
    container.remove();
  });
  container.append(remove);
  return container;
}
function renderProductCreation(host) {
  const entry = rows[0] || {key:1};
  const values = entry.payload || {};
  const fields = [
    ['name','Наименование'],['producer','Производитель'],['address','Адрес'],
    ['characteristics','Характеристики'],['strength','Крепость'],['price_primary','Цена за 1 л']
  ];
  for (const [key,label] of fields) host.append(field(label,input(key,values[key])));
  host.append(field('Цвет',select('beverage_color',COLORS,values.beverage_color || 'none')));
  host.append(field('Фильтрация',select('filtration',FILTERS,values.filtration || 'none')));
  host.append(field('Алкогольная продукция',select('alcoholic',BOOLEAN,String(values.alcoholic ?? true))));
  const pointBox=node('div','crm-form-points');
  pointBox.append(node('strong','','В каких точках разместить товар'));
  for (const point of managerLocations) {
    const wrapper=node('label');
    const checked=input('location_ids',point.id,'checkbox');
    checked.value=String(point.id);
    checked.checked=(entry.location_ids || []).includes(point.id);
    wrapper.append(checked,node('span','',point.name));
    pointBox.append(wrapper);
  }
  host.append(pointBox);
}
function ensureDialog() {
  if (managerDialog) return managerDialog;
  managerDialog = node('dialog','manager-proposal-dialog crm-create-dialog');
  managerDialog.id='manager-crm-dialog';
  const form=node('form','manager-proposal-form');
  form.addEventListener('submit',(event)=>{event.preventDefault();void submit();});
  const title=node('h2','crm-request-title','НОВАЯ ЗАЯВКА');
  const preset=select('preset',Object.entries(REQUEST_TOPICS).map(([v,t])=>[v,t]));
  preset.id='crm-preset';
  preset.addEventListener('change',()=> {
    if (preset.value === 'message') {
      managerDialog.close();
      document.getElementById('manager-new-message')?.click();
      return;
    }
    requestType=preset.value; rows=[{key:++nextKey}];render();
  });
  const content=node('div','crm-form-items');content.id='crm-form-items';
  const add=node('button','button button-secondary','+ Добавить позицию');
  add.id='crm-add-row';add.type='button';
  add.addEventListener('click',()=>{
    rows.push({key:++nextKey});
    content.append(renderRow(rows[rows.length-1]));
  });
  const note=node('textarea');
  note.id='crm-description';note.rows=2;note.maxLength=2000;
  const error=node('p','form-message is-hidden');error.id='crm-create-error';error.setAttribute('role','status');
  const cancel=node('button','button button-secondary','Отмена');cancel.type='button';cancel.addEventListener('click',()=>managerDialog.close());
  const submitButton=node('button','button button-primary','Отправить заявку');submitButton.type='submit';submitButton.id='crm-submit';
  const footer=node('footer');footer.append(cancel,submitButton);
  form.append(title,field('Тема заявки',preset),content,add,field('Комментарий (необязательно)',note),error,footer);
  managerDialog.append(form);document.body.append(managerDialog);
  return managerDialog;
}
function render() {
  const host=document.getElementById('crm-form-items');
  if (!host) return;
  host.replaceChildren();
  const add=document.getElementById('crm-add-row');
  add.hidden = requestType === 'product_create';
  if (requestType === 'product_create') renderProductCreation(host);
  else for (const item of rows) host.append(renderRow(item));
}
async function submit() {
  const submitButton=document.getElementById('crm-submit');
  const error=document.getElementById('crm-create-error');
  submitButton.disabled=true;
  error.classList.add('is-hidden');
  try {
    let items;
    if (requestType === 'product_create') {
      const root=document.getElementById('crm-form-items');
      const value=(name)=>root.querySelector('[name="' + name + '"]')?.value || '';
      items=[{
        payload:{
          name:value('name'),producer:value('producer'),address:value('address'),
          characteristics:value('characteristics'),strength:value('strength'),
          price_primary:value('price_primary'),beverage_color:value('beverage_color'),
          filtration:value('filtration'),alcoholic:value('alcoholic') === 'true',active:true
        },
        location_ids:[...root.querySelectorAll('[name="location_ids"]:checked')].map((x)=>Number(x.value))
      }];
    } else items=collectRows();
    await api.post(API.managerProposals+'/request',{
      request_type:requestType,items,
      description:document.getElementById('crm-description').value
    });
    managerDialog.close();
    document.dispatchEvent(new CustomEvent('crm-request-created'));
  } catch (e) {
    error.textContent=e.message;
    error.classList.remove('is-hidden');
  } finally { submitButton.disabled=false; }
}
export async function openManagerRequestForm({type='price_change',productId=null}={}) {
  if (type === 'message') {
    document.getElementById('manager-new-message')?.click();
    return;
  }
  const [catalog,locations]=await Promise.all([
    api.get(API.managerCatalog),api.get(API.managerOverview)
  ]);
  managerCatalog=Array.isArray(catalog?.products)?catalog.products:[];
  managerLocations=Array.isArray(locations)?locations:[];
  requestType=type;
  rows=[{key:++nextKey,product_id:productId}];
  ensureDialog();
  document.getElementById('crm-preset').value=type;
  document.getElementById('crm-description').value='';
  render();
  managerDialog.showModal();
}

export async function renderManagerWorkflow(proposal,host,onRefresh) {
  host.replaceChildren();
  const title=node('p','crm-workflow-note',proposal.description||'');
  if (proposal.description) host.append(title);
  const [catalogResult,locationsResult]=await Promise.allSettled([
    api.get(API.managerCatalog),api.get(API.managerOverview)
  ]);
  const catalog=catalogResult.status==='fulfilled'?catalogResult.value:{};
  const locations=locationsResult.status==='fulfilled'?locationsResult.value:[];
  managerCatalog=Array.isArray(catalog?.products)?catalog.products:[];
  managerLocations=Array.isArray(locations)?locations:[];
  const edits=[];
  const type=proposal.request_type;
  for (const item of proposal.items||[]) {
    const wrapper=node('div','crm-workflow-item');
    wrapper.dataset.crmKey=String(item.key);
    const heading=node('strong','',item.name||item.payload?.name||('Позиция '+item.key));
    wrapper.append(heading);
    if (item.property) {
      const p=node('p','',String(FIELDS[item.property]||item.property)+': '+catalogValueLabel(item.property,item.before)+' → '+catalogValueLabel(item.property,item.final_value??item.value));
      wrapper.append(p);
    } else if (type==='menu_add') wrapper.append(node('p','','Торговая точка №'+item.location_id));
    else if (type==='menu_remove') wrapper.append(node('p','','ТВ №'+item.screen_id+' · позиция '+item.row_id));
    else if (type==='product_create') {
      for (const [key,value] of Object.entries(item.payload||{})) wrapper.append(node('p','',(CATALOG_FIELD_LABELS[key]||key)+': '+catalogValueLabel(key,value)));
      wrapper.append(node('p','','Торговые точки: '+(item.location_ids||[]).join(', ')));
    }
    const status=item.decision==='rework' ? 'На доработку'
      : item.decision==='approved' ? 'Согласовано'
      : item.decision==='rejected' ? 'Отклонено' : 'На рассмотрении';
    wrapper.append(node('small','',status));
    if (item.comment) wrapper.append(node('p','crm-workflow-note','Замечание администратора: '+item.comment));
    if (proposal.status==='rework' && item.decision==='rework') {
      if (type==='price_change' || type==='property_change') {
        const editor=valueInput(item.property,item.value);
        wrapper.append(field('Исправленное значение',editor));
        edits.push(()=>({
          key:item.key,value:['alcoholic','active'].includes(item.property) ? editor.value==='true' : editor.value
        }));
      } else if (type==='menu_add') {
        const product=productChoice(item.product_id);
        const location=locationChoice(item.location_id);
        wrapper.append(field('Товар',product),field('Точка',location));
        edits.push(()=>({key:item.key,product_id:Number(product.value),location_id:Number(location.value)}));
      } else if (type==='menu_remove') {
        const correction={...item};
        await renderRemovalSelector(wrapper,correction);
        edits.push(()=>({
          key:item.key,screen_id:Number(wrapper.querySelector('[name="screen_id"]').value),
          row_id:wrapper.querySelector('[name="row_id"]').value
        }));
      } else if (type==='product_create') {
        const part=node('div','crm-workflow-product');
        for (const [key,value] of Object.entries(item.payload||{})) {
          part.append(field(FIELDS[key]||key,valueInput(key,value)));
          part.lastElementChild.querySelector('input,select').name=key;
        }
        const points=node('div','crm-form-points');
        points.append(node('strong','','Торговые точки'));
        for (const point of managerLocations) {
          const label=node('label');
          const check=input('location_ids',point.id,'checkbox');
          check.checked=item.location_ids?.includes(point.id);
          label.append(check,node('span','',point.name));
          points.append(label);
        }
        wrapper.append(part,points);
        edits.push(()=>{
          const payload={};
          part.querySelectorAll('[name]').forEach((element)=>{
            payload[element.name]=['alcoholic','active'].includes(element.name)
              ? element.value==='true' : element.value;
          });
          const location_ids=[...points.querySelectorAll('[name="location_ids"]:checked')].map((x)=>Number(x.value));
          return {key:item.key,payload,location_ids};
        });
      }
    }
    host.append(wrapper);
  }
  if (proposal.catalog_product_id) {
    host.append(node('p','crm-workflow-note','Товар сохранён в общую базу, ID '+proposal.catalog_product_id+'. Ожидает ручного размещения на ТВ.'));
  }
  if (edits.length) {
    const save=node('button','button button-primary','Отправить исправления');
    save.type='button';
    save.addEventListener('click',async()=>{
      save.disabled=true;
      try {
        await api.put(API.managerProposals+'/'+proposal.id+'/rework',{edits:edits.map((read)=>read())});
        await onRefresh();
      } catch(error) {
        host.append(node('p','form-message',error.message));
      } finally { save.disabled=false; }
    });
    host.append(save);
  }
  if (proposal.status==='pending' && !proposal.catalog_product_id) {
    const remove=node('button','button button-secondary','Удалить заявку');
    remove.type='button';
    remove.addEventListener('click',async()=>{
      if (!window.confirm('Удалить заявку №'+proposal.id+'?')) return;
      try {
        await api.delete(API.managerProposals+'/'+proposal.id);
        await onRefresh();
      } catch(error) { host.append(node('p','form-message',error.message)); }
    });
    host.append(remove);
  }
  try {
    const history=await api.get(API.managerProposals+'/'+proposal.id+'/history');
    if (Array.isArray(history) && history.length) {
      const details=node('details','crm-workflow-history');
      details.append(node('summary','','История изменений'));
      for (const event of history) {
        details.append(node('p','',requestHistoryEvent(event)));
      }
      host.append(details);
    }
  } catch { /* Historical records may not have line history. */ }
}
