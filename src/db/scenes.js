function parseSceneJson(value) {
  if (value && typeof value === 'object') return structuredClone(value);
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value); }
  catch { return {}; }
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
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
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at)
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
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at)
  };
}

function revisionRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    scene_id: row.scene_id,
    scene_name: row.scene_name || '',
    revision_number: Number(row.revision_number) || 1,
    schema_version: Number(row.schema_version) || 1,
    published_by: row.published_by || '',
    published_at: iso(row.published_at),
    scene: parseSceneJson(row.scene_json)
  };
}

function revisionSummary(row) {
  if (!row) return null;
  const scene = parseSceneJson(row.scene_json);
  return {
    id: row.id,
    scene_id: row.scene_id,
    scene_name: row.scene_name || '',
    revision_number: Number(row.revision_number) || 1,
    schema_version: Number(row.schema_version) || 1,
    display_count: Number(scene.display_count) || 1,
    slide_count: Array.isArray(scene.slides) ? scene.slides.length : 0,
    published_by: row.published_by || '',
    published_at: iso(row.published_at)
  };
}

function assignmentRecord(row) {
  if (!row) return null;
  return {
    screen_id: Number(row.screen_id),
    scene_revision_id: row.scene_revision_id,
    scene_id: row.scene_id,
    scene_name: row.scene_name || '',
    revision_number: Number(row.revision_number) || 1,
    assigned_by: row.assigned_by || '',
    assigned_at: iso(row.assigned_at),
    published_at: iso(row.published_at)
  };
}

const REVISION_SELECT = `
  SELECT r.id, r.scene_id, s.name AS scene_name, r.revision_number, r.schema_version,
         r.scene_json, r.published_by, r.published_at
  FROM scene_revisions r
  JOIN scenes s ON s.id = r.scene_id`;

const ASSIGNMENT_SELECT = `
  SELECT a.screen_id, a.scene_revision_id, a.assigned_by, a.assigned_at,
         r.scene_id, r.revision_number, r.published_at, s.name AS scene_name
  FROM screen_scene_assignments a
  JOIN scene_revisions r ON r.id = a.scene_revision_id
  JOIN scenes s ON s.id = r.scene_id`;

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

    async lockScene(id) {
      const result = await queryable.query('SELECT id, name, schema_version, scene_json, revision, created_at, updated_at FROM scenes WHERE id = $1 FOR UPDATE', [id]);
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
    },

    async nextSceneRevisionNumber(sceneId) {
      const result = await queryable.query(
        'SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision FROM scene_revisions WHERE scene_id = $1',
        [sceneId]
      );
      return Number(result.rows[0]?.next_revision) || 1;
    },

    async createSceneRevision({ id, sceneId, revisionNumber, scene, actor, now }) {
      const result = await queryable.query(
        `INSERT INTO scene_revisions (id, scene_id, revision_number, schema_version, scene_json, published_by, published_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING id, scene_id, revision_number, schema_version, scene_json, published_by, published_at`,
        [id, sceneId, revisionNumber, scene.schema_version, JSON.stringify(scene), actor || '', now]
      );
      const row = result.rows[0];
      return row ? revisionRecord({ ...row, scene_name: scene.name }) : null;
    },

    async listSceneRevisions() {
      const result = await queryable.query(`${REVISION_SELECT} ORDER BY s.name ASC, r.revision_number DESC`);
      return result.rows.map(revisionSummary);
    },

    async getSceneRevision(id) {
      const result = await queryable.query(`${REVISION_SELECT} WHERE r.id = $1`, [id]);
      return revisionRecord(result.rows[0]);
    },

    async listScreenSceneAssignments() {
      const result = await queryable.query(`${ASSIGNMENT_SELECT} ORDER BY a.screen_id ASC`);
      return result.rows.map(assignmentRecord);
    },

    async getScreenSceneAssignment(screenId) {
      const result = await queryable.query(`${ASSIGNMENT_SELECT} WHERE a.screen_id = $1`, [screenId]);
      return assignmentRecord(result.rows[0]);
    },

    async assignScreenSceneRevision(screenId, sceneRevisionId, actor, now) {
      const result = await queryable.query(
        `INSERT INTO screen_scene_assignments (screen_id, scene_revision_id, assigned_by, assigned_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (screen_id) DO UPDATE SET
           scene_revision_id = EXCLUDED.scene_revision_id,
           assigned_by = EXCLUDED.assigned_by,
           assigned_at = EXCLUDED.assigned_at
         RETURNING screen_id`,
        [screenId, sceneRevisionId, actor || '', now]
      );
      if (!result.rows[0]) return null;
      return this.getScreenSceneAssignment(screenId);
    },

    async clearScreenSceneAssignment(screenId) {
      const result = await queryable.query('DELETE FROM screen_scene_assignments WHERE screen_id = $1 RETURNING screen_id', [screenId]);
      return result.rows[0] ? Number(result.rows[0].screen_id) : null;
    }
  };
}
