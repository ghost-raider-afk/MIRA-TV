import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
function versionAtLeast(actual,minimum){
  const parts=(v)=>String(v).split('.').map(Number);
  const a=parts(actual),b=parts(minimum);
  return a[0]>b[0] || (a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>=b[2])));
}
test('locked Express body parser and qs exclude October 2026 DoS vulnerabilities',()=>{
  const parser=lock.packages['node_modules/body-parser'];
  const qs=lock.packages['node_modules/qs'];
  assert.ok(parser,'body-parser must remain locked');
  assert.ok(qs,'qs must remain locked');
  assert.ok(versionAtLeast(parser.version,'2.4.0'),'patched body-parser >= 2.4.0 required');
  assert.ok(versionAtLeast(qs.version,'6.16.1'),'patched qs >= 6.16.1 required');
  assert.ok(parser.dependencies.qs.startsWith('^6.16.1'));
});
