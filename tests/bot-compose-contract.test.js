import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('bot installer syntax, secrets and independent Docker topology',async()=>{
  const [wizard,main,overlay,dockerfile,proxy] = await Promise.all([
    readFile('scripts/configure-bot.sh','utf8'),
    readFile('compose.yaml','utf8'),
    readFile('compose.bot.yaml','utf8'),
    readFile('Dockerfile.bot','utf8'),
    readFile('mira-tv.sh','utf8')
  ]);
  assert.equal(spawnSync('bash',['-n','scripts/configure-bot.sh']).status,0);
  assert.match(wizard,/umask 077/);
  assert.match(wizard,/mktemp/);
  assert.match(wizard,/chmod 600/);
  assert.match(wizard,/BOT_OFFLINE_CONFIRM_SECONDS 120/);
  assert.match(wizard,/BOT_SUPPRESS_DUPLICATES true/);
  assert.match(wizard,/install -m 600 "\$BOT_ENV" "\$PERSIST_DIR\/bot.env"/);
  assert.match(main,/--providers.file.directory=\/dynamic/);
  assert.match(overlay,/mira-tv-bot:/);
  assert.match(overlay,/env_file: \[\.env, \.env\.bot\]/);
  assert.match(overlay,/TELEGRAM_BOT_TOKEN: ""/);
  assert.match(overlay,/MAX_BOT_TOKEN: ""/);
  assert.match(overlay,/TELEGRAM_WEBHOOK_SECRET: ""/);
  assert.match(overlay,/MAX_WEBHOOK_SECRET: ""/);
  assert.match(overlay,/BOT_DOMAIN/);
  assert.match(overlay,/bot-proxy-config-init:/);
  assert.doesNotMatch(overlay,/\bports:/);
  const botService = overlay.match(/\n  bot:\n([\s\S]*?)(?=\nnetworks:)/)?.[1] ?? '';
  assert.match(botService,/networks: \[mira-tv-bot\]/);
  assert.doesNotMatch(botService,/mira-tv-internal/,
    'only app retains the internal DB network; the bot must not join it');
  assert.match(dockerfile,/USER node/);
  assert.match(dockerfile,/HEALTHCHECK/);
  assert.match(proxy,/9\) Настроить Telegram\/MAX-бота/);
  assert.match(proxy,/bot\) configure_bot/);
});
