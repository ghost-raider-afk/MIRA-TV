import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateLegacyMenuSettings } from '../src/db/migrations/menu-settings.js';
import { retireLegacyTemplates } from '../src/db/migrations/template-retirement.js';

test('legacy screen menu settings migrate once into canonical monitor settings', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query('CREATE TABLE screen_drafts (screen_id BIGINT PRIMARY KEY, settings_json TEXT NOT NULL)');
  await pool.query('INSERT INTO screen_drafts VALUES (2, $1)', [JSON.stringify({ font_scale: 'small', table_width: 1200, title: 'Старое' })]);
  await migrateLegacyMenuSettings(pool);
  await migrateLegacyMenuSettings(pool);
  const draft = JSON.parse((await pool.query('SELECT settings_json FROM screen_drafts WHERE screen_id=2')).rows[0].settings_json);
  assert.equal(draft.font_scale_percent, 88);
  assert.equal(draft.table_width_px, 1200);
  assert.equal('font_scale' in draft, false);
  assert.equal('table_width' in draft, false);
  assert.equal('title' in draft, false);
  await pool.end();
});

test('template retirement materializes assigned design and rows before dropping legacy schema', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE templates (id BIGINT PRIMARY KEY, rows_json TEXT NOT NULL, settings_json TEXT NOT NULL);
    CREATE TABLE screens (
      id BIGINT PRIMARY KEY, template_id BIGINT,
      prepared_asset_key TEXT, prepared_asset_sha256 TEXT, prepared_asset_size BIGINT, prepared_draft_revision BIGINT,
      publication_pending_sha256 TEXT, publication_started_at TIMESTAMPTZ, status TEXT, updated_at TIMESTAMPTZ
    );
    CREATE TABLE screen_drafts (screen_id BIGINT PRIMARY KEY, rows_json TEXT NOT NULL, settings_json TEXT NOT NULL, revision BIGINT NOT NULL, updated_at TIMESTAMPTZ);
  `);
  await pool.query('INSERT INTO templates VALUES (1,$1,$2)', [
    JSON.stringify([{ id: 'legacy-row', kind: 'section', name: 'Из шаблона' }]),
    JSON.stringify({ accent_color: '#F4C915', background_image_url: '/site-assets/templates/background-11111111-1111-1111-1111-111111111111.png' })
  ]);
  await pool.query("INSERT INTO screens VALUES (10,1,'stale','sha',100,2,NULL,NULL,'ready',NOW())");
  await pool.query('INSERT INTO screen_drafts VALUES (10,$1,$2,3,NOW())', ['[]', JSON.stringify({ font_scale_percent: 105 })]);

  await retireLegacyTemplates(pool);

  const draft = (await pool.query('SELECT * FROM screen_drafts WHERE screen_id=10')).rows[0];
  const rows = JSON.parse(draft.rows_json);
  const settings = JSON.parse(draft.settings_json);
  assert.equal(rows[0].name, 'Из шаблона');
  assert.equal(settings.font_scale_percent, 105);
  assert.equal(settings.accent_color, '#F4C915');
  assert.equal(settings.background_image_url, '/site-assets/screens/background-11111111-1111-1111-1111-111111111111.png');
  assert.equal(Number(draft.revision), 4);
  const screen = (await pool.query('SELECT * FROM screens WHERE id=10')).rows[0];
  assert.equal(screen.status, 'draft');
  assert.equal(screen.prepared_asset_key, null);
  await assert.rejects(pool.query('SELECT * FROM templates'));
  const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='screens'")).rows.map((row) => row.column_name);
  assert.equal(columns.includes('template_id'), false);
  await pool.end();
});
