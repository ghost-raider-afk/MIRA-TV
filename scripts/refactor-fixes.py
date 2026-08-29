#!/usr/bin/env python3
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]

p = ROOT/'src/web/admin-ui/public/js/application.js'
t = p.read_text()
t = re.sub(r"\n\s*case 'sftp-settings': \{\n\s*const \{ initialiseSftpSettings \} = await import\('./pages/sftp-settings\.js'\);\n\s*return initialiseSftpSettings\(\);\n\s*}\n", '\n', t)
p.write_text(t)

p = ROOT/'src/web/admin-ui/public/js/core/navigation.js'
t = p.read_text()
t = re.sub(r"\n\s*Object\.freeze\(\{ path: '/sftp-settings'.*?\}\),", '', t)
t = t.replace("['Настройки сайта', '/settings'], ['SFTP', '/sftp-settings'], ['Журнал событий', '/events'], ['Профиль', '/profile']", "['Настройки сайта', '/settings'], ['Журнал событий', '/events'], ['Профиль', '/profile']")
p.write_text(t)

# Remove obsolete SFTP-specific event categorization without damaging syntax.
p = ROOT/'src/db/notifications.js'
if p.exists():
    t=p.read_text()
    t=re.sub(r"\n\s*if \(source\.startsWith\('sftp\.'\)\) return 'sftp';", '', t)
    p.write_text(t)

# Remove residual SFTP fields from location repositories/contracts and UI by whole-line filtering only where safe.
for rel in ['src/db/locations.js','src/api/locations/routes.js','src/web/admin-ui/public/js/pages/locations.js','src/web/admin-ui/public/locations.html']:
    p=ROOT/rel
    if not p.exists(): continue
    lines=[]
    for line in p.read_text().splitlines():
        low=line.lower()
        if any(x in low for x in ['sftp_directory','sftp_username','sftp_password','sftp-settings','sftp_directory_id']):
            continue
        lines.append(line)
    p.write_text('\n'.join(lines)+'\n')

print('refactor cleanup fixes applied')
