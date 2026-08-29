import express from 'express';
import { createLoginLimiter } from '../../middleware/login-limiter.js';
import { hashPassword, verifyPassword } from '../../services/password-service.js';
import { issueSession, parseCookies, SESSION_COOKIE, sessionCookie, themeCookie, verifySession } from '../../services/session-service.js';

const DUMMY_LOGIN_PASSWORD = 'MenuTv2!TimingDummy#2026';

export function createAuthRouter({ store, config }) {
  const router = express.Router();
  const dummyHash = hashPassword(DUMMY_LOGIN_PASSWORD);
  const loginLimiter = createLoginLimiter({
    maxAttempts: config.loginMaxAttempts,
    ipMaxAttempts: config.loginIpMaxAttempts,
    windowMinutes: config.loginWindowMinutes,
    maxEntries: config.loginLimiterMaxEntries
  });

  router.post('/login', loginLimiter.middleware, async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const user = await store.getActiveUser(username);
    const passwordHash = user?.password_hash || await dummyHash;
    const passwordMatches = await verifyPassword(password, passwordHash);
    if (!user || !passwordMatches) {
      loginLimiter.recordFailure(request);
      return response.status(401).json({ error: 'Неверный логин или пароль.' });
    }
    loginLimiter.recordSuccess(request);
    await store.recordActivity({ actor_username: user.username, action: 'auth.login', entity_type: 'session', message: 'Выполнен вход в панель управления.' }).catch(() => undefined);
    const preferences = await store.getUserPreferences(user.username);
    response.setHeader('Set-Cookie', [sessionCookie(issueSession(user, config), config), themeCookie(preferences.theme, config)]);
    return response.status(204).end();
  });

  router.post('/logout', async (request, response) => {
    const session = verifySession(parseCookies(request)[SESSION_COOKIE], config);
    if (session) await store.recordActivity({ actor_username: session.sub, action: 'auth.logout', entity_type: 'session', message: 'Выполнен выход из панели управления.' }).catch(() => undefined);
    response.setHeader('Set-Cookie', [sessionCookie('', config, 0), themeCookie('system', config, 0)]);
    response.status(204).end();
  });

  return router;
}
