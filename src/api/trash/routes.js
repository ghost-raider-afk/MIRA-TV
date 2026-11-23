import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { activity, conflict, notFound } from '../helpers.js';

const TYPES = new Set(['product', 'screen', 'location']);
const TYPE_NAMES = Object.freeze({
  product: 'Продукция',
  screen: 'Монитор',
  location: 'Торговая точка'
});

export function createTrashRouter({ store }) {
  const router = express.Router();
  router.get('/', async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(await store.listTrash());
  });
  router.post('/:type/:id/restore', async (request, response) => {
    const type = String(request.params.type || '');
    if (!TYPES.has(type)) throw notFound();
    const id = positiveId(request.params.id, 'id');
    const restored = await store.transaction(async (tx) => {
      if (type === 'product') await tx.setProductHistoryActor(request.session.sub);
      return tx.restoreTrash(type, id);
    });
    if (!restored) {
      if (type === 'screen') throw conflict('Сначала восстановите торговую точку, если она находится в корзине.');
      throw notFound();
    }
    await activity(store, request, {
      action: `trash.${type}.restored`,
      entity_type: type === 'product' ? 'catalog_product' : type,
      entity_id: id,
      message: `Из корзины восстановлено: ${TYPE_NAMES[type]} «${restored.name}».`
    });
    response.json({ type, ...restored });
  });
  return router;
}
