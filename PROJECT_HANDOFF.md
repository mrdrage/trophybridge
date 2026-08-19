# TrophyBridge Project Handoff

Last updated: 2026-08-19

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, keeps base-game trophies separate from additional groups, and will expose a stable read-only public API that a fresh AI conversation can inspect without screenshots or manual trophy lists.

Pilot account: `mrdrage2`.
Pilot game: Final Fantasy XVI on PS5.
Preferred trophy locale: `it-IT`.
Repository: `mrdrage/trophybridge`.

## MVP definition of done

1. TrophyBridge owner signs in.
2. Owner connects PSN securely.
3. Stable PSN identity is verified.
4. Library sync discovers Final Fantasy XVI.
5. Game sync imports groups, trophy metadata, and player state.
6. Platinum progress excludes additional trophy groups.
7. A revocable public share link is generated.
8. A fresh ChatGPT conversation can read current progress.
9. A newly earned trophy is detected on the next sync.
10. The updated state is visible to the AI client.

## Stack

TypeScript, Next.js App Router, Node 24, pnpm 11.20.0, PostgreSQL/Supabase, Supabase Auth + SSR, GitHub OAuth, `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, SQL invariant tests, Playwright, GitHub Actions, Vercel planned.

## Completed milestones

### M0 Foundation

Application skeleton, quality gates, public health endpoint, CI, documentation, handoff discipline.

### M1 Domain Model

Migrations create `psn_accounts`, `games`, `account_games`, `trophy_groups`, `trophies`, `player_trophies`, `sync_runs`, `progress_events`, `share_links`, and `sync_targets`. PostgreSQL protects provider identity, trophy identity, one base group, cross-game/account integrity, monotonic earned state, trusted timestamps, progress ranges, and event deduplication.

### M2 PSN Provider

`PsnApiProvider` provides title/group/trophy/user-trophy reads with pagination, PS5 `trophy2` and legacy `trophy`, runtime validation, stable errors, locale headers, sanitized fixtures, and conservative numeric progress semantics.

### M3 Authentication

Implemented files include:

```text
proxy.ts
lib/auth/require-user.ts
lib/config/server.ts
lib/supabase/server.ts
lib/supabase/admin.ts
lib/supabase/proxy.ts
lib/crypto/token-encryption.ts
lib/psn/auth-client.ts
lib/psn/auth-repository.ts
lib/psn/connection-errors.ts
lib/psn/connection-service.ts
lib/psn/runtime.ts
app/auth/login/*
app/auth/callback/route.ts
app/dashboard/*
app/api/private/v1/psn/{connect,status,refresh,disconnect}/*
supabase/migrations/20260819133000_m3_authentication.sql
supabase/migrations/20260819134000_m3_database_hardening.sql
```

Authentication lifecycle:

```text
GitHub OAuth -> Supabase Auth owner session

NPSSO (transient)
   -> PSN access code
   -> access + refresh tokens
   -> exact Online ID search
   -> stable accountId
   -> getProfileFromAccountId
   -> require isMe=true
   -> discard NPSSO
   -> keep access token only in runtime
   -> AES-256-GCM encrypt refresh token
   -> server-only psn_credentials
```

Refresh decrypts the durable token server-side, exchanges it, supports refresh-token rotation, re-encrypts under the active key, and returns only short-lived authorization to `PsnApiProvider` construction.

`it-IT` is persisted as `preferred_locale` and injected into `PsnApiProvider`.

Browser roles can read only their own non-secret `psn_accounts` metadata. Browser roles cannot read `psn_credentials` at all. v0.1 supports one PSN connection per TrophyBridge owner.

Connection states are `connected`, `refreshing`, `reauth_required`, and `error`. Disconnect removes the credential but preserves factual trophy history.

CI uses fake auth calls, fake tokens, fake encryption keys, and PostgreSQL fixtures. It never calls PSN.

## Real Supabase project state

A real Supabase project is connected and healthy in `eu-west-3` (project ref `aecehligohfsjqbgoeeo`). The following migrations have been applied successfully:

```text
m1_domain_model
m1_integrity_refinements
m3_authentication
m3_database_hardening
```

The M3 hardening migration changes the owner RLS policy to use `(select auth.uid())` and adds covering indexes for composite foreign keys detected by the Supabase performance advisor.

Post-migration advisor status:

- security: only informational `RLS Enabled No Policy` notices remain on tables that intentionally use deny-by-default/server-only access;
- performance: missing-FK-index and `auth.uid()` init-plan warnings are resolved; remaining notices are unused-index informational messages expected while the database is new and empty.

The project URL and publishable key are available through the connected Supabase project. Secret/service-role values are intentionally not written to Git, documentation, or chat.

## Live activation still required

M3 code and database schema are complete. Before the first live PSN smoke test, external secrets/configuration still need to be supplied:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TOKEN_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY_VERSION=1
PSN_TROPHY_LOCALE=it-IT
APP_URL
```

GitHub OAuth must be enabled in Supabase Auth. Current official Supabase flow requires a GitHub OAuth App whose authorization callback URL is the Supabase Auth callback (`https://<project-ref>.supabase.co/auth/v1/callback`), then the GitHub client ID/secret are saved in Supabase Auth provider settings. The app's own `/auth/callback` must be in the Supabase redirect allow list for the PKCE return flow.

Never paste NPSSO, OAuth client secrets, service-role keys, refresh/access tokens, or the TrophyBridge encryption key into ChatGPT, GitHub issues, commits, logs, screenshots, or documentation.

Once TrophyBridge is running with deployment secrets, the owner enters NPSSO only inside the private TrophyBridge dashboard. A successful real connection is the live smoke verification before M4 imports the real game library.

## M3/M4 boundary

M4 must obtain authenticated PSN access through:

```text
PsnConnectionService.createProviderForOwner(ownerUserId)
```

M4 must not decrypt credentials directly. Library sync remains lightweight: import title identity, title name, platforms, icon, aggregate progress/counts, hidden flag, and last-update data. Detailed group/trophy hydration remains M5.

## Public API plan

Version prefix: `/api/public/v1`.

Planned:

```text
/share/{token}
/share/{token}/games
/share/{token}/games/{gameId}
/share/{token}/games/{gameId}/trophies
/share/{token}/games/{gameId}/ai-context
```

Public output is allowlist-based and excludes all authentication material.

## Roadmap

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication implementation and real Supabase schema
- ⏳ M3 live OAuth/PSN owner smoke after deployment secrets are configured
- M4 Library Sync
- M5 Trophy Sync
- M6 Progress Events
- M7 Public Share
- M8 AI Context
- M9 Dashboard
- M10 Hardening

## Documentation map

- `README.md`: overview/status
- `docs/ARCHITECTURE.md`: system boundaries
- `docs/API.md`: public API contract
- `docs/DATA_MODEL.md`: factual persistence model
- `docs/SECURITY.md`: security model
- `docs/PSN_INTEGRATION.md`: provider/auth boundary
- `docs/decisions/`: ADRs
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity for a fresh development chat
