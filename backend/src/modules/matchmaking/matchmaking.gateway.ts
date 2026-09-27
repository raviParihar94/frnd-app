import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../../config/env';
import { AuthenticatedUser } from '../../types/auth';
import { findUserById } from '../users/users.repository';
import { recordSessionEnd, recordSessionStart } from '../sessions/sessionHistory.repository';
import { dequeuePair, enqueue, removeFromQueue } from './queue.repository';
import { createSession, endSession, getSessionForUser } from './session.repository';
import { socketAuthMiddleware } from './socketAuth';
import { CallType, MatchSession, SessionEndReason, SUPPORTED_LANGUAGES } from './types';

function getSocketUser(socket: Socket): AuthenticatedUser {
  return (socket.data as { user: AuthenticatedUser }).user;
}

const joinQueueSchema = z.object({
  callType: z.enum(['text', 'voice', 'video']),
  language: z.enum(SUPPORTED_LANGUAGES),
});

const chatMessageSchema = z.object({
  text: z.string().min(1).max(1000),
});

// In-memory per-user timers for the "no match found yet, try another
// language?" nudge. Fine for a single backend instance; if this scales to
// multiple instances behind a load balancer, move this to a Redis-based
// delayed job (or a per-instance check tied to socket affinity) instead.
const queueTimeoutTimers = new Map<string, NodeJS.Timeout>();

function clearQueueTimeoutTimer(userId: string): void {
  const existing = queueTimeoutTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    queueTimeoutTimers.delete(userId);
  }
}

function scheduleQueueTimeoutNudge(
  socket: Socket,
  userId: string,
  callType: CallType,
  language: string
): void {
  clearQueueTimeoutTimer(userId);
  const timer = setTimeout(() => {
    queueTimeoutTimers.delete(userId);
    const fallback = language === 'en' ? null : 'en';
    socket.emit('QUEUE_TIMEOUT', {
      callType,
      language,
      message: fallback
        ? `No user found in the "${language}" queue yet. Try "${fallback}" instead?`
        : 'Still searching for a match — hang tight.',
      suggestedLanguage: fallback,
    });
  }, env.QUEUE_TIMEOUT_SECONDS * 1000);
  queueTimeoutTimers.set(userId, timer);
}

async function buildPartnerPayload(userId: string) {
  const user = await findUserById(userId);
  return {
    nickname: user?.nickname ?? 'Anonymous',
    avatarUrl: user?.avatar_url ?? null,
  };
}

async function tryMatch(io: Server, callType: CallType, language: (typeof SUPPORTED_LANGUAGES)[number]) {
  const pair = await dequeuePair(callType, language);
  if (!pair) return;

  const [entryA, entryB] = pair;
  clearQueueTimeoutTimer(entryA.userId);
  clearQueueTimeoutTimer(entryB.userId);

  const session = await createSession(callType, language, entryA, entryB);

  // Durable history record, independent of Redis. Best-effort: a DB hiccup
  // here shouldn't block two people from actually starting their call.
  try {
    await recordSessionStart({
      id: session.id,
      userAId: session.userAId,
      userBId: session.userBId,
      callType: session.callType,
      language: session.language,
      startedAt: new Date(session.startedAt),
    });
  } catch (err) {
    console.error('Failed to record session start in history:', err);
  }

  const [partnerForA, partnerForB] = await Promise.all([
    buildPartnerPayload(entryB.userId),
    buildPartnerPayload(entryA.userId),
  ]);

  io.to(entryA.socketId).emit('MATCH_FOUND', {
    sessionId: session.id,
    callType,
    language,
    partner: partnerForA,
  });
  io.to(entryB.socketId).emit('MATCH_FOUND', {
    sessionId: session.id,
    callType,
    language,
    partner: partnerForB,
  });
}

/**
 * Ends a session, tells both participants why, and cleans up Redis state.
 * `leavingUserId` (when provided) identifies who triggered the end, so we
 * can phrase the notification to the *other* participant correctly.
 */
export async function endSessionAndNotify(
  io: Server,
  session: MatchSession,
  reason: SessionEndReason,
  leavingUserId?: string
): Promise<void> {
  await endSession(session);

  try {
    await recordSessionEnd(session.id, reason);
  } catch (err) {
    console.error('Failed to record session end in history:', err);
  }

  io.to(session.socketAId).emit('SESSION_ENDED', {
    sessionId: session.id,
    reason,
    initiatedByMe: leavingUserId === session.userAId,
  });
  io.to(session.socketBId).emit('SESSION_ENDED', {
    sessionId: session.id,
    reason,
    initiatedByMe: leavingUserId === session.userBId,
  });
}

export function setupMatchmakingGateway(io: Server): void {
  io.use(socketAuthMiddleware);

  io.on('connection', (socket: Socket) => {
    const userId = getSocketUser(socket).id;

    socket.on('JOIN_QUEUE', async (payload: unknown) => {
      try {
        const parsed = joinQueueSchema.safeParse(payload);
        if (!parsed.success) {
          socket.emit('ERROR', { message: 'Invalid JOIN_QUEUE payload', details: parsed.error.flatten() });
          return;
        }
        const { callType, language } = parsed.data;

        const existingSession = await getSessionForUser(userId);
        if (existingSession) {
          socket.emit('ERROR', { message: 'You are already in an active session' });
          return;
        }

        // Idempotent: if the user was already queued elsewhere, move them.
        await removeFromQueue(userId);
        await enqueue(callType, language, { userId, socketId: socket.id });
        socket.emit('QUEUE_JOINED', { callType, language });

        scheduleQueueTimeoutNudge(socket, userId, callType, language);
        await tryMatch(io, callType, language);
      } catch (err) {
        console.error('JOIN_QUEUE error:', err);
        socket.emit('ERROR', { message: 'Failed to join queue' });
      }
    });

    socket.on('LEAVE_QUEUE', async () => {
      try {
        clearQueueTimeoutTimer(userId);
        await removeFromQueue(userId);
        socket.emit('QUEUE_LEFT', {});
      } catch (err) {
        console.error('LEAVE_QUEUE error:', err);
        socket.emit('ERROR', { message: 'Failed to leave queue' });
      }
    });

    socket.on('SKIP_USER', async () => {
      try {
        const session = await getSessionForUser(userId);
        if (!session) {
          socket.emit('ERROR', { message: 'No active session to skip' });
          return;
        }

        await endSessionAndNotify(io, session, 'skipped', userId);

        // Re-enter the same queue immediately so skipping feels instant.
        await enqueue(session.callType, session.language, { userId, socketId: socket.id });
        socket.emit('QUEUE_JOINED', { callType: session.callType, language: session.language });
        scheduleQueueTimeoutNudge(socket, userId, session.callType, session.language);
        await tryMatch(io, session.callType, session.language);
      } catch (err) {
        console.error('SKIP_USER error:', err);
        socket.emit('ERROR', { message: 'Failed to skip' });
      }
    });

    socket.on('END_CALL', async () => {
      try {
        const session = await getSessionForUser(userId);
        if (!session) {
          socket.emit('ERROR', { message: 'No active session to end' });
          return;
        }
        await endSessionAndNotify(io, session, 'manual', userId);
      } catch (err) {
        console.error('END_CALL error:', err);
        socket.emit('ERROR', { message: 'Failed to end call' });
      }
    });

    socket.on('CHAT_MESSAGE', async (payload: unknown) => {
      try {
        const parsed = chatMessageSchema.safeParse(payload);
        if (!parsed.success) {
          socket.emit('ERROR', { message: 'Invalid chat message' });
          return;
        }

        const session = await getSessionForUser(userId);
        if (!session) {
          socket.emit('ERROR', { message: 'No active session' });
          return;
        }

        const partnerSocketId =
          session.userAId === userId ? session.socketBId : session.socketAId;

        io.to(partnerSocketId).emit('CHAT_MESSAGE', {
          sessionId: session.id,
          text: parsed.data.text,
          at: Date.now(),
        });
      } catch (err) {
        console.error('CHAT_MESSAGE error:', err);
        socket.emit('ERROR', { message: 'Failed to send message' });
      }
    });

    socket.on('TYPING', async () => {
      try {
        const session = await getSessionForUser(userId);
        if (!session) return;
        const partnerSocketId =
          session.userAId === userId ? session.socketBId : session.socketAId;
        io.to(partnerSocketId).emit('TYPING', { sessionId: session.id });
      } catch (err) {
        console.error('TYPING error:', err);
      }
    });

    socket.on('disconnect', async () => {
      try {
        clearQueueTimeoutTimer(userId);
        await removeFromQueue(userId);

        const session = await getSessionForUser(userId);
        if (session) {
          await endSessionAndNotify(io, session, 'partner_disconnected', userId);
        }
      } catch (err) {
        console.error('disconnect cleanup error:', err);
      }
    });
  });
}
