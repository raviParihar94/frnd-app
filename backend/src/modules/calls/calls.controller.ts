import { Request, Response } from 'express';
import { ApiError } from '../../utils/asyncHandler';
import { getSession, getSessionForUser } from '../matchmaking/session.repository';
import { generateRtcToken } from './agoraToken.service';

export async function issueRtcTokenHandler(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const userId = req.user!.id;

  const session = await getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found (it may have already ended)');
  }
  if (session.userAId !== userId && session.userBId !== userId) {
    // Never issue a token for a channel the caller isn't actually part of.
    throw new ApiError(403, 'You are not a participant in this session');
  }
  if (session.callType === 'text') {
    throw new ApiError(400, 'Agora tokens only apply to voice/video sessions');
  }

  const result = generateRtcToken(sessionId, userId);
  res.status(200).json({ ...result, callType: session.callType });
}

export async function currentSessionHandler(req: Request, res: Response): Promise<void> {
  const session = await getSessionForUser(req.user!.id);
  if (!session) {
    res.status(200).json({ session: null });
    return;
  }

  res.status(200).json({
    session: {
      id: session.id,
      callType: session.callType,
      language: session.language,
      startedAt: session.startedAt,
    },
  });
}
