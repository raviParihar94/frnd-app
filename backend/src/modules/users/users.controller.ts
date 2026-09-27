import { Request, Response } from 'express';
import { z } from 'zod';
import { AVATAR_CATALOG, isValidAvatar } from '../../config/avatars';
import { SUPPORTED_LANGUAGES } from '../../config/languages';
import { ApiError } from '../../utils/asyncHandler';
import { findUserById, updateUserProfile, UserRecord } from './users.repository';

function serializeUser(user: UserRecord) {
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    gender: user.gender,
    languages: user.languages,
    tokenBalance: user.token_balance,
    // A profile isn't "complete" until they've picked a nickname and an
    // avatar — the frontend uses this to decide whether to show the
    // one-time profile-setup screen after login.
    profileComplete: Boolean(user.nickname && user.avatar_url),
    createdAt: user.created_at,
  };
}

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  const user = await findUserById(req.user!.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  res.status(200).json(serializeUser(user));
}

const updateProfileSchema = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  avatarUrl: z
    .string()
    .refine(isValidAvatar, { message: 'avatarUrl must be one of the provided avatar catalog options' })
    .optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  languages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1).max(SUPPORTED_LANGUAGES.length).optional(),
});

export async function updateMeHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid profile update', parsed.error.flatten());
  }

  if (Object.keys(parsed.data).length === 0) {
    throw new ApiError(400, 'No fields to update');
  }

  const updated = await updateUserProfile(req.user!.id, parsed.data);
  if (!updated) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json(serializeUser(updated));
}

export async function listAvatarsHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ avatars: AVATAR_CATALOG });
}
