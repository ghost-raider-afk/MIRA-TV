from pathlib import Path


def replace_one(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_one('package.json', '"version": "1.18.10"', '"version": "1.18.11"')
replace_one('package.json', '"miraVersion": "1.18.10"', '"miraVersion": "1.18.11"')
lock = Path('package-lock.json')
text = lock.read_text(encoding='utf-8')
if text.count('"version": "1.18.10"') < 2:
    raise SystemExit('package-lock release version markers not found')
lock.write_text(text.replace('"version": "1.18.10"', '"version": "1.18.11"', 2), encoding='utf-8')
replace_one('.env.example', 'MIRA_TV_VERSION=1.18.10', 'MIRA_TV_VERSION=1.18.11')
replace_one('mira-tv.sh', 'SCRIPT_VERSION="1.18.10"', 'SCRIPT_VERSION="1.18.11"')

player_path = 'src/web/admin-ui/public/js/player/player.js'
replace_one(player_path, "const PLAYER_BUILD_VERSION = '1.18.10';", "const PLAYER_BUILD_VERSION = '1.18.11';")
replace_one(
    player_path,
    "const registration = await navigator.serviceWorker.register('/player-sw.js', { scope: '/player' });",
    "const registration = await navigator.serviceWorker.register(`/player-sw.js?v=${encodeURIComponent(PLAYER_BUILD_VERSION)}`, { scope:'/player', updateViaCache:'none' });"
)
replace_one(
    player_path,
    "  const restored = await playerStateSync.restoreLastKnownGood();\n  playerStateSync.note('player.boot', { restored });",
    "  void registerOfflinePlayer();\n  const restored = await playerStateSync.restoreLastKnownGood();\n  playerStateSync.note('player.boot', { restored, build:PLAYER_BUILD_VERSION });"
)

sw_path = Path('src/web/admin-ui/public/player-sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v70';", "const RETIRED_SHELL_CACHE = 'mira-tv-player-shell-v71';", 1)
sw = sw.replace("const SHELL_CACHE = 'mira-tv-player-shell-v71';", "const SHELL_CACHE = 'mira-tv-player-shell-v72';", 1)
start = sw.index('const SHELL_ASSETS = [')
end = sw.index('\n];', start) + len('\n];')
block = sw[start:end]
paths = []
for line in block.splitlines()[1:]:
    value = line.strip().rstrip(',')
    if value.startswith("'") and value.endswith("'"):
        paths.append(value[1:-1])
if not paths:
    raise SystemExit('SHELL_ASSETS could not be parsed')
core = [p for p in paths if p in ('/player.html', '/player.webmanifest') or p.startswith('/css/') or p.startswith('/js/')]
optional = [p for p in paths if p not in core]

def js_list(name, values):
    return '\n'.join([f'const {name} = ['] + [f"  '{p}'," for p in values] + ['];'])

replacement = js_list('CORE_SHELL_ASSETS', core) + '\n' + js_list('OPTIONAL_SHELL_ASSETS', optional) + "\nconst SHELL_ASSETS = [...CORE_SHELL_ASSETS, ...OPTIONAL_SHELL_ASSETS];"
sw = sw[:start] + replacement + sw[end:]
old_install = """self.addEventListener('install', (event) => {\n  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));\n  self.skipWaiting();\n});"""
new_install = """async function cacheShellAsset(cache, path, required) {\n  try {\n    const request = new Request(path, { method:'GET', credentials:'same-origin', cache:'reload' });\n    const response = await fetch(request);\n    if (!response.ok) throw new Error(`Player shell asset unavailable: ${path} HTTP ${response.status}`);\n    await cache.put(path, response.clone());\n    return true;\n  } catch (error) {\n    if (required) throw error;\n    return false;\n  }\n}\n\nself.addEventListener('install', (event) => {\n  event.waitUntil((async () => {\n    const cache = await caches.open(SHELL_CACHE);\n    await Promise.all(CORE_SHELL_ASSETS.map((path) => cacheShellAsset(cache, path, true)));\n    await Promise.all(OPTIONAL_SHELL_ASSETS.map((path) => cacheShellAsset(cache, path, false)));\n    await self.skipWaiting();\n  })());\n});"""
if old_install not in sw:
    raise SystemExit('old SW install block not found')
sw_path.write_text(sw.replace(old_install, new_install, 1), encoding='utf-8')

replace_one(
    'src/web/admin-ui/public/js/player/player-preview-capture.js',
    '  if (!await inlineStaticAssets(stage, clone)) return null;',
    '  await inlineStaticAssets(stage, clone);'
)

test_path = Path('tests/player-shell-upgrade.test.js')
t = test_path.read_text(encoding='utf-8')
t = t.replace("'mira-tv-player-shell-v70',\n    'mira-tv-player-shell-v71',", "'mira-tv-player-shell-v71',\n    'mira-tv-player-shell-v72',", 1)
t = t.replace("'mira-tv-player-shell-v71',\n    'mira-tv-player-data-v18'", "'mira-tv-player-shell-v72',\n    'mira-tv-player-data-v18'", 2)
test_path.write_text(t, encoding='utf-8')

regress = Path('tests/player-bugfix-regressions.test.js')
r = regress.read_text(encoding='utf-8')
extra = r'''

test('Player registers the update worker before LKG restore and bypasses HTTP script cache', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player.js', import.meta.url), 'utf8');
  assert.match(source, /register\(`\/player-sw\.js\?v=\$\{encodeURIComponent\(PLAYER_BUILD_VERSION\)\}`,[^\n]*updateViaCache:'none'/);
  assert.ok(source.indexOf('void registerOfflinePlayer();') < source.indexOf('restoreLastKnownGood()'));
  assert.match(source, /player\.boot', \{ restored, build:PLAYER_BUILD_VERSION \}/);
});

test('Player shell activation is not blocked by optional theme or font assets', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/player-sw.js', import.meta.url), 'utf8');
  assert.match(source, /const CORE_SHELL_ASSETS = \[/);
  assert.match(source, /const OPTIONAL_SHELL_ASSETS = \[/);
  assert.match(source, /CORE_SHELL_ASSETS\.map\(\(path\) => cacheShellAsset\(cache, path, true\)\)/);
  assert.match(source, /OPTIONAL_SHELL_ASSETS\.map\(\(path\) => cacheShellAsset\(cache, path, false\)\)/);
  assert.match(source, /if \(required\) throw error;/);
  assert.doesNotMatch(source, /cache\.addAll\(SHELL_ASSETS\)/);
});

test('TV snapshot remains fresh when one visual asset cannot be inlined', async () => {
  const source = await readFile(new URL('../src/web/admin-ui/public/js/player/player-preview-capture.js', import.meta.url), 'utf8');
  assert.match(source, /await inlineStaticAssets\(stage, clone\);/);
  assert.doesNotMatch(source, /if \(!await inlineStaticAssets\(stage, clone\)\) return null;/);
});
'''
if 'Player registers the update worker before LKG restore' not in r:
    r += extra
regress.write_text(r, encoding='utf-8')

Path('docs/releases/1.18.11.md').write_text('''# MIRA-TV 1.18.11\n\nEmergency Player recovery hotfix for production TVs stuck on an old cached renderer.\n\n- Restores deterministic Player Service Worker registration before Last Known Good restore.\n- Uses a versioned Service Worker URL with `updateViaCache: none` for future releases.\n- Advances Offline Player shell to v72 and makes fonts/theme artwork best-effort during install, so one optional asset cannot block updated Player JavaScript.\n- Keeps Local-first ACTIVE/PREVIOUS state and atomic required scene assets unchanged.\n- Restores truthful TV Network snapshots: a broken individual visual asset no longer prevents publication of the current TV frame.\n- Adds Player build to boot telemetry for field diagnosis.\n- No API, PostgreSQL schema, Docker volume, binding, or scene compatibility changes.\n''', encoding='utf-8')
