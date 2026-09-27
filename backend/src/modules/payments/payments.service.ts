import { env } from '../../config/env';
import { ApiError } from '../../utils/asyncHandler';
import { findUserById } from '../users/users.repository';
import { findPackById } from './packs';
import { createRazorpayOrder } from './razorpay.client';
import {
  applyPaymentOutcome,
  attachRazorpayOrderId,
  createPendingTransaction,
  findTransactionsForUser,
} from './transactions.repository';

export async function createOrderForUser(userId: string, packId: string) {
  const pack = findPackById(packId);
  if (!pack) {
    throw new ApiError(400, `Unknown pack id: ${packId}`);
  }

  // Row created up front (status 'created') so we have a durable record even
  // if the Razorpay API call below fails.
  const txn = await createPendingTransaction({
    userId,
    amountInr: pack.amountInr,
    tokensAdded: pack.tokens,
  });

  const amountPaise = Math.round(pack.amountInr * 100);

  const order = await createRazorpayOrder({
    amountPaise,
    currency: 'INR',
    receipt: txn.id,
    notes: { userId, packId },
  });

  await attachRazorpayOrderId(txn.id, order.id);

  return {
    transactionId: txn.id,
    razorpayOrderId: order.id,
    amountPaise,
    currency: 'INR',
    keyId: env.RAZORPAY_KEY_ID as string, // present: createRazorpayOrder already required it
    pack,
  };
}

interface RazorpayWebhookEvent {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
      };
    };
  };
}

export async function handleWebhookEvent(event: RazorpayWebhookEvent): Promise<void> {
  const eventType = event.event;
  const paymentEntity = event.payload?.payment?.entity;

  if (!paymentEntity?.order_id) {
    // Not a payment event we act on (e.g. a refund or order-level event).
    return;
  }

  const razorpayOrderId = paymentEntity.order_id;
  const razorpayPaymentId = paymentEntity.id ?? null;

  if (eventType === 'payment.captured') {
    await applyPaymentOutcome({
      razorpayOrderId,
      razorpayPaymentId,
      newStatus: 'success',
      rawPayload: event,
    });
  } else if (eventType === 'payment.failed') {
    await applyPaymentOutcome({
      razorpayOrderId,
      razorpayPaymentId,
      newStatus: 'failed',
      rawPayload: event,
    });
  }
  // Other event types (order.paid, refund.*, etc.) are intentionally ignored —
  // payment.captured is the authoritative signal for crediting tokens.
}

export async function getWalletBalance(userId: string): Promise<{ tokenBalance: string }> {
  const user = await findUserById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return { tokenBalance: user.token_balance };
}

export async function getTransactionHistory(userId: string) {
  const txns = await findTransactionsForUser(userId);
  return txns.map((t) => ({
    id: t.id,
    amountInr: t.amount_inr,
    tokensAdded: t.tokens_added,
    status: t.status,
    createdAt: t.created_at,
  }));
}
