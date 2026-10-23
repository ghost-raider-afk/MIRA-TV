// Human-readable system journal descriptions. Storage action codes stay stable.
const TOPICS=Object.freeze({
  price_change:'Изменить цену',
  property_change:'Изменить свойства товара',
  menu_add:'Добавить позиции в меню',
  product_create:'Добавить новый товар в общую базу',
  menu_remove:'Убрать позиции из меню'
});
const FIELDS=Object.freeze({
  name:'Название',producer:'Производитель',address:'Адрес',
  characteristics:'Характеристики',strength:'Крепость',
  price_primary:'Цена за 1 л',price_secondary:'Цена за 1,5 л',
  alcoholic:'Алкогольная продукция',beverage_color:'Цвет напитка',
  filtration:'Фильтрация',active:'Активность'
});
const VALUES=Object.freeze({
  light:'Светлое',dark:'Тёмное',white:'Белое',semi_dark:'Полутёмное',
  amber:'Янтарное',red:'Красное',none:'Не задано',
  filtered:'Фильтрованное',unfiltered:'Нефильтрованное'
});
const DECISIONS=Object.freeze({
  approved:'Согласовано',rework:'На доработку',rejected:'Отклонено',pending:'На рассмотрении'
});
const TOPIC_FALLBACK='Заявка';
function value(field,input) {
  if (input==null || input==='') return '—';
  if (typeof input==='boolean') return input?'Да':'Нет';
  if (field?.startsWith('price_')) {
    const amount=Number(String(input).replace(',','.'));
    if(Number.isFinite(amount)) return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)+' ₽';
  }
  return VALUES[input] || String(input);
}
function itemDetails(item) {
  const product=item.payload || item;
  const lines=[];
  if(product.name) lines.push('Товар: '+product.name+(product.producer?' ('+product.producer+')':''));
  if(item.location_id) lines.push('Торговая точка: '+(item.location_name || 'Название недоступно'));
  if(Array.isArray(item.location_ids)) {
    lines.push('Торговые точки: '+item.location_ids.map(id=>item.location_names?.[id]||'Название недоступно').join(', '));
  }
  if(item.screen_id) lines.push('ТВ №'+item.screen_id);
  if(item.property) {
    lines.push((FIELDS[item.property]||'Характеристика товара')+': было '+value(item.property,item.before)
      +' → станет '+value(item.property,item.final_value??item.value));
  }
  if(item.decision) lines.push('Решение: '+(DECISIONS[item.decision]||'Рассмотрено'));
  if(item.comment) lines.push('Замечание: '+item.comment);
  return lines.join(' · ');
}

export function describeCrmActivity(proposal,action) {
  const id=Number(proposal?.id);
  const topic=TOPICS[proposal?.request_type] || proposal?.title || TOPIC_FALLBACK;
  const prefix='заявку №'+id+' «'+topic+'»';
  const items=proposal?.items || [];
  let message;
  if(action==='complete') message='Заявка №'+id+' «'+topic+'» закрыта вручную администратором.';
  else if(action==='review') {
    const approved=items.filter(item=>item.decision==='approved').length;
    const rework=items.filter(item=>item.decision==='rework').length;
    const rejected=items.filter(item=>item.decision==='rejected').length;
    message='Администратор рассмотрел '+prefix+': согласовано — '+approved+
      ', на доработку — '+rework+', отклонено — '+rejected+'.';
  } else if(action==='save_product') message='Администратор сохранил новый товар в общей базе по заявке №'+id+'.';
  else if(action==='rework') message='Администратор вернул '+prefix+' на доработку.';
  else if(action==='rejected') message='Администратор отклонил '+prefix+'.';
  else if(action==='created') message='Менеджер создал '+prefix+'.';
  else if(action==='resubmitted') message='Менеджер повторно отправил исправления по заявке №'+id+'.';
  else message='Изменён статус заявки №'+id+'.';
  const lines=items.map(itemDetails).filter(Boolean);
  if(proposal?.review_comment) lines.push('Комментарий администратора: '+proposal.review_comment);
  if(proposal?.description) lines.push('Комментарий к заявке: '+proposal.description);
  return {message,details:lines.join('\n'),category:'catalog'};
}
