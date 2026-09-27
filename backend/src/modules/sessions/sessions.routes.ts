import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { asyncHandler } from '../../utils/asyncHandler';
import { listHistoryHandler } from './sessions.controller';

export const sessionsRouter = Router();

sessionsRouter.get('/history', authGuard, asyncHandler(listHistoryHandler));
