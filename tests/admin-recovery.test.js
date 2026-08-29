import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePassword, verifyPassword } from '../src/services/password-service.js';
import { resetAdministratorPassword } from '../src/services/admin-recovery-service.js';

const config = Object.freeze({
  passwordMinLength: 12,
  passwordMaxLength: 32,
  generatedPasswordLength: 16
});

test('generated recovery password respects configured policy', () => {
  for (let index = 0; index < 20; index += 1) {
    const password = generatePassword(config);
    assert.equal(password.length, 16);
    assert.match(password, /[a-z]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /\d/);
    assert.match(password, /[^A-Za-z0-9]/);
  }
});

test('generated recovery password never falls below configured minimum', () => {
  const password = generatePassword({ ...config, passwordMinLength: 18, generatedPasswordLength: 10 });
  assert.equal(password.length, 18);
});

test('administrator recovery updates hash, invalidates sessions and tolerates audit failure', async () => {
  let update = null;
  const store = {
    async listActiveAdministrators() {
      return [{ username: 'admin', session_version: 4 }];
    },
    async updateUserPassword(username, passwordHash) {
      update = { username, passwordHash };
      return { username, session_version: 5 };
    },
    async recordActivity() {
      throw new Error('audit unavailable');
    }
  };

  const result = await resetAdministratorPassword({ store, config });
  assert.equal(result.username, 'admin');
  assert.equal(result.sessionVersion, 5);
  assert.equal(update.username, 'admin');
  assert.equal(await verifyPassword(result.password, update.passwordHash), true);
});

test('administrator recovery requires explicit username when several administrators exist', async () => {
  const store = {
    async listActiveAdministrators() {
      return [{ username: 'admin-a' }, { username: 'admin-b' }];
    }
  };
  await assert.rejects(
    resetAdministratorPassword({ store, config }),
    /Укажите логин: admin-a, admin-b/
  );
});
