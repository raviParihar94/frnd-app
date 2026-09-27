import { env } from './env';
import { CallType } from '../modules/matchmaking/types';

export function getTokensPerMinute(callType: CallType): number {
  switch (callType) {
    case 'text':
      return env.TEXT_CHAT_TOKENS_PER_MIN;
    case 'voice':
      return env.VOICE_CALL_TOKENS_PER_MIN;
    case 'video':
      return env.VIDEO_CALL_TOKENS_PER_MIN;
  }
}
