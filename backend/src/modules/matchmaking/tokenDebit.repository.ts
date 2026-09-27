import { pool } from '../../config/db';
import { CallType } from './types';

export interface DebitResult {
  success: boolean;
  balances: Record<string, number>; // userId -> new balance (or current balance if failed)
  insufficientUserIds: string[];
}

const REASON_BY_CALL_TYPE: Record<CallType, string> = {
  text: 'text_chat',
  voice: 'voice_call',
  video: 'video_call',
};

/**
 * Debits `amountPerUser` tokens from both session participants in a single
 * DB transaction. Locks both user rows with SELECT ... FOR UPDATE, always in
 * a fixed (sorted-by-id) order to avoid deadlocking against a hypothetical
 * concurrent session sharing one of the same two users. If either user can't
 * afford the debit, nothing is deducted from either — this is what keeps a
 * call from partially billing one side and not the other.
 */
export async function debitSessionTokens(params: {
  sessionId: string;
  callType: CallType;
  userAId: string;
  userBId: string;
  amountPerUser: number;
}): Promise<DebitResult> {
  const orderedIds = [params.userAId, params.userBId].sort();
  const reason = REASON_BY_CALL_TYPE[params.callType];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string; token_balance: string }>(
      `SELECT id, token_balance FROM users WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [orderedIds]
    );

    const balanceMap = new Map(rows.map((r) => [r.id, Number(r.token_balance)]));
    const insufficientUserIds = orderedIds.filter(
      (id) => (balanceMap.get(id) ?? 0) < params.amountPerUser
    );

    if (insufficientUserIds.length > 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        balances: Object.fromEntries(balanceMap),
        insufficientUserIds,
      };
    }

    for (const id of orderedIds) {
      await client.query(
        `UPDATE users SET token_balance = token_balance - $1, updated_at = now() WHERE id = $2`,
        [params.amountPerUser, id]
      );
      await client.query(
        `INSERT INTO token_ledgers (user_id, amount_deducted, reason, session_id)
         VALUES ($1, $2, $3, $4)`,
        [id, params.amountPerUser, reason, params.sessionId]
      );
    }

    await client.query('COMMIT');

    const newBalances: Record<string, number> = {};
    for (const id of orderedIds) {
      newBalances[id] = (balanceMap.get(id) ?? 0) - params.amountPerUser;
    }

    return { success: true, balances: newBalances, insufficientUserIds: [] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
