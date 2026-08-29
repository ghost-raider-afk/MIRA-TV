import { generatePassword, hashPassword } from './password-service.js';

function selectAdministrator(administrators, requestedUsername) {
  const username = String(requestedUsername || '').trim();
  if (username) {
    const selected = administrators.find((administrator) => administrator.username === username);
    if (!selected) throw new Error(`Активный администратор «${username}» не найден.`);
    return selected;
  }
  if (administrators.length === 0) throw new Error('Активный администратор не найден.');
  if (administrators.length > 1) {
    throw new Error(`Найдено несколько администраторов. Укажите логин: ${administrators.map((administrator) => administrator.username).join(', ')}`);
  }
  return administrators[0];
}

export async function resetAdministratorPassword({ store, config, username = '' }) {
  const administrators = await store.listActiveAdministrators();
  const administrator = selectAdministrator(administrators, username);
  const password = generatePassword(config);
  const passwordHash = await hashPassword(password);
  const updated = await store.updateUserPassword(administrator.username, passwordHash);
  if (!updated) throw new Error(`Не удалось изменить пароль администратора «${administrator.username}».`);

  await store.recordActivity({
    actor_username: 'system',
    action: 'administrator.password.reset',
    entity_type: 'user',
    entity_id: updated.username,
    message: `Пароль администратора «${updated.username}» сброшен системным скриптом.`,
    metadata: { session_version: updated.session_version }
  }).catch(() => undefined);

  return { username: updated.username, password, sessionVersion: updated.session_version };
}
