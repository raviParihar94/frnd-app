import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { otpRequestLimiter, otpVerifyLimiter } from '../../middleware/rateLimiters';
import { refreshHandler, requestOtpHandler, verifyOtpHandler } from './auth.controller';

export const authRouter = Router();

authRouter.post('/otp/request', otpRequestLimiter, asyncHandler(requestOtpHandler));
authRouter.post('/otp/verify', otpVerifyLimiter, asyncHandler(verifyOtpHandler));
authRouter.post('/refresh', asyncHandler(refreshHandler));
