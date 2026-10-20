import test from 'node:test';
import assert from 'node:assert/strict';
import { requestStatus, requestTopic, requestDate } from '../src/web/admin-ui/public/js/core/requests.js';

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
