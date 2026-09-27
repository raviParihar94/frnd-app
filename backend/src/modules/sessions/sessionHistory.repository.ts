import { pool } from '../../config/db';
import { CallType } from '../matchmaking/types';

export interface SessionHistoryRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  call_type: CallType;
  language: string;
  status: 'active' | 'ended';
  end_reason: string | null;
  started_at: Date;
  ended_at: Date | null;
}

export async function recordSessionStart(params: {
  id: string;
  userAId: string;
  userBId: string;
  callType: CallType;
  language: string;
  startedAt: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO call_sessions (id, user_a_id, user_b_id, call_type, language, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6)
     ON CONFLICT (id) DO NOTHING`,
    [params.id, params.userAId, params.userBId, params.callType, params.language, params.startedAt]
  );
}

export async function recordSessionEnd(sessionId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE call_sessions
     SET status = 'ended', end_reason = $1, ended_at = now()
     WHERE id = $2 AND status = 'active'`,
    [reason, sessionId]
  );
}

export interface HistoryEntry {
  id: string;
  callType: CallType;
  language: string;
  status: 'active' | 'ended';
  endReason: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  partnerId: string;
  partnerNickname: string | null;
  partnerAvatarUrl: string | null;
}

export async function listHistoryForUser(userId: string, limit = 50): Promise<HistoryEntry[]> {
  const { rows } = await pool.query(
    `SELECT
       cs.id,
       cs.call_type,
       cs.language,
       cs.status,
       cs.end_reason,
       cs.started_at,
       cs.ended_at,
       CASE WHEN cs.ended_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at))::int
            ELSE NULL
       END AS duration_seconds,
       CASE WHEN cs.user_a_id = $1 THEN cs.user_b_id ELSE cs.user_a_id END AS partner_id,
       partner.nickname AS partner_nickname,
       partner.avatar_url AS partner_avatar_url
     FROM call_sessions cs
     JOIN users partner
       ON partner.id = CASE WHEN cs.user_a_id = $1 THEN cs.user_b_id ELSE cs.user_a_id END
     WHERE cs.user_a_id = $1 OR cs.user_b_id = $1
     ORDER BY cs.started_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    callType: r.call_type,
    language: r.language,
    status: r.status,
    endReason: r.end_reason,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    partnerId: r.partner_id,
    partnerNickname: r.partner_nickname,
    partnerAvatarUrl: r.partner_avatar_url,
  }));
}
