import assert from 'node:assert/strict';
import test from 'node:test';
import { greetingForHour } from '../src/web/admin-ui/public/js/core/greeting.js';
import { managerDisplayNameInput } from '../src/contracts/users.js';

test('one greeting for every local hour', () => {
  for (let hour = 0; hour < 24; hour++) {
    const expected = hour >= 5 && hour < 11 ? 'Доброе утро' : hour >= 11 && hour < 17
      ? 'Добрый день' : hour >= 17 && hour < 23 ? 'Добрый вечер' : 'Доброй ночи';
    assert.equal(greetingForHour(hour), expected);
  }
});

test('names are trimmed and validated', () => {
  assert.equal(managerDisplayNameInput('  Иван   Петров  '), 'Иван Петров');
  assert.throws(() => managerDisplayNameInput('   '));
  assert.throws(() => managerDisplayNameInput('X'.repeat(81)));
  assert.throws(() => managerDisplayNameInput('Иван\nПетров'));
});
