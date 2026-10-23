import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {migrateRequestNotifications} from '../../src/db/migrations/request-notifications.js';
import {createRequestNotificationsRepository} from '../../src/db/request-notifications.js';

test.skip(!process.env.POSTGRES_HOST,'PostgreSQL integration environment is required');

test('real PostgreSQL: role fanout, rollback, per-user read/clear and sound preference',async()=>{
  const client=new Client({
    host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT||5432),
    database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,
    password:process.env.POSTGRES_PASSWORD
  });
  const schema='request_notifications_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  await client.connect();
  try {
    await client.query('CREATE SCHEMA "'+schema+'"');
    await client.query('SET search_path TO "'+schema+'", public');
    await client.query(`
      CREATE TABLE web_users(username TEXT PRIMARY KEY,role TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE);
      CREATE TABLE user_preferences(username TEXT PRIMARY KEY,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE locations(id BIGINT PRIMARY KEY,name TEXT NOT NULL);
      CREATE TABLE activity_events(id BIGSERIAL PRIMARY KEY,message TEXT NOT NULL);
      CREATE TABLE catalog_change_proposals(
        id BIGSERIAL PRIMARY KEY,manager_username TEXT NOT NULL,entity_type TEXT NOT NULL DEFAULT 'request',
        status TEXT NOT NULL DEFAULT 'pending',title TEXT NOT NULL DEFAULT '',
        request_type TEXT,location_id BIGINT,items_json JSONB NOT NULL DEFAULT '[]'::jsonb
      );
      INSERT INTO web_users(username,role) VALUES
        ('admin1','administrator'),('admin2','administrator'),('manager','manager'),('other','manager');
      INSERT INTO user_preferences(username) VALUES ('admin1'),('admin2'),('manager'),('other');
      INSERT INTO locations(id,name) VALUES(3,'Точка Центральная');
      INSERT INTO activity_events(message) VALUES ('Неизменяемый аудит');
    `);
    await migrateRequestNotifications(client);
    const {rows:[proposal]}=await client.query(`
      INSERT INTO catalog_change_proposals(manager_username,request_type,location_id)
      VALUES('manager','price_change',3) RETURNING id
    `);
    const inbox=createRequestNotificationsRepository(client);
    expect((await inbox.listRequestNotifications('admin1')).unread_count).toBe(1);
    expect((await inbox.listRequestNotifications('admin2')).unread_count).toBe(1);
    expect((await inbox.listRequestNotifications('manager')).unread_count).toBe(0);
    expect((await inbox.listRequestNotifications('other')).unread_count).toBe(0);

    await client.query('BEGIN');
    await client.query("UPDATE catalog_change_proposals SET status='rework' WHERE id=$1",[proposal.id]);
    await client.query('ROLLBACK');
    expect((await inbox.listRequestNotifications('manager')).unread_count).toBe(0);
    await client.query("UPDATE catalog_change_proposals SET status='rework' WHERE id=$1",[proposal.id]);
    expect((await inbox.listRequestNotifications('manager')).unread_count).toBe(1);
    await client.query("UPDATE catalog_change_proposals SET status='pending' WHERE id=$1",[proposal.id]);
    expect((await inbox.listRequestNotifications('admin1')).unread_count).toBe(2);
    await client.query("UPDATE catalog_change_proposals SET status='approved' WHERE id=$1",[proposal.id]);
    expect((await inbox.listRequestNotifications('manager')).unread_count).toBe(2);
    const items=(await inbox.listRequestNotifications('manager')).items;
    expect(items.map(x=>x.kind)).toEqual(['approved','rework']);
    expect(items[0].location_name).toBe('Точка Центральная');
    const claimed=await inbox.claimRequestNotifications('manager');
    expect(claimed.length).toBe(2);
    expect((await inbox.claimRequestNotifications('manager')).length).toBe(0);
    await inbox.readRequestNotification('manager',items[0].id);
    expect((await inbox.listRequestNotifications('manager')).unread_count).toBe(1);
    await inbox.clearRequestNotifications('admin1');
    expect((await inbox.listRequestNotifications('admin1')).items).toHaveLength(0);
    expect((await inbox.listRequestNotifications('admin2')).unread_count).toBe(2);
    expect((await inbox.listRequestNotifications('manager')).unread_count).toBe(1);
    expect(await inbox.setRequestSound('manager',true)).toBe(true);
    const audit=await client.query('SELECT message FROM activity_events');
    expect(audit.rows).toEqual([{message:'Неизменяемый аудит'}]);
  } finally {
    await client.query('SET search_path TO public').catch(()=>undefined);
    await client.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>undefined);
    await client.end();
  }
});
