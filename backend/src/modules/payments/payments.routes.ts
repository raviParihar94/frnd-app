import express, { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  balanceHandler,
  createOrderHandler,
  listPacksHandler,
  transactionsHandler,
  webhookHandler,
} from './payments.controller';

/**
 * Mounted BEFORE the global express.json() parser in app.ts. Razorpay's HMAC
 * signature is computed over the exact raw request bytes, so this route must
 * receive an unparsed Buffer, not JSON already decoded/re-encoded by express.json().
 */
export const paymentsWebhookRouter = Router();
paymentsWebhookRouter.post(
  '/webhook',
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(webhookHandler)
);

/** Mounted AFTER express.json() — ordinary authenticated JSON API routes. */
export const paymentsRouter = Router();
paymentsRouter.get('/packs', authGuard, asyncHandler(listPacksHandler));
paymentsRouter.post('/orders', authGuard, asyncHandler(createOrderHandler));
paymentsRouter.get('/balance', authGuard, asyncHandler(balanceHandler));
paymentsRouter.get('/transactions', authGuard, asyncHandler(transactionsHandler));
