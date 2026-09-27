import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AccessTokenPayload, RefreshTokenPayload } from '../types/auth';

// jsonwebtoken types expiresIn as a numeric-seconds value or a template-literal
// duration string (e.g. `${number}m`), not a plain `string`. Env vars are always
// plain strings at runtime, so we validate the format ourselves and cast for TS.
const DURATION_REGEX = /^\d+(ms|s|m|h|d|w|y)?$/;

function asExpiresIn(value: string): jwt.SignOptions['expiresIn'] {
  if (!DURATION_REGEX.test(value)) {
    throw new Error(`Invalid JWT expiry format: "${value}" (expected e.g. "15m", "30d", "3600")`);
  }
  return value as jwt.SignOptions['expiresIn'];
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: asExpiresIn(env.JWT_ACCESS_EXPIRES_IN),
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: asExpiresIn(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type: expected refresh token');
  }
  return decoded;
}
