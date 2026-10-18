import express from 'express';
import { managerUsernameInput } from '../../contracts/users.js';
import { hashPassword, validateNewPassword } from '../../services/password-service.js';
import { activity, conflict, notFound } from '../helpers.js';

function activeInput(value) {
  if (typeof value !== 'boolean') throw Object.assign(new Error('Поле active должно быть логическим значением.'), { status: 400 });
  return value;
}

export function createManagerAdminRouter({ store, config }) {
  const router = express.Router();

  router.get('/', async (_request, response) => {
    response.json(await store.listManagers());
  });

  router.post('/', async (request, response) => {
    const username = managerUsernameInput(request.body?.username);
    const password = validateNewPassword(request.body?.password, config, 'Пароль менеджера');
    let manager;
    try {
      manager = await store.createManager({ username, passwordHash: await hashPassword(password) });
    } catch (error) {
      if (error?.code === '23505') throw conflict('Пользователь с таким логином уже существует.');
      throw error;
    }
    await activity(store, request, {
      action: 'manager.created',
      entity_type: 'user',
      entity_id: username,
      message: `Создан менеджер «${username}».`
    });
    response.status(201).json(manager);
  });

  router.put('/:username/password', async (request, response) => {
    const username = managerUsernameInput(request.params.username);
    const password = validateNewPassword(request.body?.password, config, 'Новый пароль менеджера');
    const manager = await store.updateManagerPassword(username, await hashPassword(password));
    if (!manager) throw notFound('Менеджер не найден.');
    await activity(store, request, {
      action: 'manager.password_updated',
      entity_type: 'user',
      entity_id: username,
      message: `Изменён пароль менеджера «${username}».`
    });
    response.json(manager);
  });

  router.put('/:username/active', async (request, response) => {
    const username = managerUsernameInput(request.params.username);
    const active = activeInput(request.body?.active);
    const manager = await store.setManagerActive(username, active);
    if (!manager) throw notFound('Менеджер не найден.');
    await activity(store, request, {
      action: active ? 'manager.activated' : 'manager.deactivated',
      entity_type: 'user',
      entity_id: username,
      message: `Менеджер «${username}» ${active ? 'активирован' : 'деактивирован'}.`
    });
    response.json(manager);
  });

  router.delete('/:username', async (request, response) => {
    const username = managerUsernameInput(request.params.username);
    if (!await store.deleteManager(username)) throw notFound('Менеджер не найден.');
    await activity(store, request, {
      action: 'manager.deleted',
      entity_type: 'user',
      entity_id: username,
      message: `Удалён менеджер «${username}».`
    });
    response.status(204).end();
  });

  return router;
}
