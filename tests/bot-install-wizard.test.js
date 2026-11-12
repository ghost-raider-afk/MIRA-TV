import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const WIZARD = resolve('scripts/configure-bot.sh');
const TELEGRAM_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn0123456789';
const MAX_TOKEN = 'ABCdef12345678901234567890testMAXToken';

function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'mira-bot-wizard-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const app=join(root,'install'),persist=join(root,'persist'),bin=join(root,'bin');
  mkdirSync(app);mkdirSync(bin);
  writeFileSync(join(app,'.env'),'MIRA_TV_DOMAIN=menu.example.com\nCOMPOSE_FILE=compose.yaml:compose.traefik.yaml\n');
  writeFileSync(join(app,'.env.bot.example'),readFileSync('.env.bot.example'));
  const stub=join(bin,'docker'),dockerLog=join(root,'docker.log');
  writeFileSync(stub,[
    '#!/bin/sh',
    'case "$1:$2" in',
    '  network:inspect) exit 1 ;;',
    '  network:create) printf "%s\\n" "$*" >> "$BOT_DOCKER_TEST_LOG"; exit 0 ;;',
    '  *) exit 20 ;;',
    'esac',''
  ].join('\n'));
  chmodSync(stub,0o700);
  function run(lines) {
    return spawnSync('bash',[WIZARD,app,persist],{
      input:lines.join('\n')+'\n',encoding:'utf8',timeout:7000,
      env:{...process.env,PATH:bin+':'+process.env.PATH,BOT_DOCKER_TEST_LOG:dockerLog}
    });
  }
  return {app,persist,dockerLog,run};
}
function envAt(file){
  return Object.fromEntries(readFileSync(file,'utf8').split(/\r?\n/)
    .filter(s=>/^[A-Z_]+=/.test(s))
    .map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
}

test('wizard and common installer are syntactically valid Bash',()=>{
  for(const file of ['scripts/configure-bot.sh','mira-tv.sh']){
    const r=spawnSync('bash',['-n',file],{encoding:'utf8'});
    assert.equal(r.status,0,file+': '+r.stderr);
  }
});

test('Telegram-only wizard writes private configuration, MAX stays disabled, no service starts',t=>{
  const f=fixture(t);
  const r=f.run(['bot.example.com','',TELEGRAM_TOKEN,'901234567','n','y']);
  assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
  assert.ok(!r.stdout.includes(TELEGRAM_TOKEN));
  const env=envAt(join(f.app,'.env.bot'));
  assert.equal(env.BOT_DOMAIN,'bot.example.com');
  assert.equal(env.BOT_DOCKER_NETWORK,'mira-tv-bot');
  assert.equal(env.BOT_PORT,'8090');
  assert.equal(env.TELEGRAM_BOT_TOKEN,TELEGRAM_TOKEN);
  assert.equal(env.TELEGRAM_ADMIN_ID,'901234567');
  assert.equal(env.MAX_BOT_ENABLED,'false');
  assert.equal(env.MAX_BOT_TOKEN,'');
  assert.equal(env.MAX_ADMIN_ID,'');
  assert.equal(env.MAX_WEBHOOK_SECRET,'');
  assert.match(env.TELEGRAM_WEBHOOK_SECRET,/^[a-f0-9]{64}$/);
  assert.match(env.BOT_INTERNAL_API_TOKEN,/^[a-f0-9]{64}$/);
  assert.equal(env.BOT_OFFLINE_CONFIRM_SECONDS,'120');
  assert.equal(env.BOT_NOTIFY_RECOVERY,'true');
  assert.equal(env.BOT_SUPPRESS_DUPLICATES,'true');
  assert.equal(statSync(join(f.app,'.env.bot')).mode&0o777,0o600);
  assert.equal(statSync(join(f.persist,'bot.env')).mode&0o777,0o600);
  assert.deepEqual(envAt(join(f.persist,'bot.env')),env);
  assert.match(readFileSync(f.dockerLog,'utf8'),/network create --driver bridge mira-tv-bot/);
});

test('repeat wizard preserves secrets while adding an optional MAX bot',t=>{
  const f=fixture(t);
  const first=f.run(['bot.example.com','',TELEGRAM_TOKEN,'901234567','n','y']);
  assert.equal(first.status,0,first.stderr);
  const old=envAt(join(f.app,'.env.bot'));
  const again=f.run(['','','','','y',MAX_TOKEN,'800222333','mira_tv_bot','y']);
  assert.equal(again.status,0,again.stderr+'\n'+again.stdout);
  assert.ok(!again.stdout.includes(MAX_TOKEN));
  const env=envAt(join(f.app,'.env.bot'));
  assert.equal(env.TELEGRAM_BOT_TOKEN,old.TELEGRAM_BOT_TOKEN);
  assert.equal(env.TELEGRAM_WEBHOOK_SECRET,old.TELEGRAM_WEBHOOK_SECRET);
  assert.equal(env.BOT_INTERNAL_API_TOKEN,old.BOT_INTERNAL_API_TOKEN);
  assert.equal(env.MAX_BOT_ENABLED,'true');
  assert.equal(env.MAX_BOT_TOKEN,MAX_TOKEN);
  assert.equal(env.MAX_ADMIN_ID,'800222333');
  assert.equal(env.MAX_BOT_USERNAME,'mira_tv_bot');
  assert.match(env.MAX_WEBHOOK_SECRET,/^[a-f0-9]{64}$/);
  assert.notEqual(env.MAX_WEBHOOK_SECRET,env.TELEGRAM_WEBHOOK_SECRET);
});

test('wrong bot hostname or nonnumeric administrator ID never writes secrets',t=>{
  const f=fixture(t);
  assert.notEqual(f.run(['menu.example.com']).status,0);
  assert.throws(()=>readFileSync(join(f.app,'.env.bot')));
  assert.notEqual(f.run(['bot.example.com','',TELEGRAM_TOKEN,'@admin']).status,0);
  assert.throws(()=>readFileSync(join(f.app,'.env.bot')));
});

test('main installer preserves bot secrets through backup/rollback/removal',()=>{
  const s=readFileSync('mira-tv.sh','utf8');
  assert.match(s,/install -m 0600 "\$\{INSTALL_DIR\}\/\.env\.bot"/);
  assert.match(s,/--exclude='\.\/\.env\.bot'/);
  assert.match(s,/! -name '\.env\.bot'/);
  assert.match(s,/"\$TEMP_BACKUP_DIR\/bot\.env"/);
  assert.match(s,/persist_env; compose down --remove-orphans/);
  assert.match(s,/10\) Настроить Telegram\/MAX-бот/);
});

test('bot network does not expose service ports or the database',()=>{
  const compose=readFileSync('compose.bot.yaml','utf8');
  const template=readFileSync('.env.bot.example','utf8');
  assert.match(compose,/profiles: \[bot\]/);
  assert.match(compose,/env_file: \[\.env\.bot\]/);
  assert.match(compose,/external: true/);
  assert.match(compose,/BOT_DOCKER_NETWORK/);
  assert.doesNotMatch(compose,/mira-tv-internal|5432:5432|8090:8090/);
  for(const name of ['BOT_DOMAIN','TELEGRAM_BOT_TOKEN','TELEGRAM_ADMIN_ID',
    'TELEGRAM_WEBHOOK_SECRET','MAX_BOT_TOKEN','MAX_ADMIN_ID','MAX_WEBHOOK_SECRET',
    'BOT_INTERNAL_API_TOKEN','BOT_DOCKER_NETWORK']) {
    assert.match(template,new RegExp('^'+name+'=','m'));
  }
  assert.match(readFileSync('.gitignore','utf8'),/^\.env\.bot$/m);
});
