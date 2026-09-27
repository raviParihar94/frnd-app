import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { asyncHandler } from '../../utils/asyncHandler';
import { getMeHandler, listAvatarsHandler, updateMeHandler } from './users.controller';

export const usersRouter = Router();

usersRouter.get('/me', authGuard, asyncHandler(getMeHandler));
usersRouter.patch('/me', authGuard, asyncHandler(updateMeHandler));
usersRouter.get('/avatars', authGuard, asyncHandler(listAvatarsHandler));
