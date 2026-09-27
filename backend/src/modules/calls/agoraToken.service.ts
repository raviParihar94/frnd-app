import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { env } from '../../config/env';
import { ApiError } from '../../utils/asyncHandler';

function getCredentials(): { appId: string; appCertificate: string } {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
    throw new ApiError(
      500,
      'Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE.'
    );
  }
  return { appId: env.AGORA_APP_ID, appCertificate: env.AGORA_APP_CERTIFICATE };
}

/**
 * Agora uids are 32-bit unsigned integers, but our user ids are UUID strings.
 * Derives a stable, low-collision-risk uid from a user id so the same user
 * always maps to the same numeric identity within a channel (rather than
 * using uid 0, which some Agora tooling treats as an "any uid" wildcard —
 * we want each participant to have their own distinct identity for the SDK's
 * remote-user-joined/left events to behave predictably).
 */
export function uidForUser(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  // Keep it within the signed-safe range and never 0.
  return (hash % 2147483646) + 1;
}

export interface RtcTokenResult {
  appId: string;
  channelName: string;
  uid: number;
  token: string;
  expiresInSeconds: number;
}

export function generateRtcToken(
  channelName: string,
  userId: string,
  expiresInSeconds: number = env.AGORA_TOKEN_EXPIRE_SECONDS
): RtcTokenResult {
  const { appId, appCertificate } = getCredentials();
  const uid = uidForUser(userId);

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    expiresInSeconds, // tokenExpire: seconds from now
    expiresInSeconds // privilegeExpire: seconds from now
  );

  if (!token) {
    // agora-token returns an empty string (rather than throwing) if
    // AGORA_APP_ID/AGORA_APP_CERTIFICATE aren't valid hex — which is the
    // real Agora format, so this only fires on genuinely malformed config.
    throw new ApiError(
      500,
      'Failed to generate Agora RTC token — check that AGORA_APP_ID and AGORA_APP_CERTIFICATE are valid (both should be the hex strings from your Agora console).'
    );
  }

  return { appId, channelName, uid, token, expiresInSeconds };
}
