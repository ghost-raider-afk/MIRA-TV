import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { CATALOG_FIELD_LABELS, CATALOG_OPTIONS, catalogValueLabel } from '../core/catalog-presentation.js';

const ACTIONS = Object.freeze([
  ['approved','Согласовать'],['rework','Отправить на доработку'],['rejected','Отклонить']
]);
const FIELD_LABELS = CATALOG_FIELD_LABELS;
const CHOICES = CATALOG_OPTIONS;
function el(type,cls='',value='') {
  const node=document.createElement(type);
  if (cls) node.className=cls;
  if (value) node.textContent=value;
  return node;
}
function itemName(item,type) {
  if (type === 'product_create') return item.payload?.name || 'Новый товар';
  return item.name || ('Позиция '+item.key);
}
function smallInfo(text) {return el('p','crm-workflow-note',text);}
function readOnlyItem(item,type) {
  const row=el('div','crm-workflow-item');
  row.append(el('strong','',itemName(item,type)));
  if (type==='menu_add') row.append(smallInfo('Точка №'+item.location_id));
  else if(type==='menu_remove') row.append(smallInfo('ТВ №'+item.screen_id+' · строка '+item.row_id));
  else row.append(smallInfo((FIELD_LABELS[item.property] || item.property)+': '+
    catalogValueLabel(item.property,item.before)+' → '+catalogValueLabel(item.property,item.final_value ?? item.value)));
  return row;
}
function valueControl(property,value) {
  const options=CHOICES[property];
  if (options) {
    const field=el('select');
    for (const [key,label] of options) field.add(new Option(label,key));
    field.value=String(value);
    return field;
  }
  const field=el('input');
  field.type='text';
  field.value=value ?? '';
  return field;
}
async function previewCurrentScreen(screenId) {
  const dialog=el('dialog','crm-tv-preview');
  const head=el('header');
  head.append(el('strong','','ТВ №'+screenId));
  const close=el('button','button button-secondary','Закрыть');
  close.type='button';
  close.addEventListener('click',()=>dialog.close());
  head.append(close);
  const shell=el('div','manager-screen-preview-shell crm-tv-preview-stage');
  const wrapper=el('div','manager-screen-stage');
  const stage=el('div','manager-canonical-stage');
  wrapper.append(stage);
  shell.append(wrapper);
  dialog.append(head,shell);
  document.body.append(dialog);
  let renderer=null;
  dialog.addEventListener('close',()=>{
    renderer?.destroy();
    dialog.remove();
  },{once:true});
  dialog.showModal();
  try {
    const [context,{PlayerSceneRenderer}]=await Promise.all([
      api.get(API.screens+'/'+screenId+'/editor'),
      import('../player/player-scene-renderer.js')
    ]);
    if (!dialog.open) return;
    renderer=new PlayerSceneRenderer(stage,{weatherPreview:true});
    await renderer.render({
      screen:context.screen,
      draft:context.draft,
      products:context.products,
      packaging:context.packaging,
      scene:context.draft?.scene
    });
  } catch (error) {
    shell.replaceChildren(el('p','crm-workflow-note',error.message));
  }
}

function lineReviewer(item,type,decisions) {
  const box=readOnlyItem(item,type);
  if (type === 'menu_remove') {
    const view=el('button','button button-secondary','Посмотреть ТВ');
    view.type='button';
    view.addEventListener('click',()=>{void previewCurrentScreen(item.screen_id);});
    box.append(view);
  }
  const frozen=item.decision === 'approved' || item.decision === 'rejected';
  const dropdown=el('select');
  dropdown.setAttribute('aria-label','Решение по позиции '+itemName(item,type));
  if (frozen) dropdown.add(new Option(item.decision === 'approved' ? 'Согласовано' : 'Отклонено',item.decision));
  else {
    dropdown.add(new Option('Выберите решение','pending'));
    for (const [key,label] of ACTIONS) dropdown.add(new Option(label,key));
  }
  dropdown.value=frozen?item.decision:'pending';
  dropdown.disabled=frozen;
  const comment=el('textarea');
  comment.placeholder='Укажите ошибку и что необходимо исправить (минимум 10 символов)';
  comment.rows=2;
  comment.maxLength=2000;
  comment.hidden=true;
  const correction=el('div','crm-workflow-correction');
  let corrected=null;
  if (type!=='menu_remove' && !frozen) {
    const toggle=el('label','crm-workflow-check');
    const check=el('input');check.type='checkbox';
    toggle.append(check,el('span','','Исправить значение вручную'));
    corrected=valueControl(item.property,item.value);
    corrected.hidden=true;
    check.addEventListener('change',()=>{corrected.hidden=!check.checked;});
    correction.append(toggle,corrected);
  }
  const initialComment=item.comment || '';
  if (frozen && initialComment) box.append(smallInfo('Комментарий: '+initialComment));
  dropdown.addEventListener('change',()=>{
    comment.hidden=dropdown.value!=='rework';
    if (dropdown.value==='rework' && correction) correction.hidden=true;
    else correction.hidden=false;
  });
  const controls=el('div','crm-workflow-controls');
  controls.append(dropdown,comment,correction);
  box.append(controls);
  decisions.push(()=>{
    const decision=dropdown.value;
    const output={key:item.key,decision};
    if (frozen) return output;
    if (decision==='rework') output.comment=comment.value.trim();
    if (decision==='approved' && corrected && !corrected.hidden) {
      const v=corrected.value;
      output.final_value=item.property==='active'||item.property==='alcoholic'?v==='true':v;
    }
    return output;
  });
  return box;
}
function button(text,click,color='secondary') {
  const control=el('button','button button-'+color,text);
  control.type='button';
  control.dataset.crmDynamicAction='true';
  control.addEventListener('click',()=>{void click();});
  return control;
}
function clearActions() {
  const footer=document.querySelector('.catalog-approval-actions');
  if (!footer) return null;
  footer.querySelectorAll('[data-crm-dynamic-action]').forEach((node)=>node.remove());
  document.getElementById('catalog-approval-approve').hidden=true;
  document.getElementById('catalog-approval-reject').hidden=true;
  document.getElementById('catalog-approval-comment-field').hidden=true;
  return footer;
}
function message(text,kind='error') {
  const output=document.getElementById('catalog-approval-message');
  if (!output) return;
  output.textContent=text;
  output.classList.toggle('is-hidden',!text);
  output.classList.toggle('is-success',kind==='success');
  output.classList.toggle('is-error',kind!=='success');
}
function entryField(label,value,name) {
  const row=el('label','manager-proposal-field');
  row.append(el('span','',label));
  const editable=valueControl(name,value);
  editable.name=name;
  row.append(editable);
  return row;
}
async function history(proposal,host) {
  if (!proposal.id) return;
  try {
    const rows=await api.get(API.adminManagerProposals+'/'+proposal.id+'/history');
    if (!Array.isArray(rows) || !rows.length || !host.isConnected) return;
    const detail=el('details','crm-workflow-history');
    detail.append(el('summary','','История заявки'));
    for (const entry of rows) {
      const line=el('p');
      line.textContent=[new Date(entry.created_at).toLocaleString('ru-RU'),entry.actor,entry.action].join(' · ');
      detail.append(line);
    }
    host.append(detail);
  } catch { /* Older requests have no recorded line history. */ }
}
export function openWorkflowApproval(proposal,{onDone}) {
  const footer=clearActions();
  const diff=document.getElementById('catalog-approval-diff');
  if (!footer || !diff) return;
  diff.replaceChildren();
  const type=proposal.request_type;
  const current=proposal.status==='pending';
  if (proposal.description) diff.append(smallInfo(proposal.description));
  const decisions=[];
  for (const item of proposal.items||[]) {
    if (['price_change','property_change','menu_remove'].includes(type))
      diff.append(lineReviewer(item,type,decisions));
    else if (type==='product_create') {
      const card=el('div','crm-workflow-item');
      card.append(el('strong','','Карточка нового товара'));
      const group=el('div','crm-workflow-product');
      const payload=item.payload || {};
      for (const [key,label] of Object.entries(FIELD_LABELS)) {
        if (key in payload) group.append(entryField(label,payload[key],key));
      }
      card.append(group,smallInfo('Точки для размещения: '+(item.location_ids||[]).join(', ')));
      diff.append(card);
    } else diff.append(readOnlyItem(item,type));
  }
  if (proposal.catalog_product_id) diff.append(smallInfo('Товар сохранён в каталоге. ID: '+proposal.catalog_product_id+'. Разместите его на ТВ вручную.'));
  const submit=async(action,payload={})=>{
    message('');
    try {
      const result=await api.post(API.adminManagerProposals+'/'+proposal.id+'/workflow',{action,...payload});
      await onDone?.(result);
    } catch(e){message(e.message);}
  };
  if (current) {
    if (['price_change','property_change','menu_remove'].includes(type)) {
      footer.append(button('Проверить и применить',async()=>{
        const all=decisions.map((read)=>read());
        if (all.some((line)=>line.decision==='pending')) return message('Рассмотрите все позиции заявки.');
        if (all.some((line)=>line.decision==='rework' && line.comment?.length<10)) return message('Укажите замечание по каждой позиции на доработку — минимум 10 символов.');
        if (!all.some((line)=>line.decision==='rework') && !window.confirm('Применить все согласованные операции одной транзакцией?')) return;
        await submit('review',{decisions:all});
      },'primary'));
    } else {
      const note=el('textarea');
      note.rows=2;
      note.placeholder='Причина возврата на доработку';
      note.maxLength=2000;
      diff.append(note);
      if (type==='product_create' && !proposal.catalog_product_id) {
        footer.append(button('Сохранить в базу',async()=>{
          const product={};
          diff.querySelectorAll('.crm-workflow-product [name]').forEach((field)=>{
            product[field.name]=field.name==='alcoholic'||field.name==='active'?field.value==='true':field.value;
          });
          if (!window.confirm('Сохранить новый товар в общей базе? Размещение на ТВ будет выполнено вручную.')) return;
          await submit('save_product',{product});
        },'primary'));
      }
      if (type==='menu_add' || (type==='product_create' && proposal.catalog_product_id)) {
        footer.append(button('Завершить',async()=>{
          if (!window.confirm('Подтверждаете, что все действия выполнены вручную?')) return;
          await submit('complete');
        },'primary'));
      }
      if (!proposal.catalog_product_id) {
        footer.append(button('На доработку',()=>submit('rework',{comment:note.value.trim()})));
        footer.append(button('Отклонить',()=>submit('rejected',{comment:note.value.trim()})));
      }
    }
  }
  footer.append(button('Удалить заявку',async()=>{
    if (!window.confirm('Удалить заявку №'+proposal.id+'?')) return;
    message('');
    try {
      await api.delete(API.adminManagerProposals+'/'+proposal.id);
      await onDone?.();
    }catch(e){message(e.message);}
  }));
  void history(proposal,diff);
}
