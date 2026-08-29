function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function assetRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    original_name: row.original_name || '',
    kind: row.kind,
    mime_type: row.mime_type,
    filename: row.filename,
    url: `/site-assets/media/${row.filename}`,
    size_bytes: Number(row.size_bytes) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    has_alpha: row.has_alpha === true,
    created_by: row.created_by || '',
    created_at: iso(row.created_at)
  };
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function sceneReferencesAsset(value, assetId) {
  const scene = parseJson(value);
  for (const slide of Array.isArray(scene?.slides) ? scene.slides : []) {
    for (const element of Array.isArray(slide?.elements) ? slide.elements : []) {
      if (String(element?.asset_id || '') === assetId) return true;
    }
    if (String(slide?.background?.asset_id || '') === assetId) return true;
  }
  return false;
}

export function createMediaAssetsRepository(queryable) {
  return {
    async listMediaAssets() {
      const result = await queryable.query('SELECT * FROM media_assets ORDER BY created_at DESC, id ASC');
      return result.rows.map(assetRecord);
    },

    async listMediaAssetsByIds(ids) {
      const unique = [...new Set((ids || []).map(String).filter(Boolean))];
      if (!unique.length) return [];
      const result = await queryable.query('SELECT * FROM media_assets WHERE id = ANY($1::text[]) ORDER BY created_at DESC, id ASC', [unique]);
      return result.rows.map(assetRecord);
    },

    async getMediaAsset(id) {
      const result = await queryable.query('SELECT * FROM media_assets WHERE id = $1', [id]);
      return assetRecord(result.rows[0]);
    },

    async createMediaAsset({ id, originalName, kind, mimeType, filename, sizeBytes, width, height, hasAlpha, actor, now }) {
      const result = await queryable.query(
        `INSERT INTO media_assets
          (id, original_name, kind, mime_type, filename, size_bytes, width, height, has_alpha, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [id, originalName || '', kind, mimeType, filename, sizeBytes, width, height, hasAlpha === true, actor || '', now]
      );
      return assetRecord(result.rows[0]);
    },

    async isMediaAssetReferenced(id) {
      const [drafts, revisions] = await Promise.all([
        queryable.query('SELECT scene_json FROM scenes'),
        queryable.query('SELECT scene_json FROM scene_revisions')
      ]);
      return drafts.rows.some((row) => sceneReferencesAsset(row.scene_json, id))
        || revisions.rows.some((row) => sceneReferencesAsset(row.scene_json, id));
    },

    async deleteMediaAssetRecord(id) {
      const result = await queryable.query('DELETE FROM media_assets WHERE id = $1 RETURNING *', [id]);
      return assetRecord(result.rows[0]);
    }
  };
}
