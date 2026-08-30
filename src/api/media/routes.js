import express from 'express';
import { mediaAssetIdParam } from '../../contracts/media.js';
import { createMediaAssetFromStream, removeMediaAssetFile } from '../../services/media-assets-service.js';
import { activity, conflict, notFound } from '../helpers.js';

export function createMediaRouter({ store, config }) {
  const router = express.Router();

  router.get('/', async (_request, response) => {
    response.json(await store.listMediaAssets());
  });

  router.post('/', async (request, response) => {
    const asset = await createMediaAssetFromStream({
      stream: request,
      contentLength: request.get('content-length'),
      contentType: request.get('content-type'),
      originalName: request.get('x-mira-file-name'),
      config,
      store,
      username: request.session.sub
    });
    await activity(store, request, {
      action: 'media.created',
      entity_type: 'media_asset',
      entity_id: asset.id,
      message: `Добавлен медиафайл «${asset.original_name || asset.filename}».`,
      metadata: { kind: asset.kind, mime_type: asset.mime_type, size_bytes: asset.size_bytes }
    });
    response.status(201).json(asset);
  });

  router.delete('/:id', async (request, response) => {
    const id = mediaAssetIdParam(request.params.id);
    const asset = await store.getMediaAsset(id);
    if (!asset) throw notFound('Медиафайл не найден.');

    try {
      const removed = await store.transaction((tx) => tx.deleteMediaAssetRecord(id));
      if (!removed) throw notFound('Медиафайл не найден.');
    } catch (error) {
      if (error?.code === '23503') {
        throw conflict('Медиафайл используется в сцене или опубликованной ревизии и не может быть удалён.');
      }
      throw error;
    }

    await removeMediaAssetFile({ asset, config });
    await activity(store, request, {
      action: 'media.deleted',
      entity_type: 'media_asset',
      entity_id: id,
      message: `Удалён медиафайл «${asset.original_name || asset.filename}».`
    });
    response.status(204).end();
  });

  return router;
}
