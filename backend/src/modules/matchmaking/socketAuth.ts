import { Socket } from 'socket.io';
import { verifyAccessToken } from '../../utils/jwt';
import { AuthenticatedUser } from '../../types/auth';

/**
 * Expects the client to connect with `io(url, { auth: { token: accessToken } })`
 * using the same access token issued by POST /api/auth/otp/verify.
 */
export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    next(new Error('Unauthorized: missing token'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    (socket.data as { user: AuthenticatedUser }).user = { id: payload.sub, phone: payload.phone };
    next();
  } catch {
    next(new Error('Unauthorized: invalid or expired token'));
  }
}
