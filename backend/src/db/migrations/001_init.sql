-- Phase 1: core tables — users, transactions, token_ledgers, otp_requests
-- Idempotent-ish: safe to re-run against a fresh DB.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(15) NOT NULL UNIQUE, -- E.164, e.g. +919876543210
    nickname        VARCHAR(30),
    avatar_url      TEXT,
    gender          VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    languages       TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'hi','en'}
    token_balance   BIGINT NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
    is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_inr            NUMERIC(10, 2) NOT NULL CHECK (amount_inr > 0),
    tokens_added          BIGINT NOT NULL CHECK (tokens_added > 0),
    status                VARCHAR(20) NOT NULL DEFAULT 'created'
                              CHECK (status IN ('created', 'pending', 'success', 'failed', 'refunded')),
    payment_gateway       VARCHAR(20) NOT NULL DEFAULT 'razorpay',
    payment_id            VARCHAR(100),      -- gateway payment/order id
    raw_webhook_payload   JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);

CREATE TABLE IF NOT EXISTS token_ledgers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_deducted  BIGINT NOT NULL, -- positive = debit, negative = credit/refund adjustment
    reason           VARCHAR(50) NOT NULL, -- e.g. 'text_chat', 'voice_call', 'video_call', 'recharge', 'refund'
    session_id        VARCHAR(100),         -- optional link to a call/chat session
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_ledgers_user_id ON token_ledgers(user_id);

-- OTP requests: required to make phone-OTP auth real rather than simulated.
CREATE TABLE IF NOT EXISTS otp_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(15) NOT NULL,
    otp_hash        VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    consumed        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_phone ON otp_requests(phone, created_at DESC);
