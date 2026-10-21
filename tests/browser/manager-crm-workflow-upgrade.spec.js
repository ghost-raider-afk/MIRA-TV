import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { migrateCatalogChangeProposals } from '../../src/db/migrations/catalog-change-proposals.js';
import { migrateManagerCrmCards } from '../../src/db/migrations/manager-crm-cards.js';
import { migrateCrmRequestWorkflow } from '../../src/db/migrations/crm-request-workflow.js';
import { createCatalogProposalsRepository } from '../../src/db/catalog-proposals.js';

test.skip(!process.env.POSTGRES_HOST, 'PostgreSQL integration environment is required');

test('existing CRM records and decisions survive additive workflow migration', async () => {
  const client = new Client({
    host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT || 5432),
    database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,
    password:process.env.POSTGRES_PASSWORD
  });
  const schema='crm_workflow_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  await client.connect();
  try {
    await client.query('CREATE SCHEMA "'+schema+'"');
    await client.query('SET search_path TO "'+schema+'", public');
    await client.query('CREATE TABLE locations (id BIGINT PRIMARY KEY,name TEXT NOT NULL)');
    await client.query('CREATE TABLE catalog_products (id BIGINT PRIMARY KEY,name TEXT NOT NULL UNIQUE)');
    await client.query("INSERT INTO locations (id,name) VALUES (10,'Точка 10')");
    await migrateCatalogChangeProposals(client);
    await migrateManagerCrmCards(client);
    const created=await client.query(`INSERT INTO catalog_change_proposals
      (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,
       status,title,description)
      VALUES ('manager','message',NULL,NULL,'{}'::jsonb,'{}'::jsonb,'resolved',
              'Вопрос','Старое обращение')
      RETURNING id,created_at`);
    const id=created.rows[0].id;
    await migrateCrmRequestWorkflow(client);
    const preserved=await client.query(
      'SELECT entity_type,status,title,description,items_json,revision,status_changed_at FROM catalog_change_proposals WHERE id=$1',[id]
    );
    expect(preserved.rows[0]).toMatchObject({
      entity_type:'message',status:'resolved',title:'Вопрос',description:'Старое обращение',
      items_json:[],revision:'1'
    });
    expect(preserved.rows[0].status_changed_at).not.toBeNull();
    await client.query(`INSERT INTO catalog_change_proposals
      (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,
       status,request_type,items_json)
      VALUES ('manager','request',NULL,NULL,'{}'::jsonb,'{}'::jsonb,'rework',
              'price_change','[{"key":1,"decision":"rework"}]'::jsonb)`);
    await client.query(`INSERT INTO catalog_proposal_events(proposal_id,actor,action,details_json)
      VALUES ($1,'admin','returned','{"reason":"Проверьте цену"}'::jsonb)`,[id]);
    await migrateCrmRequestWorkflow(client);
    const counts=await client.query('SELECT COUNT(*)::int AS count FROM catalog_change_proposals');
    expect(counts.rows[0].count).toBe(4);
    // Resolve a real pending historical message: this catches PostgreSQL's
    // inconsistent parameter type inference for shared timestamp expressions.
    const pending=await client.query(`INSERT INTO catalog_change_proposals
      (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,
       status,title,description)
      VALUES ('manager','message',NULL,NULL,'{}'::jsonb,'{}'::jsonb,'pending',
              'Ответить','Необходимо проверить экран')
      RETURNING id`);
    const repo=createCatalogProposalsRepository(client);
    const decision=await repo.resolveCatalogProposal(pending.rows[0].id,{
      status:'resolved',reviewerUsername:'admin',reviewComment:'Проверили, всё исправлено.'
    });
    expect(decision).toMatchObject({
      status:'resolved',reviewer_username:'admin',review_comment:'Проверили, всё исправлено.'
    });
    expect(decision.status_changed_at).not.toBeNull();
    const otherPending=await client.query(`INSERT INTO catalog_change_proposals
      (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,
       status,title,description)
      VALUES ('manager','message',NULL,NULL,'{}'::jsonb,'{}'::jsonb,'pending',
              'Уточнить','Вернуть на доработку')
      RETURNING id`);
    const returned=await repo.resolveCatalogProposal(otherPending.rows[0].id,{
      status:'rework',reviewerUsername:'admin',reviewComment:'Уточните номер торговой точки.'
    });
    expect(returned).toMatchObject({status:'rework',decided_at:null});
    const eventCount=await client.query('SELECT COUNT(*)::int AS count FROM catalog_proposal_events WHERE proposal_id=$1',[id]);
    expect(eventCount.rows[0].count).toBe(1);
    const history=await client.query('SELECT status,request_type FROM catalog_change_proposals WHERE entity_type=$1',['request']);
    expect(history.rows[0]).toMatchObject({status:'rework',request_type:'price_change'});
  } finally {
    await client.query('SET search_path TO public').catch(()=>undefined);
    await client.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>undefined);
    await client.end();
  }
});
