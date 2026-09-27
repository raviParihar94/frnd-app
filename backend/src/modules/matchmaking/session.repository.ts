import { v4 as uuidv4 } from 'uuid';
import { redis } from '../../config/redis';
import { MatchSession, QueueEntry } from './types';
import { CallType, Language } from './types';

const ACTIVE_SESSIONS_SET = 'active_sessions';

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function userSessionKey(userId: string): string {
  return `user_session:${userId}`;
}

export async function createSession(
  callType: CallType,
  language: Language,
  entryA: QueueEntry,
  entryB: QueueEntry
): Promise<MatchSession> {
  const session: MatchSession = {
    id: uuidv4(),
    callType,
    language,
    userAId: entryA.userId,
    userBId: entryB.userId,
    socketAId: entryA.socketId,
    socketBId: entryB.socketId,
    startedAt: Date.now(),
  };

  const key = sessionKey(session.id);

  await redis
    .multi()
    .hset(key, session as unknown as Record<string, string>)
    .sadd(ACTIVE_SESSIONS_SET, session.id)
    .set(userSessionKey(entryA.userId), session.id)
    .set(userSessionKey(entryB.userId), session.id)
    .exec();

  return session;
}

export async function getSession(sessionId: string): Promise<MatchSession | null> {
  const data = await redis.hgetall(sessionKey(sessionId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    callType: data.callType as CallType,
    language: data.language as Language,
    userAId: data.userAId,
    userBId: data.userBId,
    socketAId: data.socketAId,
    socketBId: data.socketBId,
    startedAt: Number(data.startedAt),
  };
}

export async function getSessionForUser(userId: string): Promise<MatchSession | null> {
  const sessionId = await redis.get(userSessionKey(userId));
  if (!sessionId) return null;
  return getSession(sessionId);
}

export async function endSession(session: MatchSession): Promise<void> {
  await redis
    .multi()
    .del(sessionKey(session.id))
    .srem(ACTIVE_SESSIONS_SET, session.id)
    .del(userSessionKey(session.userAId))
    .del(userSessionKey(session.userBId))
    .exec();
}

export async function getAllActiveSessionIds(): Promise<string[]> {
  return redis.smembers(ACTIVE_SESSIONS_SET);
}
