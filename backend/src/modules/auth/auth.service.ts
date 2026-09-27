import { ApiError } from '../../utils/asyncHandler';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { findOrCreateUserByPhone, findUserById } from '../users/users.repository';
import { requestOtp, verifyOtp } from './otp.service';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

function assertValidPhone(phone: string): void {
  if (!E164_REGEX.test(phone)) {
    throw new ApiError(400, 'Phone number must be in E.164 format, e.g. +919876543210');
  }
}

export async function requestOtpForPhone(phone: string): Promise<void> {
  assertValidPhone(phone);
  await requestOtp(phone);
}

export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user: {
    id: string;
    phone: string;
    nickname: string | null;
    tokenBalance: string;
  };
}

export async function verifyOtpAndLogin(phone: string, otp: string): Promise<VerifyOtpResult> {
  assertValidPhone(phone);
  await verifyOtp(phone, otp);

  const { user, isNewUser } = await findOrCreateUserByPhone(phone);

  const accessToken = signAccessToken({ sub: user.id, phone: user.phone });
  const refreshToken = signRefreshToken({ sub: user.id });

  return {
    accessToken,
    refreshToken,
    isNewUser,
    user: {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      tokenBalance: user.token_balance,
    },
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await findUserById(payload.sub);
  if (!user || user.is_banned) {
    throw new ApiError(401, 'User not found or banned');
  }

  const accessToken = signAccessToken({ sub: user.id, phone: user.phone });
  return { accessToken };
}
