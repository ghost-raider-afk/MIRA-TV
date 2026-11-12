import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createMessengerLinksRepository } from '../../src/db/messenger-links.js';
import { createMessengerLinkCode, messengerLinkCodeHash } from '../../src/bot/account-linking.js';

test('PostgreSQL pairing is single-use, atomic, per identity and respects active accounts', async () => {
  test.skip(!process.env.POSTGRES_DB, 'Requires PostgreSQL test service');
  const client=new pg.Client({
    host:process.env.POSTGRES_HOST||'127.0.0.1',
    port:Number(process.env.POSTGRES_PORT||5432),
    user:process.env.POSTGRES_USER,
    password:process.env.POSTGRES_PASSWORD,
    database:process.env.POSTGRES_DB
  });
  await client.connect();
  const user1='bot-link-'+randomUUID();
  const user2='bot-link-'+randomUUID();
  const repo=createMessengerLinksRepository(client);
  const expires=()=>new Date(Date.now()+5*60_000).toISOString();
  const hash=()=>messengerLinkCodeHash(createMessengerLinkCode());
  try {
    await client.query(
      `INSERT INTO web_users
        (username,password_hash,role,active,session_version,password_changed_at,created_at,updated_at)
       VALUES ($1,'test-only','manager',TRUE,1,NOW(),NOW(),NOW()),
              ($2,'test-only','manager',TRUE,1,NOW(),NOW(),NOW())`,
      [user1,user2]
    );
    const first=hash();
    expect(await repo.issueMessengerLinkCode(user1,'telegram',first,expires())).toBeTruthy();
    const issued=await client.query(
      'SELECT code_hash FROM messenger_link_codes WHERE username=$1 AND provider=$2',
      [user1,'telegram']
    );
    expect(issued.rows[0].code_hash.trim()).toBe(first);
    const linked=await repo.redeemMessengerLinkCode('telegram',first,'601234567');
    expect(linked?.username).toBe(user1);
    expect(await repo.redeemMessengerLinkCode('telegram',first,'601234567')).toBeNull();
    expect((await repo.resolveMessengerAccount('telegram','601234567'))?.role).toBe('manager');

    const different=hash();
    expect(await repo.issueMessengerLinkCode(user2,'telegram',different,expires())).toBeTruthy();
    await expect(repo.redeemMessengerLinkCode('telegram',different,'601234567'))
      .rejects.toMatchObject({code:'23505'});
    // The conflicting insert must undo consumption of this still-valid code.
    expect((await repo.redeemMessengerLinkCode('telegram',different,'601234568'))?.username).toBe(user2);
    expect(await repo.redeemMessengerLinkCode('telegram',different,'601234569')).toBeNull();

    const expired=hash();
    expect(await repo.issueMessengerLinkCode(user1,'max',expired,
      new Date(Date.now()-1000).toISOString())).toBeTruthy();
    expect(await repo.redeemMessengerLinkCode('max',expired,'708765432')).toBeNull();

    const pending=hash();
    await repo.issueMessengerLinkCode(user2,'max',pending,expires());
    await client.query('UPDATE web_users SET active=FALSE WHERE username=$1',[user2]);
    expect(await repo.redeemMessengerLinkCode('max',pending,'708765433')).toBeNull();
    expect(await repo.resolveMessengerAccount('telegram','601234568')).toBeNull();
    await client.query('UPDATE web_users SET active=TRUE WHERE username=$1',[user2]);
    expect((await repo.redeemMessengerLinkCode('max',pending,'708765433'))?.username).toBe(user2);

    const revoke=await repo.revokeMessengerAccount(user1,'telegram');
    expect(revoke).toBe(true);
    expect(await repo.resolveMessengerAccount('telegram','601234567')).toBeNull();
    expect((await repo.listMessengerAccounts(user2)).length).toBe(2);
  } finally {
    await client.query('DELETE FROM web_users WHERE username IN ($1,$2)',[user1,user2]);
    await client.end();
  }
});
