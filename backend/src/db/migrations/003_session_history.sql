-- Phase 5: persistent session history. Redis (matchmaking module) only holds
-- a session while it's active; this table is the durable record used for the
-- "chat list" / history feature, written on session start and updated on end.

CREATE TABLE IF NOT EXISTS call_sessions (
    id            UUID PRIMARY KEY, -- same id as the Redis matchmaking session
    user_a_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type     VARCHAR(10) NOT NULL CHECK (call_type IN ('text', 'voice', 'video')),
    language      VARCHAR(10) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    end_reason    VARCHAR(30),
    started_at    TIMESTAMPTZ NOT NULL,
    ended_at      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_user_a ON call_sessions(user_a_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_user_b ON call_sessions(user_b_id, started_at DESC);
