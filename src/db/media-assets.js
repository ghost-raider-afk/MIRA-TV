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

function uniqueAssetIds(ids) {
  return [...new Set((ids || []).map(String).filter(Boolean))];
}

async function replaceReferences(queryable, table, ownerColumn, ownerId, assetIds) {
  const ids = uniqueAssetIds(assetIds);
  await queryable.query(`DELETE FROM ${table} WHERE ${ownerColumn} = $1`, [ownerId]);
  if (!ids.length) return 0;
  const values = ids.map((_, index) => `($1,$${index + 2})`).join(',');
  const result = await queryable.query(
    `INSERT INTO ${table} (${ownerColumn}, asset_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [ownerId, ...ids]
  );
  return result.rowCount || ids.length;
}

export function createMediaAssetsRepository(queryable) {
  return {
    async listMediaAssets() {
      const result = await queryable.query('SELECT * FROM media_assets ORDER BY created_at DESC, id ASC');
      return result.rows.map(assetRecord);
    },

    async listMediaAssetsByIds(ids) {
      const unique = uniqueAssetIds(ids);
      if (!unique.length) return [];
      const placeholders = unique.map((_, index) => `$${index + 1}`).join(',');
      const result = await queryable.query(`SELECT * FROM media_assets WHERE id IN (${placeholders}) ORDER BY created_at DESC, id ASC`, unique);
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

    replaceSceneDraftMediaRefs(sceneId, assetIds) {
      return replaceReferences(queryable, 'scene_draft_media_assets', 'scene_id', sceneId, assetIds);
    },

    replaceSceneRevisionMediaRefs(sceneRevisionId, assetIds) {
      return replaceReferences(queryable, 'scene_revision_media_assets', 'scene_revision_id', sceneRevisionId, assetIds);
    },

    async isMediaAssetReferenced(id) {
      const result = await queryable.query(
        `SELECT (
          EXISTS(SELECT 1 FROM scene_draft_media_assets WHERE asset_id = $1)
          OR EXISTS(SELECT 1 FROM scene_revision_media_assets WHERE asset_id = $1)
        ) AS referenced`,
        [id]
      );
      return result.rows[0]?.referenced === true;
    },

    async deleteMediaAssetRecord(id) {
      const result = await queryable.query('DELETE FROM media_assets WHERE id = $1 RETURNING *', [id]);
      return assetRecord(result.rows[0]);
    }
  };
}
