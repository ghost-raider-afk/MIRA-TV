// Human-readable audit records. Technical action identifiers are retained only
// as database metadata for diagnostics and filtering.
const TOPICS=Object.freeze({
  price_change:'Изменить цену',property_change:'Изменить свойства товара',
  menu_add:'Добавить позиции в меню',product_create:'Добавить новый товар в общую базу',
  menu_remove:'Убрать позиции из меню',message:'Другое обращение'
});
const FIELDS=Object.freeze({
  name:'Название',producer:'Производитель',address:'Адрес',characteristics:'Характеристики',
  strength:'Крепость',price_primary:'Цена за 1 л',beverage_color:'Цвет',
  filtration:'Фильтрация',alcoholic:'Алкогольная продукция',active:'Активность'
});
const CHOICES=Object.freeze({
  filtration:{filtered:'Фильтрованное',unfiltered:'Нефильтрованное',none:'Не задана'},
  beverage_color:{light:'Светлое',dark:'Тёмное',white:'Белое',semi_dark:'Полутёмное',amber:'Янтарное',red:'Красное',none:'Не задан'},
});
function value(field,raw) {
  if (raw===undefined || raw===null || raw==='') return 'не указано';
  if (typeof raw==='boolean') return raw?'Да':'Нет';
  if (CHOICES[field]?.[raw]) return CHOICES[field][raw];
  if (field==='price_primary') {
    const n=Number(String(raw).replace(',','.'));
    if (Number.isFinite(n)) return n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
  }
  return String(raw);
}
function locations(item) {
  if(Array.isArray(item?.location_ids)) {
    const names=(item.location_names || []).map((name)=>String(name||'').trim()).filter(Boolean);
    return names.length ? 'Торговые точки: '+names.join(', ') : '';
  }
  return item?.location_name ? 'Торговая точка: '+item.location_name : '';
}
function describeItem(item) {
  const lines=[];
  const name=item?.payload?.name || item?.name;
  const producer=item?.payload?.producer || item?.producer;
  if (name) lines.push('Товар: '+name+(producer?' ('+producer+')':''));
  const point=locations(item);
  if(point)lines.push(point);
  if(item?.screen_id)lines.push('Телевизор №'+item.screen_id);
  if(item?.property) lines.push((FIELDS[item.property] || 'Характеристика')+
    ': было '+value(item.property,item.before)+' → станет '+value(item.property,item.final_value ?? item.value));
  const decision={approved:'Согласовано',rework:'Возвращено на доработку',rejected:'Отклонено'}[item?.decision];
  if(decision)lines.push('Решение: '+decision);
  if(item?.comment)lines.push('Замечание: '+item.comment);
  return lines.join('\n');
}
export function crmActivity({proposal,action,actor,outcome}) {
  const id=Number(proposal?.id) || 0;
  const type=proposal?.request_type || (proposal?.entity_type==='message'?'message':'');
  const subject='Заявка №'+id+' «'+(type==='message' ? String(proposal.title || TOPICS.message) : TOPICS[type] || 'Изменение каталога')+'»';
  const prefix=subject+' ';
  const messages={
    complete:'завершена вручную администратором '+actor+'.',
    save_product:'— администратор '+actor+' сохранил новый товар в общую базу.',
    review:'рассмотрена администратором '+actor+'.',
    rework:'возвращена на доработку администратором '+actor+'.',
    rejected:'отклонена администратором '+actor+'.',
    approve:'завершена администратором '+actor+'.',
    reject:'отклонена администратором '+actor+'.',
    created:'создана менеджером '+actor+'.'
  };
  const result=outcome?.proposal || outcome || proposal;
  const items=Array.isArray(result?.items)?result.items:(Array.isArray(proposal?.items)?proposal.items:[]);
  const details=[...items.map(describeItem).filter(Boolean)];
  if(result?.review_comment)details.push('Комментарий администратора: '+result.review_comment);
  if(action==='approve' && proposal?.entity_type==='message' && result?.review_comment)details.push('Ответ менеджеру: '+result.review_comment);
  return {
    message:prefix+(messages[action] || 'обновлена пользователем '+actor+'.'),
    details:details.join('\n\n').slice(0,12000)
  };
}
