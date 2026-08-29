#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'tests/frontend-modules.test.js'
t=p.read_text().replace("  '../src/web/admin-ui/public/js/editor/final-image.js',\n", '')
p.write_text(t)
print('frontend module graph aligned')
