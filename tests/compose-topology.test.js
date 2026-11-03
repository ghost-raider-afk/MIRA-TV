import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const core = load('compose.yaml');
const traefik = load('compose.traefik.yaml');
const caddy = load('compose.caddy.yaml');
const bot = load('compose.bot.yaml');
const installer = load('mira-tv.sh');

test('core Compose isolates the DB and does not bundle the reverse proxy', () => {
  assert.match(core, /container_name: mira-tv-db\b/);
  assert.match(core, /container_name: mira-tv\b/);
  assert.doesNotMatch(core, /^  proxy:$/m);
  assert.doesNotMatch(core, /^  proxy-config-init:$/m);
  assert.match(core, /external: true/);
  assert.match(core, /internal: true/);
  assert.doesNotMatch(core, /5432:5432|8080:8080/);
});

test('either proxy sends HTTP and WebSocket to the same internal app:8080', () => {
  assert.match(traefik, /http:\/\/app:8080/);
  assert.match(traefik, /mira-tv-letsencrypt/);
  assert.match(caddy, /caddy:2\./);
  assert.match(caddy, /mira-tv-caddy-data/);
  assert.match(load('deploy/caddy/Caddyfile'), /reverse_proxy app:8080/);
  for (const source of [traefik, caddy]) {
    assert.match(source, /"80:80"/);
    assert.match(source, /"443:443"/);
    assert.doesNotMatch(source, /5432:5432|8080:8080/);
  }
});

test('bot has no release runtime and remains isolated and inactive', () => {
  assert.match(bot, /profiles: \[bot\]/);
  assert.match(bot, /"8090"/);
  assert.match(bot, /http:\/\/app:8080/);
  assert.match(installer, /install_bot_app/);
  assert.match(installer, /ещё не реализован/);
  assert.doesNotMatch(load('.env.example'), /compose\.bot\.yaml/);
});

test('installer chooses one proxy and provides persistent network bootstrap', () => {
  assert.match(load('.env.example'), /^COMPOSE_FILE=compose\.yaml:compose\.traefik\.yaml$/m);
  assert.match(installer, /choose_proxy_overlay/);
  assert.match(installer, /set_proxy_overlay/);
  assert.match(installer, /ensure_proxy_network/);
  assert.match(installer, /configure_proxy_app/);
});

test('explicit purge clears TLS storage of either selectable proxy', () => {
  for (const volume of ['mira-tv-letsencrypt', 'mira-tv-proxy-config', 'mira-tv-caddy-data', 'mira-tv-caddy-config']) {
    assert.ok(installer.includes(volume), volume);
  }
  assert.match(installer, /docker volume rm "\$volume"/);
});
