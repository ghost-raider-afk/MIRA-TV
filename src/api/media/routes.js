import express from 'express';
import { activity, conflict, notFound } from '../helpers.js';
import { createMediaAssetFromStream, deleteMediaAssetFile } from '../../services/media-assets-service.js';

function mediaAssetId(value) {
  const id = String(value || '').trim();
  if (!/^media-[0-9a-f-]{36}$/i.test(id)) throw Object.assign(new Error('Некорректный идентификатор медиафайла.'), { status: 400 });
  return id;
}

export function createMediaAssetsRouter({ store, config }) {
  const router = express.Router();

  router.get('/', async (_request, response) => {
    response.json(await store.listMediaAssets());
  });

  router.get('/:id', async (request, response) => {
    const asset = await store.getMediaAsset(mediaAssetId(request.params.id));
    if (!asset) throw notFound('Медиафайл не найден.');
    response.json(asset);
  });

  router.post('/', async (request, response) => {
    const asset = await createMediaAssetFromStream({
      stream: request,
      contentLength: request.get('content-length'),
      contentType: request.get('content-type'),
      originalName: request.get('x-file-name'),
      config,
      store,
      username: request.session.sub
    });
    await activity(store, request, {
      action: 'media.asset.created',
      entity_type: 'media_asset',
      entity_id: asset.id,
      message: `Добавлен медиафайл «${asset.original_name || asset.filename}».`,
      metadata: { kind: asset.kind, mime_type: asset.mime_type, size_bytes: asset.size_bytes }
    });
    response.status(201).json(asset);
  });

  router.delete('/:id', async (request, response) => {
    const id = mediaAssetId(request.params.id);
    const asset = await store.getMediaAsset(id);
    if (!asset) throw notFound('Медиафайл не найден.');
    if (await store.isMediaAssetReferenced(id)) {
      throw conflict('Медиафайл используется в Scene Draft или Published Revision. Сначала удалите его из всех сцен.');
    }
    if (!await deleteMediaAssetFile({ asset, config, store })) throw notFound('Медиафайл не найден.');
    await activity(store, request, {
      action: 'media.asset.deleted',
      entity_type: 'media_asset',
      entity_id: id,
      message: `Удалён медиафайл «${asset.original_name || asset.filename}».`
    });
    response.status(204).end();
  });

  return router;
}
