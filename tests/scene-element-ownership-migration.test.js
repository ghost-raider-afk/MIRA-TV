import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateLegacySceneOwnership } from '../src/db/migrations/scene-element-ownership.js';

test('legacy specialized overlays migrate into generic scene elements while aquarium is not copied', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query("CREATE TABLE screen_drafts (screen_id BIGINT PRIMARY KEY, scene_json TEXT NOT NULL DEFAULT '{\"version\":1,\"elements\":[]}')");
  await pool.query("CREATE TABLE screen_animation_settings (screen_id BIGINT PRIMARY KEY, entity_json TEXT NOT NULL DEFAULT '{}', announcement_json TEXT NOT NULL DEFAULT '{}', brand_json TEXT NOT NULL DEFAULT '{}', environment_json TEXT NOT NULL DEFAULT '{}')");
  await pool.query("CREATE TABLE screen_weather_settings (screen_id BIGINT PRIMARY KEY, config_json TEXT NOT NULL DEFAULT '{}')");
  await pool.query("INSERT INTO screen_drafts (screen_id) VALUES (1)");
  await pool.query("INSERT INTO screen_animation_settings (screen_id, entity_json, announcement_json, brand_json, environment_json) VALUES (1, $1, $2, $3, $4)", [
    JSON.stringify({ visible:true, asset_url:'/site-assets/entities/entity-00000000-0000-4000-8000-000000000001.png', asset_type:'image', width:500, height:1000, transform:{x:1500,y:100,width:300,scale:1,rotation:0,depth:10,opacity:1} }),
    JSON.stringify({ enabled:true, text:'Сегодня скидка', position:'bottom', font_size:34, text_color:'#FFFFFF' }),
    JSON.stringify({ enabled:true, text:'БАР МАЯК', x:100, y:80, font_size:72, text_color:'#FFFFFF' }),
    JSON.stringify({ enabled:true, effect:'aquarium', parameters:{fish_count:8} })
  ]);
  await pool.query("INSERT INTO screen_weather_settings (screen_id, config_json) VALUES (1, $1)", [
    JSON.stringify({ enabled:true, location_name:'Хельсинки', latitude:60.17, longitude:24.94, timezone:'Europe/Helsinki', x:1660, y:190, width_px:420 })
  ]);

  await migrateLegacySceneOwnership(pool);
  const stored = JSON.parse((await pool.query('SELECT scene_json FROM screen_drafts WHERE screen_id=1')).rows[0].scene_json);
  assert.deepEqual(stored.elements.map((element) => element.id), ['legacy-brand','legacy-entity','legacy-weather','legacy-announcement']);
  assert.equal(stored.elements.some((element) => element.type === 'weather'), true);
  assert.equal(JSON.stringify(stored).includes('aquarium'), false);
  await pool.end();
});
