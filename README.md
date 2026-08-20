# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, separates base-game platinum progress from additional trophy groups, records newly observed trophy events, and exposes revocable read-only JSON for AI clients.

> Status: **M7 · Public Share implemented and production schema applied**. The real pilot library contains 196 titles. Final Fantasy XVI has 3 trophy groups, 69 trophies and 18 earned states after M6 successfully detected the first real post-baseline trophy (`Fiamme gemelle`). M7 adds a revocable capability URL over durable database state. **M8 · AI Context** is next and will add the AI-optimized payload plus bounded on-demand freshness so the owner no longer needs to press `Sincronizza trofei` for AI use.

## MVP goal

The first release is complete when an owner can connect PlayStation securely, synchronize factual trophy state, share a revocable public capability, and let a fresh AI conversation understand current platinum progress without screenshots or manual trophy lists.

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
                     private UI      M7 public API
                                         |
                                         v
                                      AI client
```

Public M7 reads never contact PlayStation. They serialize the latest durable last-good state. M8 will introduce an explicitly bounded single-game freshness request that reuses the existing synchronization guardrails.

## Core principles

- Secrets never enter public responses or Git history.
- NPSSO is bootstrap material and is never persisted.
- PSN access tokens are runtime-only; the durable refresh credential is encrypted with AES-256-GCM.
- Application code depends on TrophyBridge-owned `PsnProvider`, not raw provider payloads.
- Incomplete deep trophy snapshots are rejected before persistence.
- PSN group `default` is the structural base game; additional groups never inflate platinum progress.
- Earned trophy state is monotonic.
- The first deep sync establishes a baseline; later `false -> true` transitions become progress events.
- M7 public sharing uses a high-entropy bearer capability whose plaintext is shown only when generated; PostgreSQL stores only its SHA-256 hash.
- Public links are revocable, non-indexed and read-only.
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

Synchronization guardrails:

```text
LIBRARY_SYNC_MIN_INTERVAL_SECONDS=3600
LIBRARY_SYNC_MAX_GAMES=2000
LIBRARY_SYNC_STALE_AFTER_SECONDS=600
GAME_SYNC_MIN_INTERVAL_SECONDS=300
GAME_SYNC_MAX_GROUPS=100
GAME_SYNC_MAX_TROPHIES=1000
GAME_SYNC_STALE_AFTER_SECONDS=600
```

Real secrets belong only in local/deployment secret stores.

## Implemented synchronization

M4 imports lightweight library state manually and conservatively. The first live smoke stored **196** titles.

M5 hydrates one explicitly selected title at a time through groups, trophy definitions and user trophy state. The real Final Fantasy XVI baseline contained **3 groups, 69 trophies and 17 earned states**.

M6 compares the incoming complete snapshot with durable pre-sync state. The first live post-baseline validation detected **`Fiamme gemelle`**, increased FF16 to **18 earned trophies**, created exactly one `trophy_earned` event and recorded `new_trophies_found=1` on the successful game sync.

## M7 public sharing

The authenticated dashboard can generate, regenerate or revoke one account-level public capability. A new token is 256 random bits encoded as `tb1_...`; only its SHA-256 hash is stored. Regeneration atomically revokes the previous active link.

Implemented public routes:

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games?limit=&offset=
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies?scope=base|dlc|all&status=earned|missing|all
```

M7 responses are `no-store`, non-indexable, contain no PSN authorization material, exclude hidden library games, and mask the name/description/icon of unearned hidden trophies. `ai-context` and public freshness remain intentionally disabled until M8.

A locally generated `http://localhost:3001/...` capability is useful for browser/local testing but cannot be reached from a fresh remote ChatGPT conversation. Internet validation requires the later Vercel Hobby deployment.

## Authentication follow-up

Current owner synchronization still uses the encrypted refresh credential created from the owner's NPSSO bootstrap. Research for the next architecture pass confirmed an important distinction: PlayStation trophy endpoints can use one authenticated PSN account to request another account's trophy data when that target account's privacy settings permit it. TrophyBridge will therefore evaluate separating the **target PSN identity** from the **data-access credential**, instead of assuming the target owner must repeatedly supply NPSSO forever. No claim is made about PSNProfiles' private implementation.

## Zero-cost operating envelope

M4-M7 add no paid database, worker, queue, cache, image mirror or polling service. M7 public reads use existing PostgreSQL state and do not fan out to PSN. If free-tier pressure appears, TrophyBridge must reduce work or serve last-good state rather than upgrade automatically.

See [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md).

## Development roadmap

- ✅ **M0 Foundation**
- ✅ **M1 Domain Model**
- ✅ **M2 PSN Provider**
- ✅ **M3 Authentication**
- ✅ **M4 Library Sync**, live 196-title smoke
- ✅ **M5 Trophy Sync**, live FF16 baseline
- ✅ **M6 Progress Events**, live post-baseline trophy detected
- ✅ **M7 Public Share**, implementation + production schema
- **M8 AI Context + bounded AI-triggered freshness**
- **M9 Dashboard**
- **M10 Hardening + deployment validation**

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
