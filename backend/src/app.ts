import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { callsRouter } from './modules/calls/calls.routes';
import { paymentsRouter, paymentsWebhookRouter } from './modules/payments/payments.routes';
import { sessionsRouter } from './modules/sessions/sessions.routes';
import { usersRouter } from './modules/users/users.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));

  // Registered BEFORE express.json(): the webhook route needs the raw request
  // body for HMAC signature verification. Requests to other /api/payments/*
  // paths fall through (this router only handles POST /webhook) to the JSON
  // parser and the paymentsRouter mounted further down.
  app.use('/api/payments', paymentsWebhookRouter);

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/sessions', sessionsRouter);

  // Simple wallet/recharge-store UI (Phase 2 requirement) — a static page,
  // served straight from the API so there's no CORS setup needed for the demo.
  app.use(express.static(path.join(__dirname, '../public')));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
