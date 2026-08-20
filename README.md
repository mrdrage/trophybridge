# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, separates base-game platinum progress from additional trophy groups, records newly observed trophy events, and exposes revocable read-only JSON optimized for AI clients.

> Status: **M8 · AI Context implemented and production schema applied**. The pilot library contains 196 titles. Final Fantasy XVI has 3 trophy groups, 69 trophies and 18 earned states after M6 detected the first real post-baseline trophy (`Fiamme gemelle`). M7 provides a revocable public capability and M8 adds an AI-optimized game context plus bounded `fresh=1` single-game refresh. **M9 · Dashboard** is next.

## MVP goal

The first release is complete when an owner can connect PlayStation securely, synchronize factual trophy state, share a revocable public capability, and let a fresh AI conversation understand and refresh current platinum progress without screenshots or manual trophy lists.

## Architecture

```text
GitHub OAuth -> Supabase Auth
                    |
                    v
Owner -> private dashboard -> PSN credential lifecycle
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

TypeScript, Next.js App Router, Node.js 24, pnpm 11.20.0, PostgreSQL via Supabase Free, Supabase Auth + SSR, GitHub OAuth, pinned `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, PostgreSQL invariant tests, Playwright, GitHub Actions, and Vercel Hobby planned for deployment.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.20.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Port `3000` remains the framework/CI default. The owner local instance uses:

```bash
pnpm dev:local
```

which serves `http://localhost:3001`.

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

Synchronization and M8 AI guardrails:

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

## Public sharing and AI context

Implemented public routes:

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games?limit=&offset=
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies?scope=base|dlc|all&status=earned|missing|all
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=0|1
```

The M8 AI context contains factual identity, base platinum progress, additional-group summary, bounded missing base trophies, recent M6 progress events, and explicit freshness metadata.

`fresh=1` behaves conservatively:

1. read the current durable game snapshot;
2. if it is younger than the default 10-minute freshness window, do not contact PSN;
3. if stale, atomically claim from the public share's hourly refresh budget;
4. reuse the existing one-game `TrophySyncService`, including its 5-minute cooldown, single-flight lock and strict snapshot validation;
5. reload the persisted state after success;
6. if PSN fails and cached trophy state exists, serve that last-good state and report the refresh outcome instead of destroying availability.

The default share budget is 12 stale refresh claims per hour. A revoked share cannot claim work. The claim RPC is service-role-only.

AI context embeds at most 200 missing base trophies by default. If a very large trophy set is truncated, the normal filtered `/trophies` endpoint remains the complete factual source.

All public responses remain `no-store`, non-indexable, `no-referrer`, exclude hidden library games, and mask name/description/icon for unearned hidden trophies.

A locally generated `http://localhost:3001/...` capability is useful for browser testing but cannot be reached from a fresh remote ChatGPT conversation. Internet validation requires the planned Vercel Hobby deployment.

## Authentication follow-up

Current synchronization still uses the encrypted refresh credential created from the owner's NPSSO bootstrap. `psn-api` documents that both title-list and earned-trophy calls accept another numeric target account ID when the authenticating account has permission to view that target. TrophyBridge will therefore test separating the **target PSN identity** from a separately managed **data-access credential**. If the complete pilot flow works that way, recurring owner NPSSO entry can be removed without persisting the owner's NPSSO. No claim is made about PSNProfiles' private implementation.

## Zero-cost operating envelope

M4-M8 add no paid database, worker, queue, cache, image mirror or polling service. M8 freshness is demand-driven, single-game, freshness-gated and share-budgeted. If free-tier or upstream pressure appears, TrophyBridge must reduce work or serve last-good state rather than upgrade automatically.

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
- **M9 Dashboard**
- **M10 Hardening + hosted deployment validation**

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
