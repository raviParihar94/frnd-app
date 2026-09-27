import crypto from 'crypto';
import { env } from '../../config/env';
import { ApiError } from '../../utils/asyncHandler';

function getCredentials(): { keyId: string; keySecret: string } {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(
      500,
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { keyId, keySecret } = getCredentials();
  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(502, `Razorpay order creation failed (${res.status}): ${body}`);
  }

  return (await res.json()) as RazorpayOrder;
}

/**
 * Verifies Razorpay's `x-razorpay-signature` header: HMAC-SHA256 of the exact
 * raw request bytes, keyed with the webhook secret configured in the Razorpay
 * dashboard. Must be called with the untouched raw body (see payments.routes.ts,
 * which registers this route before the global JSON body parser).
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiError(500, 'Razorpay is not configured. Set RAZORPAY_WEBHOOK_SECRET.');
  }

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');

  // Lengths must match before timingSafeEqual, which throws on mismatched lengths.
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
