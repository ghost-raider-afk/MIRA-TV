import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { sceneRevisionIdParam } from '../../contracts/scene-publishing.js';
import { activity, conflict, notFound } from '../helpers.js';

export function createSceneAssignmentsRouter({ store, realtime }) {
  const router = express.Router();

  router.get('/screen-scene-assignments', async (_request, response) => {
    response.json(await store.listScreenSceneAssignments());
  });

  router.get('/screens/:id/scene-assignment', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    if (!await store.getScreen(screenId)) throw notFound('Монитор не найден.');
    response.json(await store.getScreenSceneAssignment(screenId));
  });

  router.put('/screens/:id/scene-assignment', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    const revisionId = sceneRevisionIdParam(request.body?.scene_revision_id);
    const [screen, revision] = await Promise.all([
      store.getScreen(screenId),
      store.getSceneRevision(revisionId)
    ]);
    if (!screen) throw notFound('Монитор не найден.');
    if (!revision) throw notFound('Опубликованная сцена не найдена.');
    if (Number(revision.scene?.display_count) !== 1) {
      throw conflict('Панорамную сцену нельзя назначить одному монитору. Для 2–6 TV будет использоваться Display Group.');
    }

    const assignment = await store.assignScreenSceneRevision(
      screenId,
      revisionId,
      request.session.sub,
      new Date().toISOString()
    );
    if (!assignment) throw new Error('Не удалось назначить сцену монитору.');

    await activity(store, request, {
      action: 'screen.scene.assigned',
      entity_type: 'screen',
      entity_id: screenId,
      message: `Монитору «${screen.name}» назначена сцена «${revision.scene_name}», ревизия ${revision.revision_number}.`,
      metadata: { scene_id: revision.scene_id, scene_revision_id: revision.id, revision_number: revision.revision_number }
    });
    realtime?.notifyScreen(screenId);
    response.json(assignment);
  });

  router.delete('/screens/:id/scene-assignment', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound('Монитор не найден.');
    const current = await store.getScreenSceneAssignment(screenId);
    if (!current) return response.status(204).end();

    await store.clearScreenSceneAssignment(screenId);
    await activity(store, request, {
      action: 'screen.scene.unassigned',
      entity_type: 'screen',
      entity_id: screenId,
      message: `С монитора «${screen.name}» снята сцена «${current.scene_name}».`,
      metadata: { scene_id: current.scene_id, scene_revision_id: current.scene_revision_id }
    });
    realtime?.notifyScreen(screenId);
    response.status(204).end();
  });

  return router;
}
