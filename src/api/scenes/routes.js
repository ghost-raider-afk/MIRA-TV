import express from 'express';
import { randomUUID } from 'node:crypto';
import { sceneIdParam, scenePayloadInput, sceneRevision } from '../../contracts/scene.js';
import { activity, conflict, notFound } from '../helpers.js';

function newSceneId() {
  return `scene-${randomUUID()}`;
}

function cloneScenePayload(source) {
  const scene = structuredClone(source);
  delete scene.id;
  delete scene.server_revision;
  delete scene.created_at;
  delete scene.updated_at;
  scene.name = `${scene.name} — копия`.slice(0, 120);
  return scenePayloadInput(scene);
}

export function createScenesRouter({ store }) {
  const router = express.Router();

  router.get('/', async (_request, response) => response.json(await store.listScenes()));

  router.get('/:id', async (request, response) => {
    const scene = await store.getScene(sceneIdParam(request.params.id));
    if (!scene) throw notFound('Сцена не найдена.');
    response.json(scene);
  });

  router.post('/', async (request, response) => {
    const scene = scenePayloadInput(request.body);
    const created = await store.createSceneRecord({
      id: newSceneId(),
      scene,
      actor: request.session.sub,
      now: new Date().toISOString()
    });
    if (!created) throw conflict('Не удалось создать сцену. Повторите попытку.');
    await activity(store, request, {
      action: 'scene.created',
      entity_type: 'scene',
      entity_id: created.id,
      message: `Создана сцена «${created.name}».`
    });
    response.status(201).json(created);
  });

  router.post('/:id/clone', async (request, response) => {
    const source = await store.getScene(sceneIdParam(request.params.id));
    if (!source) throw notFound('Сцена не найдена.');
    const scene = cloneScenePayload(source);
    const created = await store.createSceneRecord({
      id: newSceneId(),
      scene,
      actor: request.session.sub,
      now: new Date().toISOString()
    });
    if (!created) throw conflict('Не удалось создать копию сцены.');
    await activity(store, request, {
      action: 'scene.cloned',
      entity_type: 'scene',
      entity_id: created.id,
      message: `Создана копия сцены «${source.name}».`
    });
    response.status(201).json(created);
  });

  router.put('/:id', async (request, response) => {
    const id = sceneIdParam(request.params.id);
    const expectedRevision = sceneRevision(request.body?.server_revision);
    const scene = scenePayloadInput(request.body);
    const updated = await store.updateSceneRecord(id, scene, expectedRevision, request.session.sub, new Date().toISOString());
    if (!updated) {
      if (!await store.getScene(id)) throw notFound('Сцена не найдена.');
      throw conflict('Сцена уже изменена в другой вкладке или другим пользователем. Обновите страницу перед продолжением.');
    }
    await activity(store, request, {
      action: 'scene.updated',
      entity_type: 'scene',
      entity_id: updated.id,
      message: `Обновлена сцена «${updated.name}».`
    });
    response.json(updated);
  });

  router.delete('/:id', async (request, response) => {
    const id = sceneIdParam(request.params.id);
    const removed = await store.deleteSceneRecord(id);
    if (!removed) throw notFound('Сцена не найдена.');
    await activity(store, request, {
      action: 'scene.deleted',
      entity_type: 'scene',
      entity_id: id,
      message: `Удалена сцена «${removed.name}».`
    });
    response.status(204).end();
  });

  return router;
}
