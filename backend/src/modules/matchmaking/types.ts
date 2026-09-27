import { Language, SUPPORTED_LANGUAGES } from '../../config/languages';

export type CallType = 'text' | 'voice' | 'video';

export { Language, SUPPORTED_LANGUAGES };

export interface QueueEntry {
  userId: string;
  socketId: string;
}

export type SessionEndReason =
  | 'skipped'
  | 'manual'
  | 'partner_disconnected'
  | 'insufficient_balance';

export interface MatchSession {
  id: string;
  callType: CallType;
  language: Language;
  userAId: string;
  userBId: string;
  socketAId: string;
  socketBId: string;
  startedAt: number; // epoch ms
}
