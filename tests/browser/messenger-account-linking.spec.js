import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

test('messenger link APIs reject unauthenticated calls and cannot redeem an unverified ID', async ({page}) => {
  const base='/api/messenger-links';
  expect((await page.request.get(base+'/accounts')).status()).toBe(401);
  expect((await page.request.post(base+'/link-code',{data:{provider:'telegram'}})).status()).toBe(401);
  expect((await page.request.delete(base+'/accounts/telegram')).status()).toBe(401);
  // No public redemption endpoint exists. Internal code redemption must wait
  // for the authenticated messenger transport.
  expect((await page.request.post(base+'/redeem',{
    data:{provider:'telegram',provider_user_id:'1',code:'not-a-code'}
  })).status()).toBe(401);
});

test('logged-in CRM user can issue, throttle and revoke own Telegram and MAX pairing codes', async ({page}) => {
  await login(page);
  const base='/api/messenger-links';
  const list=await page.request.get(base+'/accounts');
  expect(list.status()).toBe(200);
  expect(list.headers()['cache-control']).toContain('no-store');
  expect((await list.json()).accounts).toEqual([]);

  const create=await page.request.post(base+'/link-code',{data:{provider:'telegram'}});
  expect(create.status()).toBe(201);
  expect(create.headers()['cache-control']).toContain('no-store');
  const first=await create.json();
  expect(first.provider).toBe('telegram');
  expect(first.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(new Date(first.expires_at).getTime()).toBeGreaterThan(Date.now());
  expect(new Date(first.expires_at).getTime()).toBeLessThan(Date.now()+301000);

  const throttle=await page.request.post(base+'/link-code',{data:{provider:'telegram'}});
  expect(throttle.status()).toBe(429);
  expect(throttle.headers()['retry-after']).toBe('30');
  expect((await throttle.text())).not.toContain(first.code);

  const different=await page.request.post(base+'/link-code',{data:{provider:'max'}});
  expect(different.status()).toBe(201);
  const second=await different.json();
  expect(second.code).not.toBe(first.code);
  expect(second.provider).toBe('max');

  const rejected=await page.request.post(base+'/link-code',{data:{provider:'other'}});
  expect(rejected.status()).toBe(400);
  expect((await page.request.delete(base+'/accounts/other')).status()).toBe(400);
  expect((await page.request.post(base+'/redeem',{
    data:{provider:'telegram',provider_user_id:'999',code:first.code}
  })).status()).toBe(404);

  const revocation=await page.request.delete(base+'/accounts/telegram');
  expect(revocation.status()).toBe(200);
  expect((await revocation.json()).revoked).toBe(false);
  // Revocation must also cancel any still-pending code for this provider.
  const issuedAgain=await page.request.post(base+'/link-code',{data:{provider:'telegram'}});
  expect(issuedAgain.status()).toBe(201);
  expect((await issuedAgain.json()).code).not.toBe(first.code);

  await page.request.delete(base+'/accounts/telegram');
  await page.request.delete(base+'/accounts/max');
});
