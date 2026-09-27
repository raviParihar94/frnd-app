import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/asyncHandler';
import { refreshAccessToken, requestOtpForPhone, verifyOtpAndLogin } from './auth.service';

const requestOtpSchema = z.object({
  phone: z.string().min(8).max(16),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8).max(16),
  otp: z.string().min(4).max(8),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export async function requestOtpHandler(req: Request, res: Response): Promise<void> {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid request body', parsed.error.flatten());
  }

  await requestOtpForPhone(parsed.data.phone);
  res.status(200).json({ message: 'OTP sent successfully' });
}

export async function verifyOtpHandler(req: Request, res: Response): Promise<void> {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid request body', parsed.error.flatten());
  }

  const result = await verifyOtpAndLogin(parsed.data.phone, parsed.data.otp);
  res.status(200).json(result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid request body', parsed.error.flatten());
  }

  const result = await refreshAccessToken(parsed.data.refreshToken);
  res.status(200).json(result);
}
