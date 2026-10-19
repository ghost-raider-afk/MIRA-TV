import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { migrateCatalogChangeProposals } from '../../src/db/migrations/catalog-change-proposals.js';
import { migrateManagerAccess } from '../../src/db/migrations/manager-access.js';
import { migrateManagerCrmCards } from '../../src/db/migrations/manager-crm-cards.js';

test.skip(!process.env.POSTGRES_HOST, 'PostgreSQL integration environment is required');

test('legacy managers and catalog proposals survive upgrade to CRM cards', async () => {
  const client = new Client({
    host:process.env.POSTGRES_HOST,
    port:Number(process.env.POSTGRES_PORT || 5432),
    database:process.env.POSTGRES_DB,
    user:process.env.POSTGRES_USER,
    password:process.env.POSTGRES_PASSWORD
  });
  const schema = 'crm_upgrade_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  await client.connect();
  try {
    await client.query('CREATE SCHEMA "' + schema + '"');
    await client.query('SET search_path TO "' + schema + '", public');
    await client.query('CREATE TABLE web_users (username TEXT PRIMARY KEY, role TEXT NOT NULL)');
    await client.query('CREATE TABLE locations (id BIGINT PRIMARY KEY, name TEXT NOT NULL)');
    await client.query("INSERT INTO web_users (username,role) VALUES ('existing','manager')");
    await client.query("INSERT INTO locations (id,name) VALUES (11,'Точка с историей')");
    await migrateCatalogChangeProposals(client);
    const old = await client.query(`INSERT INTO catalog_change_proposals
      (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,status)
      VALUES ('existing','product',17,NOW(),'{"name":"Старая запись","price_primary":"100"}'::jsonb,
      '{"name":"Старая запись","price_primary":"120"}'::jsonb,'pending') RETURNING id`);
    const oldId = old.rows[0].id;

    await migrateManagerAccess(client);
    await migrateManagerCrmCards(client);
    const grant = await client.query("SELECT all_locations,catalog_enabled FROM manager_access WHERE username='existing'");
    expect(grant.rows[0]).toEqual({ all_locations:true,catalog_enabled:true });
    const preserved = await client.query('SELECT entity_type,entity_id,status,base_payload,proposed_payload FROM catalog_change_proposals WHERE id=$1', [oldId]);
    expect(preserved.rows[0]).toMatchObject({
      entity_type:'product',entity_id:'17',status:'pending',
      base_payload:{ name:'Старая запись',price_primary:'100' },
      proposed_payload:{ name:'Старая запись',price_primary:'120' }
    });

    await client.query("INSERT INTO web_users (username,role) VALUES ('new','manager')");
    await client.query("INSERT INTO manager_access(username) VALUES ('new')");
    const noGrant=await client.query("SELECT all_locations,catalog_enabled FROM manager_access WHERE username='new'");
    expect(noGrant.rows[0]).toEqual({ all_locations:false,catalog_enabled:false });

    const textCard = await client.query(`INSERT INTO catalog_change_proposals
      (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,title,description,location_id)
      VALUES ('existing','message',NULL,NULL,'{}','{}','Сообщение','Проверить монитор',11)
      RETURNING entity_type,entity_id,title,description,location_id`);
    expect(textCard.rows[0]).toMatchObject({
      entity_type:'message', entity_id:null, title:'Сообщение',
      description:'Проверить монитор', location_id:'11'
    });
    // Repeated migrations must not override permissions or erase existing CRM data.
    await migrateManagerAccess(client);
    await migrateManagerCrmCards(client);
    const stillRestricted=await client.query("SELECT all_locations FROM manager_access WHERE username='new'");
    expect(stillRestricted.rows[0].all_locations).toBe(false);
    const count=await client.query('SELECT COUNT(*)::int AS count FROM catalog_change_proposals');
    expect(count.rows[0].count).toBe(2);
  } finally {
    await client.query('SET search_path TO public').catch(() => undefined);
    await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => undefined);
    await client.end();
  }
});
