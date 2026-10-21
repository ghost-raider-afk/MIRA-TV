import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../src/web/admin-ui/public/',import.meta.url);
async function load(path) { return readFile(new URL(path,root),'utf8'); }

test('manager locations id is unique and the shared navigation has exactly three tabs',async()=>{
  const html=await load('manager.html');
  assert.equal([...html.matchAll(/id="manager-locations"/g)].length,1);
  assert.match(html,/class="manager-locations" id="manager-locations"/);
  const navigation=await load('js/core/navigation.js');
  const routes=navigation.slice(
    navigation.indexOf('export const MANAGER_PRIMARY_ROUTES'),
    navigation.indexOf('export const DESKTOP_PRIMARY_ROUTES')
  );
  assert.match(routes,/label:'Торговые точки'/);
  assert.match(routes,/label:'Каталог'/);
  assert.match(routes,/label:'Мои заявки'/);
  assert.equal([...routes.matchAll(/\bkey:'/g)].length,3);
});

test('request card has one centered uppercase topic and preserves approved journal columns',async()=>{
  const admin=await load('approvals.html');
  const manager=await load('manager.html');
  for (const html of [admin,manager]) assert.match(html,/class="crm-request-title" id="(?:catalog-approval-title|manager-request-title)"/);
  const styles=await load('css/pages/requests.css');
  assert.match(styles,/\.crm-request-title\s*\{[^}]*text-align:center/);
  assert.match(styles,/\.crm-request-title\s*\{[^}]*text-transform:uppercase/);
  const presentation=await load('js/core/requests.js');
  const columns=['№','Дата создания','Тема','Статус','Дата'];
  for(const name of columns)assert.ok(presentation.includes(name),'Missing journal column '+name);
});
