import express from 'express';
import { positiveId, sftpBindingInput, sftpDirectoryInput } from '../../contracts/input.js';
import { activity, notFound } from '../helpers.js';
import { createPublishService } from '../../services/publish-service.js';
import { createSftpAccessService } from '../../services/sftp-access-service.js';

function publishedContentType(filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

export function createSftpRouter({ store, sftp, config }) {
  const router = express.Router();
  const access = createSftpAccessService({ store, sftp, config });
  const publish = createPublishService({ store, sftp, config });

  router.get('/sftp/connection', (_request, response) => response.json(access.connection()));
  router.get('/sftp/overview', async (_request, response) => response.json(await access.overview()));
  router.get('/sftp/directories', async (_request, response) => response.json(await access.directoriesWithStatus()));
  router.get('/sftp/directories/:id/files', async (request, response) => {
    response.json(await access.directoryFiles(positiveId(request.params.id, 'id')));
  });
  router.get('/sftp/directories/:id/files/:filename/download', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const result = await access.publishedFile(id, request.params.filename);
    const filename = result.file.name;
    response.set({
      'Cache-Control': 'no-store',
      'Content-Type': publishedContentType(filename),
      'Content-Length': String(result.file.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-SHA256': result.file.sha256,
      'Last-Modified': new Date(result.file.modified_at).toUTCString()
    });
    await activity(store, request, {
      action: 'sftp_file.downloaded',
      entity_type: 'sftp_directory',
      entity_id: result.directory.id,
      message: `Скачан опубликованный файл «${filename}» из SFTP-каталога «${result.directory.name}».`
    });
    response.end(result.file.bytes);
  });
  router.post('/sftp/directories', async (request, response) => {
    const directory = await store.createSftpDirectory(sftpDirectoryInput(request.body));
    await activity(store, request, { action: 'sftp_directory.created', entity_type: 'sftp_directory', entity_id: directory.id, message: `Добавлен SFTP-каталог «${directory.name}».` });
    response.status(201).json(directory);
  });
  router.post('/sftp/directories/:id/provision', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const updated = await access.provisionDirectory(id);
    await activity(store, request, { action: 'sftp_directory.provisioned', entity_type: 'sftp_directory', entity_id: updated.id, message: `Создан физический SFTP-каталог «${updated.name}».` });
    response.json(updated);
  });
  router.delete('/sftp/directories/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const directory = await store.getSftpDirectory(id);
    if (!directory || !await store.deleteSftpDirectory(id)) throw notFound();
    await activity(store, request, { action: 'sftp_directory.deleted', entity_type: 'sftp_directory', entity_id: directory.id, message: `Удалён SFTP-каталог «${directory.name}».` });
    response.status(204).end();
  });

  router.post('/locations/:id/sftp-binding', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const result = await access.bindLocation(locationId, sftpBindingInput(request.body));
    await activity(store, request, { action: 'sftp_binding.created', entity_type: 'location', entity_id: result.location.id, message: `Для точки «${result.location.name}» настроен SFTP-доступ.` });
    response.status(201).json(result);
  });
  router.post('/locations/:id/sftp-password', async (request, response) => {
    const result = await access.resetPassword(positiveId(request.params.id, 'id'));
    await activity(store, request, { action: 'sftp_password.reset', entity_type: 'location', entity_id: result.location.id, message: `Обновлён пароль SFTP для точки «${result.location.name}».` });
    response.json({ credentials: result.credentials });
  });
  router.delete('/locations/:id/sftp-binding', async (request, response) => {
    const location = await access.unbindLocation(positiveId(request.params.id, 'id'));
    await activity(store, request, { action: 'sftp_binding.deleted', entity_type: 'location', entity_id: location.id, message: `Отключён SFTP-доступ для точки «${location.name}».` });
    response.status(204).end();
  });

  router.put('/screens/:id/source', express.raw({ type: 'image/jpeg', limit: config.screenSourceMaxBytes }), async (request, response) => {
    const updated = await publish.stageJpeg(positiveId(request.params.id, 'id'), request.body);
    await activity(store, request, { action: 'screen.source_uploaded', entity_type: 'screen', entity_id: updated.id, message: `Загружено изображение для монитора «${updated.name}».` });
    response.json(updated);
  });
  router.post('/screens/:id/publish', async (request, response) => {
    const updated = await publish.publish(positiveId(request.params.id, 'id'));
    await activity(store, request, { action: 'screen.published', entity_type: 'screen', entity_id: updated.id, message: `Опубликовано меню для монитора «${updated.name}».` });
    response.json(updated);
  });

  return router;
}
