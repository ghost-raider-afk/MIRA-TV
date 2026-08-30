import express from 'express';
import { randomUUID } from 'node:crypto';
import { sceneIdParam, sceneMediaAssetIds, scenePayloadInput, sceneRevision } from '../../contracts/scene.js';
import { activity, conflict, notFound } from '../helpers.js';

function newSceneId() {
  return `scene-${randomUUID()}`;
}

function newSceneRevisionId() {
  return `scene-revision-${randomUUID()}`;
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

function throwMediaReferenceConflict(error) {
  if (error?.code !== '23503') throw error;
  throw conflict('Один или несколько медиафайлов сцены больше не существуют. Обновите медиатеку и повторите действие.');
}

async function createDraftRecord(store, { id, scene, actor, now }) {
  return store.transaction(async (tx) => {
    const created = await tx.createSceneRecord({ id, scene, actor, now });
    if (!created) return null;
    await tx.replaceSceneDraftMediaRefs(id, sceneMediaAssetIds(scene));
    return created;
  });
}

export function createScenesRouter({ store }) {
  const router = express.Router();

  router.get('/', async (_request, response) => response.json(await store.listScenes()));
  router.get('/published/revisions', async (_request, response) => response.json(await store.listSceneRevisions()));

  router.get('/:id', async (request, response) => {
    const scene = await store.getScene(sceneIdParam(request.params.id));
    if (!scene) throw notFound('Сцена не найдена.');
    response.json(scene);
  });

  router.post('/', async (request, response) => {
    const scene = scenePayloadInput(request.body);
    let created;
    try {
      created = await createDraftRecord(store, {
        id: newSceneId(),
        scene,
        actor: request.session.sub,
        now: new Date().toISOString()
      });
    } catch (error) {
      throwMediaReferenceConflict(error);
    }
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
    let created;
    try {
      created = await createDraftRecord(store, {
        id: newSceneId(),
        scene,
        actor: request.session.sub,
        now: new Date().toISOString()
      });
    } catch (error) {
      throwMediaReferenceConflict(error);
    }
    if (!created) throw conflict('Не удалось создать копию сцены.');
    await activity(store, request, {
      action: 'scene.cloned',
      entity_type: 'scene',
      entity_id: created.id,
      message: `Создана копия сцены «${source.name}».`
    });
    response.status(201).json(created);
  });

  router.post('/:id/publish', async (request, response) => {
    const id = sceneIdParam(request.params.id);
    let published;
    try {
      published = await store.transaction(async (tx) => {
        const draft = await tx.lockScene(id);
        if (!draft) throw notFound('Сцена не найдена.');
        const snapshot = scenePayloadInput(draft);
        const revisionNumber = await tx.nextSceneRevisionNumber(id);
        const revision = await tx.createSceneRevision({
          id: newSceneRevisionId(),
          sceneId: id,
          revisionNumber,
          scene: snapshot,
          actor: request.session.sub,
          now: new Date().toISOString()
        });
        if (revision) await tx.replaceSceneRevisionMediaRefs(revision.id, sceneMediaAssetIds(snapshot));
        return revision;
      });
    } catch (error) {
      throwMediaReferenceConflict(error);
    }
    if (!published) throw conflict('Не удалось опубликовать сцену.');
    await activity(store, request, {
      action: 'scene.published',
      entity_type: 'scene',
      entity_id: id,
      message: `Опубликована сцена «${published.scene_name}», ревизия ${published.revision_number}.`,
      metadata: { scene_revision_id: published.id, revision_number: published.revision_number }
    });
    response.status(201).json(published);
  });

  router.put('/:id', async (request, response) => {
    const id = sceneIdParam(request.params.id);
    const expectedRevision = sceneRevision(request.body?.server_revision);
    const scene = scenePayloadInput(request.body);
    let updated;
    try {
      updated = await store.transaction(async (tx) => {
        const saved = await tx.updateSceneRecord(id, scene, expectedRevision, request.session.sub, new Date().toISOString());
        if (!saved) return null;
        await tx.replaceSceneDraftMediaRefs(id, sceneMediaAssetIds(scene));
        return saved;
      });
    } catch (error) {
      throwMediaReferenceConflict(error);
    }
    if (!updated) {
      if (!await store.getScene(id)) throw notFound('Сцена не найдена.');
      throw conflict('Сцена уже изменена в другой вкладке или другим пользователем. Обновите страницу перед продолжением.');
    }
    response.json(updated);
  });

  router.delete('/:id', async (request, response) => {
    const id = sceneIdParam(request.params.id);
    let removed;
    try {
      removed = await store.deleteSceneRecord(id);
    } catch (error) {
      if (error?.code === '23503') throw conflict('Сцена используется на одном или нескольких мониторах. Сначала снимите назначение.');
      throw error;
    }
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
