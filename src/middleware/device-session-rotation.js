import crypto from 'node:crypto';
import {
  deviceSessionCookie,
  deviceSessionExpiresAt,
  deviceSessionRotationDue,
  deviceSessionTokenFromRequest,
  rotatedDeviceSessionToken,
  tokenHash
} from '../services/device-session-service.js';

export function createDeviceSessionRotationMiddleware({ store, config }) {
  return async function rotateDeviceSession(request, response, next) {
    try {
      const rawToken = deviceSessionTokenFromRequest(request);
      if (!rawToken) return next();

      const session = await store.getRotatableDeviceSessionByHash(tokenHash(rawToken));
      if (!session) return next();

      if (session.parent_session_id) {
        await store.confirmDeviceSessionRotation(
          session.session_id,
          session.parent_session_id,
          session.device_id
        );
        return next();
      }

      if (!deviceSessionRotationDue(session, config)) return next();

      const candidateSessionId = crypto.randomUUID();
      const candidateToken = rotatedDeviceSessionToken(candidateSessionId, config);
      const rotated = await store.transaction((tx) => tx.beginOrResumeDeviceSessionRotation({
        parentSessionId: session.session_id,
        deviceId: session.device_id,
        candidateSessionId,
        candidateTokenHash: tokenHash(candidateToken),
        expiresAt: deviceSessionExpiresAt(config)
      }));
      if (!rotated) return next();

      const nextToken = rotatedDeviceSessionToken(rotated.session_id, config);
      response.setHeader('Set-Cookie', deviceSessionCookie(nextToken, config));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
