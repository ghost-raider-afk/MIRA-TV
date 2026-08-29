function parseSceneJson(value) {
  if (value && typeof value === 'object') return structuredClone(value);
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value); }
  catch { return {}; }
}

function sceneRecord(row) {
  if (!row) return null;
  const scene = parseSceneJson(row.scene_json);
  return {
    ...scene,
    id: row.id,
    name: row.name,
    schema_version: Number(row.schema_version) || 1,
    server_revision: Number(row.revision) || 1,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function sceneSummary(row) {
  const scene = parseSceneJson(row.scene_json);
  return {
    id: row.id,
    name: row.name,
    schema_version: Number(row.schema_version) || 1,
    server_revision: Number(row.revision) || 1,
    display_count: Number(scene.display_count) || 1,
    canvas_width: Number(scene.canvas_width) || 1920,
    canvas_height: Number(scene.canvas_height) || 1080,
    slide_count: Array.isArray(scene.slides) ? scene.slides.length : 0,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

export function createScenesRepository(queryable) {
  return {
    async listScenes() {
      const result = await queryable.query('SELECT id, name, schema_version, scene_json, revision, created_at, updated_at FROM scenes ORDER BY updated_at DESC, id ASC');
      return result.rows.map(sceneSummary);
    },

    async getScene(id) {
      const result = await queryable.query('SELECT id, name, schema_version, scene_json, revision, created_at, updated_at FROM scenes WHERE id = $1', [id]);
      return sceneRecord(result.rows[0]);
    },

    async createSceneRecord({ id, scene, actor, now }) {
      const result = await queryable.query(
        `INSERT INTO scenes (id, name, schema_version, scene_json, revision, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, 1, $5, $5, $6, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, name, schema_version, scene_json, revision, created_at, updated_at`,
        [id, scene.name, scene.schema_version, JSON.stringify(scene), actor || '', now]
      );
      return sceneRecord(result.rows[0]);
    },

    async updateSceneRecord(id, scene, expectedRevision, actor, now) {
      const result = await queryable.query(
        `UPDATE scenes
         SET name = $2, schema_version = $3, scene_json = $4::jsonb, revision = revision + 1, updated_by = $5, updated_at = $6
         WHERE id = $1 AND revision = $7
         RETURNING id, name, schema_version, scene_json, revision, created_at, updated_at`,
        [id, scene.name, scene.schema_version, JSON.stringify(scene), actor || '', now, expectedRevision]
      );
      return sceneRecord(result.rows[0]);
    },

    async deleteSceneRecord(id) {
      const result = await queryable.query('DELETE FROM scenes WHERE id = $1 RETURNING id, name', [id]);
      return result.rows[0] || null;
    }
  };
}
