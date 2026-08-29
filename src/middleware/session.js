export function createSessionMiddleware(resolveSession) {
  const requireApiSession = async (request, response, next) => {
    try {
      const session = await resolveSession(request);
      if (!session) return response.status(401).json({ error: 'Требуется вход в систему.' });
      request.session = session;
      return next();
    } catch (error) {
      return next(error);
    }
  };

  const requirePageSession = async (request, response, next) => {
    try {
      const session = await resolveSession(request);
      if (!session) return response.redirect(302, '/signin.html');
      request.session = session;
      return next();
    } catch (error) {
      return next(error);
    }
  };

  return { requireApiSession, requirePageSession };
}
