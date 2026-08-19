# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, separates base-game progress from additional trophy groups, and is being built to expose a stable read-only API that an AI assistant can use to guide a player toward a platinum.

> Status: **M4 · Library Sync complete**. The production Supabase schema includes the M4 persistence model. The first real library import still requires the owner to complete the live GitHub OAuth + PSN connection flow. The next implementation milestone is **M5 · Trophy Sync**.

## MVP goal

The first release is complete when a user can sign in, connect a PSN account, synchronize a game such as Final Fantasy XVI, expose a revocable public share link, and let a fresh AI conversation understand current platinum progress without screenshots or manual trophy lists.

## Architecture

```text
GitHub OAuth -> Supabase Auth
                    |
                    v
User -> private TrophyBridge dashboard -> transient NPSSO bootstrap
                                      |
                                      v
                              PSN authorization
                                      |
                              encrypted refresh token
                                      |
                                      v
PlayStation Network -> PsnApiProvider -> PsnProvider -> TrophyBridge Core
                                                        |
                                                        v
                                                   PostgreSQL
                                                    /      \
                                             Dashboard    Public API
                                                            |
                                                            v
                                                           AI
```

## Core principles

- Secrets never enter the public API or repository.
- NPSSO is bootstrap-only and is never persisted.
- PSN access tokens are short-lived runtime values and are never persisted.
- The durable PSN refresh token is encrypted server-side with AES-256-GCM, account-bound authenticated data, and key versioning.
- Application code depends on `PsnProvider`, not raw `psn-api` payloads.
- External provider payloads are runtime-validated.
- Base-game and additional trophy groups are structurally separated.
- Unsupported provider data stays `null`/unknown rather than being invented.
- Trophy state and aggregate library counters do not regress on later partial/upstream responses.
- Public sharing will be read-only, revocable, non-indexed, and token based.
- **Operating-cost target is €0/month.** Synchronization must throttle or stop before requiring paid infrastructure.

## Stack

- TypeScript
- Next.js App Router and `proxy.ts`
- Node.js 24 recommended
- pnpm 11.20.0
- PostgreSQL via Supabase Free
- Supabase Auth + `@supabase/ssr`
- GitHub OAuth for TrophyBridge sign-in
- `psn-api` 2.18.1 behind `PsnApiProvider`
- AES-256-GCM through Node.js `crypto`
- Zod
- Vitest
- Playwright
- GitHub Actions on the public repository
- Vercel Hobby planned for deployment

## Local development

Requirements: Node.js 22.13+ and pnpm 11.20.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Port `3000` remains the framework/CI default. When another local project uses it, TrophyBridge can be started on its reserved local development port with:

```bash
pnpm dev:local
```

which serves `http://localhost:3001`.

Application gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Database invariant suite:

```bash
DATABASE_URL=postgresql://... pnpm test:db
```

## Environment contract

Required for live authentication:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TOKEN_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY_VERSION
APP_URL
```

Optional during encryption-key rotation:

```text
TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON
```

Trophy metadata locale defaults to:

```text
PSN_TROPHY_LOCALE=it-IT
```

M4 zero-cost library-sync guardrails default to:

```text
LIBRARY_SYNC_MIN_INTERVAL_SECONDS=3600
LIBRARY_SYNC_MAX_GAMES=2000
LIBRARY_SYNC_STALE_AFTER_SECONDS=600
```

The encryption key must decode from base64 to exactly 32 bytes. Real values belong only in local/deployment secret stores, never in Git.

## Authentication flow

1. The TrophyBridge user signs in through GitHub OAuth backed by Supabase Auth.
2. An authenticated private dashboard accepts the PSN Online ID and NPSSO.
3. The server exchanges NPSSO for PlayStation tokens.
4. TrophyBridge resolves the exact Online ID and verifies the returned PSN profile is the authenticated account (`isMe=true`).
5. NPSSO is discarded.
6. The refresh token is encrypted and persisted server-side; the access token remains in memory only.
7. Later operations decrypt the refresh token, obtain a new short-lived access token, re-encrypt any rotated refresh token, and construct `PsnApiProvider` with the saved locale.
8. Disconnect removes the credential without deleting normalized factual state.

## M4 library synchronization

M4 performs a lightweight, manual library import. It deliberately does **not** fetch individual trophy metadata or player-trophy rows yet; those belong to M5.

Flow:

```text
Authenticated owner
  -> POST /api/private/v1/library/sync
  -> PsnConnectionService.createProviderForOwner(ownerUserId)
  -> PsnProvider.getGames()
  -> bounded atomic PostgreSQL snapshot persistence
  -> lightweight dashboard overview
```

Persistence is conservative:

- game identity is `(np_communication_id, np_service_name)`;
- missing titles in a later PSN response are not deleted;
- aggregate progress/trophy counters do not regress;
- title/platform/icon/hidden metadata may update;
- only one library sync may run for an account at a time;
- stale runs are recoverable;
- no scheduled/background library polling exists in M4.

Private routes now include:

```text
POST /api/private/v1/psn/connect
GET  /api/private/v1/psn/status
POST /api/private/v1/psn/refresh
POST /api/private/v1/psn/disconnect
POST /api/private/v1/library/sync
```

All private responses are non-cacheable.

## Zero-cost operating envelope

TrophyBridge treats **€0/month** as an architecture requirement, not a best-effort preference. M4 therefore uses manual synchronization, a one-hour default cooldown, a 2,000-title hard ceiling in both application and PostgreSQL persistence, bounded dashboard reads, upstream image URLs instead of mirrored image storage, and no cron/background polling.

If a future feature would require a paid tier, it must first be redesigned to throttle, degrade gracefully, or stop. Details and verification rules live in [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md) and ADR 0011.

## Development roadmap

- ✅ **M0 Foundation**: project skeleton, CI, tests, documentation.
- ✅ **M1 Domain Model**: PostgreSQL schema, constraints, RLS, and database invariant tests.
- ✅ **M2 PSN Provider**: mapping, pagination, validation, fixtures, error normalization, and real adapter.
- ✅ **M3 Authentication**: Supabase SSR auth, PSN connection lifecycle, encrypted durable refresh credentials, private routes, tests, and production Supabase schema.
- ✅ **M4 Library Sync**: bounded manual PlayStation library import, atomic persistence, sync-run protection, free-tier guardrails, and dashboard overview.
- **M5 Trophy Sync**: groups, trophies, earned state, and base/additional separation.
- **M6 Progress Events**: detect newly earned trophies.
- **M7 Public Share**: stable revocable read-only URLs.
- **M8 AI Context**: compact API for AI-assisted platinum guidance.
- **M9 Dashboard**: production MVP UX.
- **M10 Hardening**: security review, observability, release documentation.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/API.md`](./docs/API.md)
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/PSN_INTEGRATION.md`](./docs/PSN_INTEGRATION.md)
- [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md)
- [`docs/decisions/`](./docs/decisions)
- [`CHANGELOG.md`](./CHANGELOG.md)
- [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md)

## Disclaimer

TrophyBridge is an independent project and is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment or PlayStation. The PSN integration is isolated because community-documented interfaces can change.
