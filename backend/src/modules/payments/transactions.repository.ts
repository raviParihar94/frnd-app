import { PoolClient } from 'pg';
import { pool } from '../../config/db';

export interface TransactionRecord {
  id: string;
  user_id: string;
  amount_inr: string;
  tokens_added: number;
  status: 'created' | 'pending' | 'success' | 'failed' | 'refunded';
  payment_gateway: string;
  payment_id: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  raw_webhook_payload: unknown;
  created_at: Date;
  updated_at: Date;
}

export async function createPendingTransaction(params: {
  userId: string;
  amountInr: number;
  tokensAdded: number;
}): Promise<TransactionRecord> {
  const { rows } = await pool.query<TransactionRecord>(
    `INSERT INTO transactions (user_id, amount_inr, tokens_added, status, payment_gateway)
     VALUES ($1, $2, $3, 'created', 'razorpay')
     RETURNING *`,
    [params.userId, params.amountInr, params.tokensAdded]
  );
  return rows[0];
}

export async function attachRazorpayOrderId(
  transactionId: string,
  razorpayOrderId: string
): Promise<void> {
  await pool.query(
    `UPDATE transactions
     SET razorpay_order_id = $1, status = 'pending', updated_at = now()
     WHERE id = $2`,
    [razorpayOrderId, transactionId]
  );
}

/**
 * Applies a webhook outcome atomically. Locks the transaction row with
 * SELECT ... FOR UPDATE, then — only on the first transition into a terminal
 * state — updates the transaction, credits the user's balance, and writes a
 * token-ledger entry, all inside one DB transaction.
 *
 * This is what makes the flow safe against Razorpay's at-least-once webhook
 * delivery and concurrent retries: a repeated `payment.captured` event for a
 * transaction already marked 'success' is a no-op, not a double credit.
 */
export async function applyPaymentOutcome(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  newStatus: 'success' | 'failed';
  rawPayload: unknown;
}): Promise<{ applied: boolean; alreadyProcessed: boolean; transactionFound: boolean }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<TransactionRecord>(
      `SELECT * FROM transactions WHERE razorpay_order_id = $1 FOR UPDATE`,
      [params.razorpayOrderId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { applied: false, alreadyProcessed: false, transactionFound: false };
    }

    const txn = rows[0];

    if (txn.status === 'success' || txn.status === 'failed') {
      // Already terminal — idempotent no-op for a retried webhook delivery.
      await client.query('COMMIT');
      return { applied: false, alreadyProcessed: true, transactionFound: true };
    }

    await client.query(
      `UPDATE transactions
       SET status = $1, razorpay_payment_id = $2, raw_webhook_payload = $3, updated_at = now()
       WHERE id = $4`,
      [params.newStatus, params.razorpayPaymentId, JSON.stringify(params.rawPayload), txn.id]
    );

    if (params.newStatus === 'success') {
      await client.query(
        `UPDATE users SET token_balance = token_balance + $1, updated_at = now() WHERE id = $2`,
        [txn.tokens_added, txn.user_id]
      );
      await client.query(
        `INSERT INTO token_ledgers (user_id, amount_deducted, reason, session_id)
         VALUES ($1, $2, 'recharge', $3)`,
        [txn.user_id, -txn.tokens_added, txn.razorpay_order_id ?? params.razorpayOrderId]
      );
    }

    await client.query('COMMIT');
    return { applied: true, alreadyProcessed: false, transactionFound: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findTransactionsForUser(userId: string): Promise<TransactionRecord[]> {
  const { rows } = await pool.query<TransactionRecord>(
    `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}
