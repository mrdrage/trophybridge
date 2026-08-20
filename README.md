# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, separates base-game Platinum progress from additional trophy groups, records newly observed trophy events, and exposes revocable read-only JSON optimized for AI clients.

> **Status: v0.1 · M0-M10 complete.** The application is hosted at `https://trophybridge.vercel.app`, production GitHub OAuth has been validated, Supabase migrations are applied through M10, and localhost is development-only. The live pilot contains 196 library titles; Final Fantasy XVI is the first deeply hydrated game with 3 trophy groups, 69 trophies and 18 earned states after TrophyBridge detected its first real post-baseline event.

## MVP goal

The v0.1 MVP lets an owner connect PlayStation securely, synchronize factual trophy state, share a revocable public capability, and let a fresh AI conversation understand and request bounded freshness for current Platinum progress without screenshots or manual trophy lists.

## Architecture

```text
GitHub OAuth -> Supabase Auth
                    |
                    v
Owner -> hosted dashboard -> PSN credential lifecycle
                    |                    |
                    |                    v
                    |              PsnApiProvider
                    |                    |
                    +----------> TrophyBridge Core
                                       |
                                       v
                                  PostgreSQL
                                  /        \
                         private UI      public API
                                             |
                             read context + bounded fresh=1
                                             |
                                             v
                                          AI client
```

Normal public reads use durable last-good PostgreSQL state. `fresh=1` may contact PlayStation only for the requested game and only when its trophy snapshot is stale.

## Core principles

- PSN is the factual upstream source; TrophyBridge never substitutes PSNProfiles/community data for trophy state or rarity.
- Secrets never enter public responses or Git history.
- NPSSO is bootstrap material and is never persisted.
- PSN access tokens are runtime-only; the durable refresh credential is encrypted with AES-256-GCM.
- Provider-reported refresh-token expiry is advisory. TrophyBridge lets PSN itself decide whether the durable credential is still accepted instead of forcing reauthentication solely because a local date has passed.
- A genuinely rotated PSN refresh token never inherits the prior token's absolute expiry when Sony omits a new lifetime.
- Application code depends on TrophyBridge-owned `PsnProvider`, not raw provider payloads.
- Incomplete deep trophy snapshots are rejected before persistence.
- PSN group `default` is the structural base game; additional groups never inflate Platinum progress.
- Earned trophy state is monotonic.
- The first deep sync establishes a baseline; later `false -> true` transitions become progress events.
- Public sharing uses a high-entropy bearer capability whose plaintext is shown only when generated; PostgreSQL stores only SHA-256.
- Public links are revocable, non-indexed and read-only apart from an explicitly bounded ability to request one-game freshness.
- Unearned hidden trophy metadata is spoiler-masked in public output.
- **Operating-cost requirement: €0/month.** Optional work throttles/stops before requiring paid infrastructure.

## Stack

TypeScript, Next.js App Router, Node.js 24, pnpm 11.20.0, PostgreSQL on Supabase Free, Supabase Auth + SSR, GitHub OAuth, pinned `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, PostgreSQL invariant tests, Playwright, public GitHub Actions standard runners, and Vercel Hobby.

## Hosted application

Production origin:

```text
https://trophybridge.vercel.app
```

The hosted M9/M10 path has been validated with GitHub OAuth. The Mac is no longer required for normal TrophyBridge operation or AI access; `localhost:3001` remains only a development convenience.

The dashboard provides:

- `/dashboard`: PSN connection, library size, AI share and recent activity;
- `/dashboard/library`: searchable bounded library;
- `/dashboard/games/{gameId}`: base Platinum progress, additional groups, recent events and trophy list;
- manual game synchronization only as an explicit fallback/diagnostic action.

Public capability URLs intentionally return JSON because they are machine interfaces.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.20.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Port `3000` is the framework/CI default. `pnpm dev:local` serves `http://localhost:3001` when needed.

Quality gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
DATABASE_URL=postgresql://... pnpm test:db
```

## Environment contract

Required for live hosted behavior:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TOKEN_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY_VERSION
```

Optional:

```text
TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON
APP_URL
PSN_TROPHY_LOCALE=it-IT
```

On Vercel, TrophyBridge can derive its production origin from Vercel/request metadata when `APP_URL` is not explicitly set.

Synchronization and AI guardrails:

```text
LIBRARY_SYNC_MIN_INTERVAL_SECONDS=3600
LIBRARY_SYNC_MAX_GAMES=2000
LIBRARY_SYNC_STALE_AFTER_SECONDS=600
GAME_SYNC_MIN_INTERVAL_SECONDS=300
GAME_SYNC_MAX_GROUPS=100
GAME_SYNC_MAX_TROPHIES=1000
GAME_SYNC_STALE_AFTER_SECONDS=600
AI_CONTEXT_FRESHNESS_SECONDS=600
AI_CONTEXT_MAX_REFRESHES_PER_HOUR=12
AI_CONTEXT_MAX_MISSING_TROPHIES=200
```

Real secrets belong only in local/deployment secret stores.

## Live checkpoints

- M4 imported **196** real titles.
- M5 hydrated Final Fantasy XVI with **3 groups, 69 trophies and 17 earned states**.
- M6 detected the first real post-baseline trophy, **`Fiamme gemelle`**, bringing FF16 to **18 earned trophies** and creating exactly one progress event.
- M7/M8 created an active revocable public share and bounded AI freshness.
- M9 hosted GitHub OAuth/dashboard activation succeeded at the Vercel production origin.
- M10 production migration `20260820204344_m10_release_hardening` narrowed database privileges without altering the factual dataset.

## PSN authorization lifecycle

TrophyBridge exchanges NPSSO during bootstrap, discards it, and persists only an encrypted refresh credential. M9 fixed the first bookkeeping bug: if PSN returns a **different** refresh token but omits a new `refresh_token_expires_in`, TrophyBridge no longer copies the old token's absolute expiry onto the replacement.

M10 removes the second source of artificial reauthentication. A stored `refresh_token_expires_at` is now treated as advisory metadata, not a local kill switch. Even after that date, TrophyBridge tries the encrypted durable credential once with PlayStation. If PSN accepts it, synchronization continues and a stale local deadline is discarded. Only a real PSN rejection, a missing credential, or an unreadable encrypted credential can move the connection into a state that requires owner intervention.

This means TrophyBridge itself no longer has a built-in “every 10 days ask for NPSSO” rule. It still cannot promise perpetual authorization because Sony controls the upstream credential lifecycle. TrophyBridge deliberately refuses to persist the owner's NPSSO/password simply to hide that limitation.

A separate target/data-access PSN identity remains a safe optional experiment only if real-world observation later shows Sony repeatedly revoking the owner's durable credential despite this corrected refresh flow. No claim is made about PSNProfiles' private implementation.

## Public sharing and AI context

Implemented public routes:

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games?limit=&offset=
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies?scope=base|dlc|all&status=earned|missing|all
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=0|1
```

The AI context contains factual identity, base Platinum progress, additional-group summary, bounded missing base trophies, recent progress events and explicit freshness metadata.

`fresh=1` is freshness-gated, single-game, protected by the existing five-minute game cooldown/single-flight and by a default 12 stale refresh claims/hour per public share. If PSN fails and cached trophy state exists, TrophyBridge serves last-good state with the refresh outcome.

All public responses are no-store/non-indexable; hidden library games are excluded and unearned hidden trophy metadata is masked.

## M10 hardening

M10 adds defense in depth while preserving the zero-cost architecture:

- `anon` has no direct application-table privileges;
- `authenticated` retains only owner-RLS-protected `SELECT` on `psn_accounts`;
- browser/public roles cannot execute public-schema helper/RPC functions;
- future migration-created tables/functions inherit restrictive defaults;
- state-changing `/api/private/*` requests require a same-origin browser `Origin`;
- global CSP/frame/content-type/referrer/HSTS/permissions hardening is enabled;
- the whole hosted application opts out of search indexing;
- Dependabot checks npm and GitHub Actions weekly;
- CI gates lint, typecheck, tests, build, PostgreSQL invariants and Playwright.

See [`docs/SECURITY.md`](./docs/SECURITY.md) and [`docs/decisions/0017-m10-release-hardening.md`](./docs/decisions/0017-m10-release-hardening.md).

## Zero-cost operating envelope

No paid database, worker, queue, cache, image mirror, VPS, distributed rate-limit store or paid observability service is required. Production uses Supabase Free + public GitHub/standard Actions + Vercel Hobby. Under free-tier or upstream pressure TrophyBridge must reduce optional work or serve last-good state rather than upgrade automatically.

See [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md).

## Development roadmap

- ✅ **M0 Foundation**
- ✅ **M1 Domain Model**
- ✅ **M2 PSN Provider**
- ✅ **M3 Authentication**
- ✅ **M4 Library Sync**, live 196-title smoke
- ✅ **M5 Trophy Sync**, live FF16 baseline
- ✅ **M6 Progress Events**, live post-baseline trophy detected
- ✅ **M7 Public Share**
- ✅ **M8 AI Context + bounded AI-triggered freshness**
- ✅ **M9 Dashboard + hosted activation + refresh-rotation correction**
- ✅ **M10 Hardening + production security review**

v0.1 is release-ready. Future work is maintenance and optional product evolution rather than a missing MVP milestone.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/API.md`](./docs/API.md)
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/PSN_INTEGRATION.md`](./docs/PSN_INTEGRATION.md)
- [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md)
- [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md)
- [`docs/decisions/`](./docs/decisions)
- [`CHANGELOG.md`](./CHANGELOG.md)
- [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md)

## Disclaimer

TrophyBridge is independent and is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment or PlayStation. The PSN integration is isolated because community-documented interfaces can change.
