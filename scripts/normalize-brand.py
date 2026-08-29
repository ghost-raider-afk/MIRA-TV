import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', 'node_modules', 'playwright-report', 'test-results'}
PATTERNS = (
    re.compile(r'\btv\s+me' + r'nu\b', re.IGNORECASE),
    re.compile(r'\bme' + r'nu\s+tv\b', re.IGNORECASE),
)

changed = []
for path in ROOT.rglob('*'):
    if not path.is_file() or any(part in EXCLUDED for part in path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    updated = text
    for pattern in PATTERNS:
        updated = pattern.sub('MIRA-TV', updated)
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        changed.append(path.relative_to(ROOT).as_posix())

for path in changed:
    print(path)
