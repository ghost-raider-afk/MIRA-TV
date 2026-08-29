import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('release metadata and QR security defaults are synchronized', async () => {
  const [pkgText, lockText, env, installer, changelog] = await Promise.all([
    read('package.json'),
    read('package-lock.json'),
    read('.env.example'),
    read('menu-tv-2.sh'),
    read('CHANGELOG.md')
  ]);
  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(changelog, new RegExp(`## \\[${pkg.version.replaceAll('.', '\\.') }\\]`));
  assert.equal(pkg.dependencies.jsqr, '1.4.0');
  assert.match(env, /^DEVICE_ACTIVATION_TTL_MINUTES=2$/m);
  assert.match(installer, /^SCRIPT_VERSION="\d+\.\d+\.\d+"$/m);
  assert.match(installer, /env_value DEVICE_ACTIVATION_TTL_MINUTES "\$env_file"\)" == "10"/);
  assert.match(installer, /set_env_value "\$env_file" DEVICE_ACTIVATION_TTL_MINUTES "2"/);
});
