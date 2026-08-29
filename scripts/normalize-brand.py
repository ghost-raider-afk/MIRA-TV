from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', 'node_modules', 'playwright-report', 'test-results'}

legacy_variants = [
    'TV' + ' MENU',
    'TV' + ' Menu',
    'tv' + ' menu',
    'Me' + 'nu TV',
    'ME' + 'NU TV',
]

changed = []
for path in ROOT.rglob('*'):
    if not path.is_file() or any(part in EXCLUDED for part in path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    updated = text
    for value in legacy_variants:
        updated = updated.replace(value, 'MIRA-TV')
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        changed.append(path.relative_to(ROOT).as_posix())

for path in changed:
    print(path)
