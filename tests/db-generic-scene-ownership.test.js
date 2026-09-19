import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=(p)=>readFile(new URL(p,root),'utf8');

test('runtime store no longer exposes a separate weather repository', async()=>{
  const index=await read('src/db/index.js');
  assert.doesNotMatch(index,/createWeatherRepository|\.\/weather\.js/);
  assert.match(index,/023-scene-ownership-cleanup/);
});
