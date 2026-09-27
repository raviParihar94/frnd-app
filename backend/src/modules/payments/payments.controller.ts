import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/asyncHandler';
import { RECHARGE_PACKS } from './packs';
import {
  createOrderForUser,
  getTransactionHistory,
  getWalletBalance,
  handleWebhookEvent,
} from './payments.service';
import { verifyWebhookSignature } from './razorpay.client';

export async function listPacksHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ packs: RECHARGE_PACKS });
}

const createOrderSchema = z.object({ packId: z.string().min(1) });

export async function createOrderHandler(req: Request, res: Response): Promise<void> {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid request body', parsed.error.flatten());
  }

  const result = await createOrderForUser(req.user!.id, parsed.data.packId);
  res.status(201).json(result);
}

export async function balanceHandler(req: Request, res: Response): Promise<void> {
  const result = await getWalletBalance(req.user!.id);
  res.status(200).json(result);
}

export async function transactionsHandler(req: Request, res: Response): Promise<void> {
  const result = await getTransactionHistory(req.user!.id);
  res.status(200).json({ transactions: result });
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.header('x-razorpay-signature');
  if (!signature) {
    res.status(400).json({ error: 'Missing x-razorpay-signature header' });
    return;
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    // Would indicate app.ts wiring is wrong (JSON parser ran before this route).
    throw new ApiError(500, 'Webhook did not receive a raw body');
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  await handleWebhookEvent(event);
  res.status(200).json({ received: true });
}
