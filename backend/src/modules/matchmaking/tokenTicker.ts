import { Server } from 'socket.io';
import { env } from '../../config/env';
import { getTokensPerMinute } from '../../config/economy';
import { getAllActiveSessionIds, getSession } from './session.repository';
import { debitSessionTokens } from './tokenDebit.repository';
import { endSessionAndNotify } from './matchmaking.gateway';

/**
 * Walks every active session and deducts one minute's worth of tokens from
 * both participants, atomically. A session that can't afford the debit is
 * ended immediately (both sides notified) rather than left running unpaid.
 *
 * Runs on a fixed interval (TOKEN_TICK_INTERVAL_SECONDS, default 60s) rather
 * than per-session timers — simple, and correct as long as a single backend
 * instance owns the sessions set (see README's Phase-3 scaling note).
 */
export function startTokenTicker(io: Server): NodeJS.Timeout {
  const intervalMs = env.TOKEN_TICK_INTERVAL_SECONDS * 1000;

  return setInterval(async () => {
    let sessionIds: string[];
    try {
      sessionIds = await getAllActiveSessionIds();
    } catch (err) {
      console.error('Token ticker: failed to list active sessions:', err);
      return;
    }

    for (const sessionId of sessionIds) {
      try {
        await tickOneSession(io, sessionId);
      } catch (err) {
        console.error(`Token ticker: error processing session ${sessionId}:`, err);
      }
    }
  }, intervalMs);
}

async function tickOneSession(io: Server, sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return; // already ended between listing and processing

  const rate = getTokensPerMinute(session.callType);
  if (rate <= 0) return; // free call type, nothing to deduct

  const result = await debitSessionTokens({
    sessionId: session.id,
    callType: session.callType,
    userAId: session.userAId,
    userBId: session.userBId,
    amountPerUser: rate,
  });

  if (!result.success) {
    await endSessionAndNotify(io, session, 'insufficient_balance');
    return;
  }

  const balanceA = result.balances[session.userAId];
  const balanceB = result.balances[session.userBId];

  io.to(session.socketAId).emit('TOKENS_DEDUCTED', {
    sessionId: session.id,
    amount: rate,
    balance: balanceA,
  });
  io.to(session.socketBId).emit('TOKENS_DEDUCTED', {
    sessionId: session.id,
    amount: rate,
    balance: balanceB,
  });

  // Warn a side that can't afford the *next* deduction. With a 60s tick this
  // gives up to a full interval of lead time before the call is force-ended;
  // Phase 4's call UI is expected to show this as the low-balance modal.
  if (balanceA < rate) {
    io.to(session.socketAId).emit('LOW_BALANCE_WARNING', {
      sessionId: session.id,
      balance: balanceA,
      tokensNeededPerMinute: rate,
    });
  }
  if (balanceB < rate) {
    io.to(session.socketBId).emit('LOW_BALANCE_WARNING', {
      sessionId: session.id,
      balance: balanceB,
      tokensNeededPerMinute: rate,
    });
  }
}
