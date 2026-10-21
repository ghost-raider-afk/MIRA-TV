import { catalogPropertyLabel, catalogValueLabel, catalogProductTitle, catalogChangeParts } from '../src/web/admin-ui/public/js/core/catalog-presentation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestStatus, requestTopic, requestDate, requestHistoryEvent } from '../src/web/admin-ui/public/js/core/requests.js';

test('historical statuses have one agreed Russian label', () => {
  assert.equal(requestStatus({status:'pending'}), 'На рассмотрении');
  assert.equal(requestStatus({status:'rework'}), 'На доработке');
  assert.equal(requestStatus({status:'approved'}), 'Завершена');
  assert.equal(requestStatus({status:'resolved'}), 'Завершена');
  assert.equal(requestStatus({status:'rejected'}), 'Отклонено');
  assert.equal(requestStatus({status:'conflict'}), 'Ошибка');
});

test('six request subjects use the approved names', () => {
  for (const [kind, expected] of Object.entries({
    price_change:'Изменить цену',
    property_change:'Изменить свойства товара',
    menu_add:'Добавить позиции в меню',
    product_create:'Добавить новый товар в общую базу',
    menu_remove:'Убрать позиции из меню',
    message:'Другое обращение'
  })) {
    assert.equal(requestTopic({request_type:kind}), expected);
  }
  assert.equal(requestTopic({entity_type:'message',title:'Проверить поставку'}), 'Проверить поставку');
});

test('request timestamps use Russian date and time', () => {
  assert.equal(requestDate(null), '—');
  assert.equal(requestDate('invalid'), '—');
  assert.match(requestDate('2026-10-20T08:30:00Z'), /20\.10\.2026/);
});

test('shared request history displays all per-position administrator decisions in Russian',()=>{
  const description=requestHistoryEvent({
    action:'reviewed',actor:'admin',created_at:'2026-10-20T08:30:00Z',
    details:{decisions:[
      {key:1,decision:'approved'},
      {key:2,decision:'rejected',comment:'Позиция снята'},
      {key:3,decision:'rework',comment:'Уточнить производителя'}
    ]}
  });
  assert.match(description,/Рассмотрены позиции/);
  assert.match(description,/Позиция №1: Согласовано/);
  assert.match(description,/Позиция №2: Отклонено — Позиция снята/);
  assert.match(description,/Позиция №3: На доработку — Уточнить производителя/);
});
test('saved catalog product and completed message preserve user-readable audit details',()=>{
  const saved=requestHistoryEvent({
    action:'product_saved',actor:'admin',details:{product_id:88}
  });
  assert.match(saved,/Товар сохранён в общую базу/);
  assert.match(saved,/ID товара: 88/);
  const completed=requestHistoryEvent({
    action:'completed',actor:'admin',details:{reply:'Проверено, всё работает'}
  });
  assert.match(completed,/Завершена с ответом/);
  assert.match(completed,/Проверено, всё работает/);
});

test('all change details use Russian field labels, before/after and ruble prices', () => {
  const price=catalogChangeParts('price_primary','230.00','235');
  assert.deepEqual(price,{field:'Цена за 1 л',before:'Было: 230,00 ₽',after:'Станет: 235,00 ₽'});
  assert.equal(catalogValueLabel('unit_price','12.5'),'12,50 ₽');
  assert.equal(catalogPropertyLabel('unknown_field'),'Характеристика товара');
  for (const [field,expected] of [
    ['filtration','Фильтрация'],['beverage_color','Цвет напитка'],
    ['strength','Крепость'],['producer','Производитель'],['address','Адрес']
  ]) assert.equal(catalogChangeParts(field,'a','b').field,expected);
  assert.equal(catalogChangeParts('filtration','filtered','unfiltered').after,'Станет: Нефильтрованное');
  assert.equal(catalogChangeParts('beverage_color','light','dark').before,'Было: Светлое');
});

test('product name includes manufacturer; supports new product payloads and historical rows', () => {
  assert.equal(catalogProductTitle({name:'27 РЕГИОН',producer:'Пивоварня Амур'}),
    'Товар: 27 РЕГИОН (Пивоварня Амур)');
  assert.equal(catalogProductTitle({payload:{name:'Лагер',producer:'Завод А'}}),
    'Товар: Лагер (Завод А)');
  assert.equal(catalogProductTitle({name:'Лагер'}),'Товар: Лагер');
});
