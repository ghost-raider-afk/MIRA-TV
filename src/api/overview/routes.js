import express from 'express';

export function createOverviewRouter({ store }) {
  const router = express.Router();
  router.get('/overview', async (_request, response) => response.json(await store.overview()));
  return router;
}
