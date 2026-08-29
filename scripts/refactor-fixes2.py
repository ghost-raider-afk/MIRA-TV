#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

p=ROOT/'src/web/admin-ui/public/js/application.js'
t=p.read_text()
t=re.sub(r"\n\s*case 'sftp-settings': \{\s*\}\n", '\n', t)
p.write_text(t)

(ROOT/'src/db/locations.js').write_text('''import { isoNow, normaliseRow } from './helpers.js';\n\nexport function createLocationsRepository(pool) {\n  async function withScreenCount(row) {\n    const location = normaliseRow(row);\n    if (!location) return null;\n    const { rows } = await pool.query('SELECT COUNT(*)::int AS screen_count FROM screens WHERE location_id = $1', [location.id]);\n    return { ...location, screen_count: Number(rows[0].screen_count) };\n  }\n\n  async function getLocation(id) {\n    const { rows } = await pool.query('SELECT * FROM locations WHERE id = $1', [id]);\n    return withScreenCount(rows[0]);\n  }\n\n  return Object.freeze({\n    async listLocations() {\n      const { rows } = await pool.query('SELECT * FROM locations ORDER BY name');\n      return Promise.all(rows.map(withScreenCount));\n    },\n    getLocation,\n    async createLocation({ name, address = '', active = true }) {\n      const now = isoNow();\n      const { rows } = await pool.query(\n        'INSERT INTO locations (name, address, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id',\n        [name, address, active, now]\n      );\n      return getLocation(rows[0].id);\n    },\n    async updateLocation(id, { name, address = '', active = true }) {\n      const { rowCount } = await pool.query(\n        'UPDATE locations SET name = $1, address = $2, active = $3, updated_at = $4 WHERE id = $5',\n        [name, address, active, isoNow(), id]\n      );\n      return rowCount ? getLocation(id) : null;\n    },\n    async deleteLocation(id) {\n      const { rowCount } = await pool.query('DELETE FROM locations WHERE id = $1', [id]);\n      return rowCount > 0;\n    }\n  });\n}\n''')

p=ROOT/'src/api/locations/routes.js'
t=p.read_text()
t=re.sub(r"\n\s*if \(location\.sftp_directory_id\).*?;", '', t)
p.write_text(t)

p=ROOT/'src/web/admin-ui/public/js/pages/locations.js'
t=p.read_text()
t=re.sub(r"`\$\{location\.address \|\| 'Адрес не указан'\} · мониторов: \$\{location\.screen_count\} · \$\{location\.sftp_directory_name \? `SFTP: \$\{location\.sftp_directory_name\} \(\$\{location\.sftp_username\}\)` : 'SFTP не настроен'\}`", "`${location.address || 'Адрес не указан'} · мониторов: ${location.screen_count}`", t)
p.write_text(t)

print('structural cleanup fixes applied')
