import { normaliseRow } from './helpers.js';

function normaliseBakedScene(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  return {
    ...value,
    screen_id: Number(value.screen_id),
    source_render_revision: Number(value.source_render_revision),
    width: Number(value.width),
    height: Number(value.height),
    fps: Number(value.fps),
    duration_ms: Number(value.duration_ms)
  };
}

export function createBakedScenesRepository(pool) {
  return Object.freeze({
    async getBakedScene(screenId) {
      const { rows } = await pool.query(
        'SELECT * FROM screen_baked_scenes WHERE screen_id = $1',
        [screenId]
      );
      return normaliseBakedScene(rows[0]);
    },

    async findBakedSceneByInputHash(inputHash) {
      const { rows } = await pool.query(
        `SELECT * FROM screen_baked_scenes
          WHERE input_hash = $1
          ORDER BY updated_at DESC
          LIMIT 1`,
        [String(inputHash || '')]
      );
      return normaliseBakedScene(rows[0]);
    },

    async activateBakedScene({
      screenId,
      sourceRenderRevision,
      inputHash,
      activeUrl,
      activeHash,
      width,
      height,
      fps,
      durationMs,
      agentVersion = '',
      updatedBy = ''
    }) {
      const { rows } = await pool.query(
        `INSERT INTO screen_baked_scenes (
           screen_id, source_render_revision, input_hash,
           active_url, active_hash, previous_url, previous_hash,
           width, height, fps, duration_ms, agent_version, updated_by, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,'','',$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (screen_id) DO UPDATE SET
           previous_url = CASE
             WHEN screen_baked_scenes.active_url = EXCLUDED.active_url THEN screen_baked_scenes.previous_url
             ELSE screen_baked_scenes.active_url
           END,
           previous_hash = CASE
             WHEN screen_baked_scenes.active_url = EXCLUDED.active_url THEN screen_baked_scenes.previous_hash
             ELSE screen_baked_scenes.active_hash
           END,
           source_render_revision = EXCLUDED.source_render_revision,
           input_hash = EXCLUDED.input_hash,
           active_url = EXCLUDED.active_url,
           active_hash = EXCLUDED.active_hash,
           width = EXCLUDED.width,
           height = EXCLUDED.height,
           fps = EXCLUDED.fps,
           duration_ms = EXCLUDED.duration_ms,
           agent_version = EXCLUDED.agent_version,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING *`,
        [
          screenId,
          sourceRenderRevision,
          String(inputHash || ''),
          String(activeUrl || ''),
          String(activeHash || ''),
          width,
          height,
          fps,
          durationMs,
          String(agentVersion || '').slice(0, 80),
          String(updatedBy || '').slice(0, 120)
        ]
      );
      return normaliseBakedScene(rows[0]);
    },

    async isBakedSceneAssetReferenced(url) {
      if (!url) return false;
      const { rowCount } = await pool.query(
        `SELECT 1 FROM screen_baked_scenes
          WHERE active_url = $1 OR previous_url = $1
          LIMIT 1`,
        [url]
      );
      return rowCount > 0;
    },

    async listBakedSceneAssetReferences() {
      const { rows } = await pool.query(
        `SELECT active_url, previous_url
           FROM screen_baked_scenes`
      );
      return [...new Set(rows.flatMap((row) => [row.active_url, row.previous_url]).filter(Boolean))];
    }
  });
}
