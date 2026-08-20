# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, separates base-game platinum progress from additional trophy groups, records newly observed trophy events, and exposes revocable read-only JSON optimized for AI clients.

> Status: **M9 · Dashboard implemented**. The pilot library contains 196 titles. Final Fantasy XVI has 3 trophy groups, 69 trophies and 18 earned states after M6 detected the first real post-baseline trophy (`Fiamme gemelle`). M7 provides revocable sharing, M8 adds bounded AI-triggered freshness, and M9 turns the owner side into a human dashboard while fixing false 10-day PSN reauthentication caused by inheriting an old refresh-token expiry after token rotation. Hosted Vercel activation is the remaining M9 release step.

## MVP goal

The first release is complete when an owner can connect PlayStation securely, synchronize factual trophy state, share a revocable public capability, and let a fresh AI conversation understand and refresh current platinum progress without screenshots or manual trophy lists.

## Architecture

```text
GitHub OAuth -> Supabase Auth
                    |
                    v
Owner -> M9 dashboard -> PSN credential lifecycle
                    |                |
                    |                v
                    |          PsnApiProvider
                    |                |
                    +------> TrophyBridge Core
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

Normal public reads use durable last-good PostgreSQL state. M8 `fresh=1` may contact PlayStation only for the requested game and only when its trophy snapshot is stale.

## Core principles

- Secrets never enter public responses or Git history.
- NPSSO is bootstrap material and is never persisted.
- PSN access tokens are runtime-only; the durable refresh credential is encrypted with AES-256-GCM.
- A rotated PSN refresh token never inherits the previous token's absolute expiry when Sony omits a new lifetime. In that case TrophyBridge lets PSN decide validity on the next refresh instead of forcing a local reauthentication date.
- Application code depends on TrophyBridge-owned `PsnProvider`, not raw provider payloads.
- Incomplete deep trophy snapshots are rejected before persistence.
- PSN group `default` is the structural base game; additional groups never inflate platinum progress.
- Earned trophy state is monotonic.
- The first deep sync establishes a baseline; later `false -> true` transitions become progress events.
- Public sharing uses a high-entropy bearer capability whose plaintext is shown only when generated; PostgreSQL stores only its SHA-256 hash.
- Public links are revocable, non-indexed and read-only apart from their explicitly bounded ability to request freshness.
- Unearned hidden trophy metadata is spoiler-masked in public output.
- **Operating-cost requirement: €0/month.** Optional work must throttle or stop before requiring paid infrastructure.

## Stack

TypeScript, Next.js App Router, Node.js 24, pnpm 11.20.0, PostgreSQL via Supabase Free, Supabase Auth + SSR, GitHub OAuth, pinned `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, PostgreSQL invariant tests, Playwright, GitHub Actions, and Vercel Hobby for hosted deployment.

## Owner dashboard

M9 makes JSON a machine concern rather than the primary owner experience.

- `/dashboard` is the command center for PSN connection, game count, public AI share and recent PlayStation activity.
- `/dashboard/library` browses/searches the complete bounded library and links to game details.
- `/dashboard/games/{gameId}` shows base-game Platinum progress, additional groups, recent TrophyBridge events and the trophy list.
- The manual trophy-sync button remains only as a diagnostic/explicit fallback. Normal AI use relies on M8 `ai-context?fresh=1`.
- Public capability URLs intentionally return JSON because they are API endpoints for AI clients.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.20.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Port `3000` remains the framework/CI default. `pnpm dev:local` serves `http://localhost:3001` for development only. Once the Vercel production deployment is activated, localhost is not required for normal usage or AI verification.

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

Required for live authentication:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TOKEN_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY_VERSION
APP_URL
```

Optional key rotation:

```text
TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON
```

Trophy metadata defaults to `PSN_TROPHY_LOCALE=it-IT`.

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

## Live synchronization checkpoints

M4 imported **196** real titles.

M5 hydrated the real Final Fantasy XVI baseline with **3 groups, 69 trophies and 17 earned states**.

M6 detected the first real post-baseline trophy, **`Fiamme gemelle`**, increased FF16 to **18 earned trophies**, created exactly one `trophy_earned` event and recorded `new_trophies_found=1`.

## PSN authorization lifecycle

`psn-api` documents refresh-token exchange as the normal way to avoid repeatedly retrieving NPSSO. Sony may rotate a refresh token while omitting a replacement `refresh_token_expires_in`. Before M9, TrophyBridge incorrectly carried the old token's absolute expiry onto that new token, which could manufacture a false 10-day reauthentication deadline.

M9 changes the persistence contract so `refresh_token_expires_at` may be `NULL`. When PSN returns a rotated token and a new lifetime, TrophyBridge stores that lifetime. When PSN returns a rotated token without a new lifetime, TrophyBridge stores the new encrypted token with unknown local expiry and simply attempts normal refresh next time. A new NPSSO is required only if PSN actually rejects/revokes the durable credential or if a known non-rotated token has genuinely expired.

This removes the artificial 10-day deadline without persisting NPSSO and without claiming knowledge of PSNProfiles' private implementation.

A separate target/data-access PSN identity remains a possible future architecture, but is no longer required merely to work around TrophyBridge's former local expiry bookkeeping.

## Public sharing and AI context

Implemented public routes:

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games?limit=&offset=
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies?scope=base|dlc|all&status=earned|missing|all
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=0|1
```

The M8 AI context contains factual identity, base Platinum progress, additional-group summary, bounded missing base trophies, recent M6 progress events, and explicit freshness metadata.

`fresh=1` is freshness-gated, single-game, protected by the existing 5-minute game cooldown/single-flight and by a default 12 stale refresh claims/hour per public share. If PSN fails and cached trophy state exists, TrophyBridge serves last-good state with the refresh outcome instead of destroying availability.

All public responses remain `no-store`, non-indexable and `no-referrer`, exclude hidden library games, and mask name/description/icon for unearned hidden trophies.

## Zero-cost operating envelope

M4-M9 add no paid database, worker, queue, cache, image mirror or polling service. Hosted target is Supabase Free + public GitHub/standard Actions + Vercel Hobby. If free-tier or upstream pressure appears, TrophyBridge must reduce work or serve last-good state rather than upgrade automatically.

See [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md).

## Development roadmap

- ✅ **M0 Foundation**
- ✅ **M1 Domain Model**
- ✅ **M2 PSN Provider**
- ✅ **M3 Authentication**
- ✅ **M4 Library Sync**, live 196-title smoke
- ✅ **M5 Trophy Sync**, live FF16 baseline
- ✅ **M6 Progress Events**, live post-baseline trophy detected
- ✅ **M7 Public Share**, implementation + production schema + local link validation
- ✅ **M8 AI Context + bounded AI-triggered freshness**, implementation + production schema
- ✅ **M9 Dashboard + durable refresh rotation**, implementation; hosted activation pending
- **M10 Hardening + final hosted validation**

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

TrophyBridge is independent and is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment or PlayStation. The PSN integration is isolated because community-documented interfaces can change.
