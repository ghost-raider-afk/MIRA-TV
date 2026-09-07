const PLAYER_COMPONENTS = new Set([
  'screen', 'menu', 'animation', 'environment', 'scene_playlist',
  'entity', 'brand', 'announcement', 'weather', 'runtime'
]);

function components(value) {
  const source = Array.isArray(value) ? value : [];
  const unique = [...new Set(source.map((item) => String(item || '').trim()).filter((item) => PLAYER_COMPONENTS.has(item)))];
  return unique.length ? unique : ['screen'];
}

function screenIds(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function parseComponents(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return components(parsed);
  } catch {
    return [];
  }
}

export function createScreenRenderJournalRepository(pool) {
  async function ensureScreenRenderState(screenId) {
    const id = Number(screenId);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    await pool.query(
      `INSERT INTO screen_render_state (screen_id, revision, updated_at)
       SELECT id, 1, NOW() FROM screens WHERE id = $1
       ON CONFLICT (screen_id) DO NOTHING`,
      [id]
    );
    const { rows } = await pool.query('SELECT revision FROM screen_render_state WHERE screen_id = $1', [id]);
    return rows[0] ? Number(rows[0].revision) : null;
  }

  async function markScreenRenderChanged(ids, changedComponents, reason = '', actor = 'system') {
    const result = [];
    const list = screenIds(ids);
    const componentList = components(changedComponents);
    const encoded = JSON.stringify(componentList);
    for (const screenId of list) {
      const { rows } = await pool.query(
        `INSERT INTO screen_render_state (screen_id, revision, updated_at)
         SELECT id, 2, NOW() FROM screens WHERE id = $1
         ON CONFLICT (screen_id) DO UPDATE SET
           revision = screen_render_state.revision + 1,
           updated_at = NOW()
         RETURNING revision`,
        [screenId]
      );
      if (!rows[0]) continue;
      const revision = Number(rows[0].revision);
      await pool.query(
        `INSERT INTO screen_render_events (screen_id, revision, components_json, reason, actor, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [screenId, revision, encoded, String(reason || '').slice(0, 120), String(actor || 'system').slice(0, 120)]
      );
      result.push({ screen_id: screenId, revision, components: componentList });
    }
    return result;
  }

  return Object.freeze({
    ensureScreenRenderState,
    async getScreenRenderRevision(screenId) {
      return ensureScreenRenderState(screenId);
    },
    markScreenRenderChanged,
    async listScreenRenderEvents(screenId, limit = 100) {
      const id = Number(screenId);
      const count = Math.max(1, Math.min(250, Number(limit) || 100));
      const { rows } = await pool.query(
        `SELECT id, screen_id, revision, components_json, reason, actor, created_at
           FROM screen_render_events
          WHERE screen_id = $1
          ORDER BY revision DESC
          LIMIT $2`,
        [id, count]
      );
      return rows.map((row) => ({
        id: Number(row.id),
        screen_id: Number(row.screen_id),
        revision: Number(row.revision),
        components: parseComponents(row.components_json),
        reason: row.reason || '',
        actor: row.actor || 'system',
        created_at: row.created_at
      }));
    },
    async pruneScreenRenderEvents(retentionDays = 30) {
      const days = Math.max(1, Math.min(365, Number(retentionDays) || 30));
      const { rowCount } = await pool.query(
        `DELETE FROM screen_render_events
          WHERE created_at < NOW() - ($1::text || ' days')::interval`,
        [days]
      );
      return rowCount || 0;
    }
  });
}
