import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { asyncHandler } from '../../utils/asyncHandler';
import { currentSessionHandler, issueRtcTokenHandler } from './calls.controller';

export const callsRouter = Router();

callsRouter.get('/session', authGuard, asyncHandler(currentSessionHandler));
callsRouter.get('/:sessionId/token', authGuard, asyncHandler(issueRtcTokenHandler));
