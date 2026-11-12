import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyMiniAppInitData } from '../src/bot/miniapp-auth.js';

const NOW = 1794499200000;
function signed(token, fields) {
  const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const string = entries.map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(string).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('Telegram and MAX Mini App credentials require valid, fresh signatures and matching provider tokens', () => {
  const stamp = String(Math.floor(NOW / 1000));
  const telegram = signed('telegram-test-token', {
    auth_date:stamp, query_id:'a-1', user:JSON.stringify({ id:123456789, first_name:'Иван' })
  });
  const max = signed('max-test-token', {
    auth_date:stamp, user:JSON.stringify({ id:234567890, first_name:'Ольга' })
  });
  assert.deepEqual(verifyMiniAppInitData('telegram', telegram, 'telegram-test-token', { nowMs:NOW }), {
    provider:'telegram', providerUserId:'123456789', firstName:'Иван', authenticatedAt:new Date(NOW).toISOString()
  });
  assert.equal(verifyMiniAppInitData('telegram', telegram, 'max-test-token', { nowMs:NOW }), null);
  assert.equal(verifyMiniAppInitData('max', telegram, 'max-test-token', { nowMs:NOW }), null);
  assert.equal(verifyMiniAppInitData('max', max, 'max-test-token', { nowMs:NOW })?.providerUserId, '234567890');
});

test('Mini App validation rejects tampering, expired signatures, duplicates and untrusted IDs', () => {
  const fields = { auth_date:String(Math.floor(NOW / 1000)), user:JSON.stringify({ id:300, first_name:'Test' }) };
  const valid = signed('secret-token', fields);
  assert.equal(verifyMiniAppInitData('telegram', valid.replace('Test', 'Admin'), 'secret-token', { nowMs:NOW }), null);
  assert.equal(verifyMiniAppInitData('telegram', valid, 'secret-token', { nowMs:NOW + 601000 }), null);
  assert.equal(verifyMiniAppInitData('telegram', valid, 'secret-token', { nowMs:NOW - 61000 }), null);
  assert.equal(verifyMiniAppInitData('telegram', valid + '&user=%7B%7D', 'secret-token', { nowMs:NOW }), null);
  assert.equal(verifyMiniAppInitData('telegram', valid + '&hash=abcd', 'secret-token', { nowMs:NOW }), null);
  assert.equal(verifyMiniAppInitData('unknown', valid, 'secret-token', { nowMs:NOW }), null);
  const invalidUser = signed('secret-token', { ...fields, user:JSON.stringify({ id:0, first_name:'Invalid' }) });
  assert.equal(verifyMiniAppInitData('max', invalidUser, 'secret-token', { nowMs:NOW }), null);
});

test('Mini App validation does not grant a role or trading-point access', () => {
  const signedData = signed('token', { auth_date:String(NOW / 1000), user:JSON.stringify({ id:51, role:'administrator', location_ids:[1] }) });
  const result = verifyMiniAppInitData('telegram', signedData, 'token', { nowMs:NOW });
  assert.deepEqual(Object.keys(result).sort(), ['authenticatedAt', 'firstName', 'provider', 'providerUserId'].sort());
  assert.equal(result.role, undefined);
  assert.equal(result.location_ids, undefined);
});
