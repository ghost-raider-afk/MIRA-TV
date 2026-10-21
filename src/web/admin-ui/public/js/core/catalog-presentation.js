// One Russian vocabulary for stored catalog values in both CRM roles.
export const CATALOG_FIELD_LABELS = Object.freeze({
  name:'Название',producer:'Производитель',address:'Адрес',
  characteristics:'Характеристики',strength:'Крепость',
  price_primary:'Цена за 1 л',price_secondary:'Цена за 1,5 л',
  alcoholic:'Алкогольная продукция',beverage_color:'Цвет напитка',
  filtration:'Фильтрация',unit_price:'Цена тары',active:'Активна'
});

export const CATALOG_OPTIONS = Object.freeze({
  beverage_color:Object.freeze([
    ['none','Не задан'],['light','Светлое'],['dark','Тёмное'],
    ['white','Белое'],['semi_dark','Полутёмное'],['amber','Янтарное'],['red','Красное']
  ]),
  filtration:Object.freeze([
    ['none','Не задана'],['filtered','Фильтрованное'],['unfiltered','Нефильтрованное']
  ]),
  alcoholic:Object.freeze([['true','Да'],['false','Нет']]),
  active:Object.freeze([['true','Да'],['false','Нет']])
});

export function catalogPropertyLabel(field) {
  return CATALOG_FIELD_LABELS[field] || 'Характеристика товара';
}

export function catalogProductTitle(item) {
  const product=item?.payload || item || {};
  const name=String(product.name || '').trim();
  const producer=String(product.producer || '').trim();
  return 'Товар: ' + (name || 'Без названия') + (producer ? ' (' + producer + ')' : '');
}

export function catalogChangeParts(field,before,after) {
  return {
    field:catalogPropertyLabel(field),
    before:'Было: ' + catalogValueLabel(field,before),
    after:'Станет: ' + catalogValueLabel(field,after)
  };
}

export function catalogValueLabel(field,value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (['price_primary','price_secondary','unit_price'].includes(field)) {
    const amount=Number(String(value).replace(',', '.'));
    if (Number.isFinite(amount)) return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits:2,maximumFractionDigits:2
    }).format(amount) + ' ₽';
  }
  const choices=CATALOG_OPTIONS[field];
  if (choices) {
    return choices.find(([id])=>id===String(value))?.[1] || String(value);
  }
  return String(value);
}
