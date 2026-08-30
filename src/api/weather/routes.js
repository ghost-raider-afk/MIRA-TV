import { Router } from 'express';

export function createWeatherRouter({ weatherService }) {
  if (!weatherService?.get) throw new TypeError('Weather router requires weatherService.');
  const router = Router();
  router.get('/', async (request, response, next) => {
    try {
      response.json(await weatherService.get(request.query.location));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
