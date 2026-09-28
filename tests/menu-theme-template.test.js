import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { constructorThemeTemplateInput } from '../src/contracts/theme-template.js';
import { migrateMenuThemeTemplates } from '../src/db/migrations/menu-theme-templates.js';
import { createMenuThemeTemplatesRepository } from '../src/db/menu-theme-templates.js';
import { createScreensRepository } from '../src/db/screens.js';

const ASSET_A='/site-assets/content/asset-'+'a'.repeat(64)+'.webp';
const ASSET_B='/site-assets/content/asset-'+'b'.repeat(64)+'.png';

test('constructor template normalizes to Theme Constructor and preserves generic scene elements', () => {
  const input=constructorThemeTemplateInput({
    name:'  Моя тема  ',
    settings:{background_color:'#101828',theme:{preset_id:'premium'}},
    scene:{
      version:1,
      elements:[{
        id:'text-1',type:'text',x:10,y:20,width:500,height:100,
        text:{runs:[{value:'Своя тема'}]}
      }]
    }
  });
  assert.equal(input.name,'Моя тема');
  assert.equal(input.settings.theme.preset_id,'legacy');
  assert.equal(input.scene.elements[0].type,'text');
  assert.throws(()=>constructorThemeTemplateInput({name:'',settings:{},scene:{version:1,elements:[]}}),/название/i);
});

test('named constructor templates persist with stable id and editable name', async () => {
  const memory=newDb();
  const {Pool}=memory.adapters.createPg();
  const pool=new Pool();
  await migrateMenuThemeTemplates(pool);
  const repo=createMenuThemeTemplatesRepository(pool);

  const created=await repo.createMenuThemeTemplate({
    name:'Основная',
    settings:{theme:{preset_id:'legacy'}},
    scene:{version:1,elements:[]},
    username:'admin'
  });
  assert.ok(created.id>0);
  assert.equal(created.name,'Основная');

  const updated=await repo.updateMenuThemeTemplate(created.id,{
    name:'Основная 2',
    settings:{theme:{preset_id:'legacy'},background_color:'#111111'},
    scene:{version:1,elements:[]},
    username:'admin'
  });
  assert.equal(updated.id,created.id);
  assert.equal(updated.name,'Основная 2');
  assert.equal((await repo.listMenuThemeTemplates()).length,1);
  await pool.end();
});

test('content assets referenced by nested preset data or saved constructor themes stay owned', async () => {
  const memory=newDb();
  const {Pool}=memory.adapters.createPg();
  const pool=new Pool();
  await pool.query(`
    CREATE TABLE screen_drafts (
      screen_id BIGINT PRIMARY KEY,
      settings_json TEXT NOT NULL DEFAULT '{}',
      scene_json TEXT NOT NULL DEFAULT '{"version":1,"elements":[]}'
    );
  `);
  await migrateMenuThemeTemplates(pool);
  await pool.query('INSERT INTO screen_drafts(screen_id,settings_json,scene_json) VALUES (1,$1,$2)',[
    JSON.stringify({theme:{decor:{source_url:ASSET_A}}}),
    JSON.stringify({version:1,elements:[]})
  ]);
  await pool.query(
    'INSERT INTO menu_theme_templates(name,settings_json,scene_json) VALUES ($1,$2,$3)',
    ['Сохранённая',JSON.stringify({background_image_url:ASSET_B}),JSON.stringify({version:1,elements:[]})]
  );

  const repo=createScreensRepository(pool);
  assert.equal(await repo.isContentAssetReferenced(ASSET_A),true);
  assert.equal(await repo.isContentAssetReferenced(ASSET_B),true);
  assert.deepEqual(new Set(await repo.listContentAssetReferences()),new Set([ASSET_A,ASSET_B]));
  await pool.end();
});
