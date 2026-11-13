import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!';
async function login(page, username, password) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await Promise.all([
    page.waitForURL(url => username === 'admin' ? url.pathname === '/' : url.pathname === '/manager'),
    page.getByRole('button',{name:/войти/i}).click()
  ]);
}

test('only administrators can assign Telegram/MAX IDs; duplicates are rejected atomically',async({page,browser})=>{
  await login(page,'admin',ADMIN_PASSWORD);
  const username='bot-uid-'+Date.now().toString(36);
  const password='Browser-CI-Password1!';
  const tg='7'+Date.now().toString();
  const max='8'+Date.now().toString();
  const another='9'+Date.now().toString();
  const base='/api/admin/managers/messenger-users';
  let managerCreated=false;
  let originalAdminIds={telegram_id:'',max_id:''};
  try {
    const before=await page.request.get(base);
    expect(before.status()).toBe(200);
    expect(before.headers()['cache-control']).toContain('no-store');
    const initial=(await before.json()).users;
    const admin=initial.find(x=>x.username==='admin');
    expect(admin).toBeTruthy();
    expect(admin.role).toBe('administrator');
    originalAdminIds={telegram_id:admin.telegram_id || '',max_id:admin.max_id || ''};

    const create=await page.request.post('/api/admin/managers',{
      data:{username,password,display_name:'Тест менеджер бота'}
    });
    expect(create.status()).toBe(201);
    managerCreated=true;
    const ids=await page.request.put(base+'/admin',{
      data:{telegram_id:tg,max_id:max}
    });
    expect(ids.status()).toBe(200);
    expect((await ids.json()).telegram_id).toBe(tg);
    const list=await page.request.get(base);
    const users=(await list.json()).users;
    expect(users.find(x=>x.username==='admin').max_id).toBe(max);
    expect(users.find(x=>x.username===username).telegram_id).toBe('');

    const conflict=await page.request.put(base+'/'+username,{
      data:{telegram_id:tg,max_id:another}
    });
    expect(conflict.status()).toBe(409);
    const afterConflict=(await (await page.request.get(base)).json()).users;
    expect(afterConflict.find(x=>x.username===username).max_id).toBe('');

    const own=await page.request.put(base+'/'+username,{
      data:{telegram_id:another,max_id:''}
    });
    expect(own.status()).toBe(200);
    expect((await own.json()).telegram_id).toBe(another);

    const invalid=await page.request.put(base+'/'+username,{
      data:{telegram_id:0,max_id:''}
    });
    expect(invalid.status()).toBe(400);
    expect((await page.request.put(base+'/'+username,{
      data:{telegram_id:'9223372036854775808',max_id:''}
    })).status()).toBe(400);
    expect((await page.request.put(base+'/missing-user-xyz',{
      data:{telegram_id:another,max_id:''}
    })).status()).toBe(404);

    const memberContext=await browser.newContext({ baseURL:process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080' });
    try {
      const member=await memberContext.newPage();
      await login(member,username,password);
      expect((await member.request.get(base)).status()).toBe(403);
      expect((await member.request.put(base+'/'+username,{
        data:{telegram_id:'456789',max_id:''}
      })).status()).toBe(403);
      // Existing role middleware denies this request before 404 fallback.
      // Access must be forbidden, regardless of whether a route is installed.
      expect((await member.request.post('/api/messenger-links/link-code',{
        data:{provider:'telegram'}
      })).status()).toBe(403);
    } finally {
      await memberContext.close();
    }

    await page.goto('/settings');
    const adminRow=page.locator('.bot-user-row[data-username="admin"]');
    const managerRow=page.locator('.bot-user-row[data-username="'+username+'"]');
    await expect(adminRow.getByRole('textbox',{name:'Telegram ID пользователя admin'})).toHaveValue(tg);
    await expect(managerRow.getByRole('textbox',{name:'Telegram ID пользователя '+username})).toHaveValue(another);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);

    await managerRow.getByRole('textbox',{name:'Telegram ID пользователя '+username}).fill('');
    await managerRow.getByRole('button',{name:'Сохранить ID'}).click();
    await expect(page.locator('#bot-user-message')).toContainText('сохранены');
    const revoked=(await (await page.request.get(base)).json()).users;
    expect(revoked.find(x=>x.username===username).telegram_id).toBe('');
  } finally {
    await page.request.put(base+'/admin',{data:originalAdminIds});
    if (managerCreated) await page.request.delete('/api/admin/managers/'+username);
  }
});

test('no public or self-service binding routes are mounted',async({page})=>{
  expect((await page.request.get('/api/messenger-links/accounts')).status()).toBe(401);
  expect((await page.request.post('/api/messenger-links/link-code',{
    data:{provider:'telegram'}
  })).status()).toBe(401);
  await login(page,'admin',ADMIN_PASSWORD);
  expect((await page.request.post('/api/messenger-links/link-code',{
    data:{provider:'telegram'}
  })).status()).toBe(404);
  expect((await page.request.post('/api/messenger-links/redeem',{
    data:{provider:'telegram',provider_user_id:'123'}
  })).status()).toBe(404);
});
