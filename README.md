# Real-Time Social Matching Platform (India) — Backend

A low-latency, real-time random-matching platform (text / voice / video) with an
INR token economy, built incrementally in 5 phases. This repo now implements
all five:

- **Phase 1** — DB schema + Phone-OTP auth
- **Phase 2** — Razorpay payments + wallet UI
- **Phase 3** — Redis-backed matchmaking queues, Socket.io signaling, and the
  per-minute token ticker
- **Phase 4** — Agora voice/video calling and the real call screen UI
- **Phase 5** — the unified app: login → profile setup → home (chat / history
  / wallet / profile tabs) → call screen, plus persistent chat/session history

## Try it now

```bash
docker compose up --build
```
```bash
open http://localhost:4000/
```
That's the real app now — login, set up a profile, start a chat, see your
history, manage your wallet, all in one place. (`wallet.html`, `match.html`,
and `call.html` from earlier phases still work too, as standalone
single-feature pages / dev tools — see "Repo layout" below.)

## Proposed Architecture (full system, for context)

```
                          ┌─────────────────────────┐
                          │        Clients           │
                          │  React/Next.js (web)     │
                          │  Flutter (mobile)        │
                          └────────────┬─────────────┘
                                       │ HTTPS / WSS
                     ┌─────────────────┴──────────────────┐
                     │            API Gateway               │
                     │      (Express/NestJS, Node.js)       │
                     └───────┬───────────────┬─────────────┘
                             │               │
                 ┌───────────┘               └───────────┐
                 ▼                                        ▼
      ┌─────────────────────┐                 ┌───────────────────────┐
      │   REST API layer     │                 │   Socket.io Gateway    │
      │ - Auth (OTP/JWT)      │                 │ - Matchmaking events   │
      │ - Wallet/Recharge     │                 │ - Chat messages        │
      │ - Profile             │                 │ - Call signaling       │
      │ - Agora token issuance │                 │                        │
      │ - Session history      │                 │                        │
      └──────────┬───────────┘                 └───────────┬────────────┘
                 │                                          │
                 ▼                                          ▼
      ┌─────────────────────┐                 ┌───────────────────────┐
      │     PostgreSQL        │                 │        Redis           │
      │ users, transactions,  │                 │ matchmaking queues,    │
      │ token_ledgers, otp,    │                 │ active session state,  │
      │ call_sessions          │                 │ distributed locks      │
      └─────────────────────┘                 └───────────────────────┘

      External: Razorpay/Cashfree (payments) · Agora (media) · MSG91/Firebase (OTP SMS)
```

## Repo layout

```
backend/
  public/
    index.html                the real app: login → profile → home tabs → call screen (Phase 5)
    wallet.html                 standalone wallet/recharge demo (Phase 2)
    match.html                   matchmaking event-log test harness (Phase 3, dev/QA tool)
    call.html                     standalone call-screen demo (Phase 4)
  src/
    config/                       env loading, DB pool, Redis client, economy rates,
                                   shared language list, avatar catalog
    db/
      migrations/                 raw SQL migrations
    modules/
      auth/                       OTP request/verify, JWT issue/refresh
      users/                       profile get/update, avatar catalog
      payments/                    Razorpay order creation, HMAC webhook, wallet balance/history
      matchmaking/                  Redis queues, sessions, Socket.io gateway, token ticker, text chat
      calls/                        Agora RTC token issuance, current-session lookup
      sessions/                     persistent chat/session history
    middleware/                     error handler, rate limiter, auth guard
    utils/                          jwt helpers, otp helpers, async wrapper
    app.ts                          express app wiring
    server.ts                       entrypoint (http server + Socket.io + DB/Redis checks)
  Dockerfile
  docker-entrypoint.sh
  .env.example
  package.json
  tsconfig.json
docker-compose.yml
```

## Phase 1 scope

1. **PostgreSQL schema** — `users`, `transactions`, `token_ledgers`, plus an
   `otp_requests` table needed to make OTP verification real (hashed OTP,
   expiry, attempt counting) rather than a placeholder.
2. **Phone OTP auth API** — `POST /api/auth/otp/request`, `POST
   /api/auth/otp/verify` (issues JWT access + refresh tokens), `POST
   /api/auth/refresh`.

## Phase 2 scope

1. **Recharge catalog** — the three micro-packs from the spec (₹10→20,
   ₹49→110, ₹199→500), served from `GET /api/payments/packs`.
2. **Razorpay order creation** — `POST /api/payments/orders`.
3. **HMAC-verified webhook** — `POST /api/payments/webhook`, verified against
   the *raw* request body.
4. **Atomic, replay-safe crediting** — locks the transaction row, credits
   `token_balance` and writes a `token_ledgers` entry in one DB transaction.
5. **Wallet endpoints + UI** — `GET /api/payments/balance`, `GET
   /api/payments/transactions`.

## Phase 3 scope

1. **Redis-backed matchmaking queues**, segregated by call type *and*
   language, matched via an atomic Lua-script pop.
2. **Socket.io gateway** — `JOIN_QUEUE` / `QUEUE_JOINED` / `MATCH_FOUND` /
   `QUEUE_TIMEOUT` / `LEAVE_QUEUE` / `SKIP_USER` / `END_CALL`, plus
   `CHAT_MESSAGE` / `TYPING` for text sessions, plus disconnect cleanup.
3. **Per-minute token ticker** — atomically debits both session participants;
   if either can't afford it, neither is charged and the session force-ends
   for both, with a `LOW_BALANCE_WARNING` fired a tick ahead.

## Phase 4 scope

1. **Agora RTC token issuance** — `GET /api/calls/:sessionId/token`,
   participant-only, voice/video-only, with a stable per-user numeric Agora
   uid.
2. **`GET /api/calls/session`** — resume support after a page refresh.
3. **The call screen** — voice/video via Agora Web SDK, mute/video-toggle/
   skip/end controls, and the low-balance warning modal with 1-tap recharge.

## Phase 5 scope (this delivery)

You asked for this phase to cover UI+backend integration, login, profile,
chat list, and session management — here's what that became:

1. **`backend/public/index.html`** — one cohesive app replacing the need to
   jump between separate demo pages:
   - **Login** — the same OTP flow as before, now with token persistence
     (`localStorage`) across page reloads and automatic access-token refresh
     on a 401 (verified directly: a valid refresh token returns a fresh
     access token, an invalid one correctly 401s).
   - **Profile setup** — a one-time screen for brand-new users (avatar grid
     from a curated emoji catalog, nickname, gender, languages spoken),
     gating entry to the rest of the app until a profile is complete.
   - **Home**, with a bottom tab bar:
     - **Chat** — pick call type + language, join the queue, get matched
       (identical to Phase 3/4's flow, just integrated).
     - **History** — the new **chat list**: every past session, who it was
       with (nickname + avatar), call type, language, how long ago, and
       duration or end reason.
     - **Wallet** — balance + recharge packs (Phase 2's flow, embedded).
     - **Profile** — view/edit your own avatar, nickname, gender, languages;
       log out.
   - **Call screen** — voice/video via Agora (Phase 4), *and*, new this
     phase, an actual **text chat UI** (message bubbles + typing indicator)
     for `text`-type matches, using the `CHAT_MESSAGE`/`TYPING` Socket.io
     events.
2. **Profile management backend** — `PATCH /api/users/me` (nickname, avatar,
   gender, languages, validated against the real avatar/language catalogs —
   an invalid avatar id is rejected with a 400, verified directly) and `GET
   /api/users/avatars`. `GET /api/users/me` now also reports
   `profileComplete`, which is what the frontend uses to decide whether to
   show the profile-setup screen.
3. **Persistent session history** — a new `call_sessions` table (migration
   `003_session_history.sql`), written when a match is created and updated
   whenever it ends (whatever the reason — manual, skipped, disconnected, or
   insufficient balance — all of these already flow through one function in
   the matchmaking gateway, so history recording only needed to hook into
   that one place). `GET /api/sessions/history` returns each entry from the
   *requesting* user's point of view (i.e. "partner" always means "the other
   person"), with computed duration. Verified directly: matched two real
   users, ended the call, and confirmed each side's `/api/sessions/history`
   correctly shows the other person as the partner with the right duration
   and end reason.

**Verified this phase**: the full profile lifecycle (new user →
`profileComplete: false` → avatar-catalog fetch → invalid-avatar rejection →
valid update → `profileComplete: true`), a real two-user voice session
producing matching history entries on both sides, a real text session with
actual `CHAT_MESSAGE`/`TYPING` delivery between two connected sockets, and
the access-token refresh path (success and failure). The frontend's HTML/JS
was extracted and syntax-checked, but — as with Phase 4 — I don't have a
browser in this environment, so the actual in-browser experience (tab
switching, the avatar grid, the call screen chrome) needs your eyes on it.

**Scope notes / not yet done**: report/block during a call, and deeper
rate-limiting/anti-fraud hardening — these were in the *original* Phase 5
spec but not in what you asked me to build this time. Still on the table
whenever you want them. Also, `call.html`/`match.html`/`wallet.html` weren't
deleted or merged into `index.html`'s code — they're independent files that
happen to duplicate some of its logic; fine as standalone dev tools, but if
you'd rather not maintain three variants of the same call-joining code, say
so and I'll consolidate down to just `index.html`.

## Running it in Docker (recommended)

Requires Docker Desktop (Mac/Windows) or Docker Engine + Compose plugin (Linux).

```bash
docker compose up --build
```

Brings up three containers: **postgres**, **redis**, and **backend** (waits
for both to be healthy, runs all three migrations, starts the server).

```bash
curl http://localhost:4000/health
# {"status":"ok"}

open http://localhost:4000/          # the real app (Phase 5)
open http://localhost:4000/wallet.html
open http://localhost:4000/match.html
open http://localhost:4000/call.html

docker compose logs -f backend       # OTPs + ticker output land here in dev
```

Fill in `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` and `RAZORPAY_KEY_ID`/
`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` in `docker-compose.yml` for
real calls and real payments; everything else works without them (clear
errors instead of silent/broken behavior).

Useful commands:

```bash
docker compose up -d
docker compose down
docker compose down -v             # wipes Postgres + Redis volumes too
docker compose logs -f backend
docker compose exec postgres psql -U postgres -d frnd_clone
docker compose exec redis redis-cli
```

`docker-compose.yml` sets working dev defaults (JWT secrets, token rates)
directly as environment variables so it runs with zero setup. **Change those
secrets before this ever runs anywhere but your laptop.**

## Running it without Docker

```bash
cd backend
cp .env.example .env       # fill in DB/Redis creds + JWT secrets (+ Razorpay/Agora keys)
npm install
npm run migrate            # applies db/migrations/*.sql (requires Postgres running)
npm run dev                # requires Redis running too
```

## Next phase (not built yet — awaiting your go-ahead)

- Report/block during a call, and a broader rate-limiting/anti-fraud pass —
  the remaining items from the original Phase 5 spec that weren't part of
  this round's request.
