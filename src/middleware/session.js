export function createSessionMiddleware(resolveSession) {
  const roleHome = (role) => role === 'manager' ? '/manager' : '/';

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

  const requireApiRole = (...roles) => (request, response, next) => {
    if (roles.includes(request.session?.user?.role)) return next();
    return response.status(403).json({ error: 'Недостаточно прав для выполнения операции.' });
  };

  const requirePageRole = (...roles) => (request, response, next) => {
    if (roles.includes(request.session?.user?.role)) return next();
    return response.redirect(302, roleHome(request.session?.user?.role));
  };

  return { requireApiSession, requirePageSession, requireApiRole, requirePageRole };
}
