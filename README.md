# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, keeps base-game progress separate from additional trophy groups, and is being built to expose a stable read-only API that an AI assistant can use for platinum guidance.

> Status: **M6 · Progress Events implemented**. M4 has been validated against the real pilot account with 196 library titles imported and M5 has been validated live on Final Fantasy XVI with 3 trophy groups, 69 trophies, and 17 earned states persisted. M6 now detects newly earned trophies on later game syncs without backfilling historical trophies. The next implementation milestone is **M7 · Public Share** after the first real post-baseline trophy delta is observed.

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
- PSN access tokens are runtime-only.
- The durable PSN refresh token is encrypted server-side with AES-256-GCM, account-bound authenticated data, and key versioning.
- Application code depends on `PsnProvider`, not raw `psn-api` payloads.
- Provider payloads are runtime-validated before persistence.
- The `default` trophy group is structurally treated as base game; additional groups remain separate from platinum progress.
- Partial or inconsistent deep trophy responses are rejected before they can replace last-good state.
- Earned trophy state is monotonic and known localized metadata is not erased by later null values.
- The first deep sync establishes a baseline; only later durable `false -> true` earned transitions become progress events.
- A newly earned platinum creates both the normal trophy event and a dedicated platinum event.
- Public sharing will be read-only, revocable, non-indexed, and token based.
- **Operating-cost target is €0/month.** Optional work must throttle or stop before requiring paid infrastructure.

## Stack

- TypeScript
- Next.js App Router and `proxy.ts`
- Node.js 24 recommended
- pnpm 11.20.0
- PostgreSQL via Supabase Free
- Supabase Auth + `@supabase/ssr`
- GitHub OAuth
- `psn-api` 2.18.1 behind `PsnApiProvider`
- AES-256-GCM through Node.js `crypto`
- Zod
- Vitest
- PostgreSQL invariant tests
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

Port `3000` remains the framework/CI default. The owner's local TrophyBridge instance uses:

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

Optional during encryption-key rotation:

```text
TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON
```

Trophy metadata locale defaults to:

```text
PSN_TROPHY_LOCALE=it-IT
```

M4 library guardrails:

```text
LIBRARY_SYNC_MIN_INTERVAL_SECONDS=3600
LIBRARY_SYNC_MAX_GAMES=2000
LIBRARY_SYNC_STALE_AFTER_SECONDS=600
```

M5/M6 game-trophy guardrails:

```text
GAME_SYNC_MIN_INTERVAL_SECONDS=300
GAME_SYNC_MAX_GROUPS=100
GAME_SYNC_MAX_TROPHIES=1000
GAME_SYNC_STALE_AFTER_SECONDS=600
```

Real secret values belong only in local/deployment secret stores, never in Git.

## Authentication flow

1. The TrophyBridge owner signs in through GitHub OAuth backed by Supabase Auth.
2. The private dashboard accepts the PSN Online ID and NPSSO.
3. NPSSO is exchanged for PlayStation tokens server-side.
4. TrophyBridge resolves the PSN identity, with a direct username lookup fallback when Universal Search omits a valid owner profile.
5. The stable account is always re-verified through `getProfileFromAccountId`, requiring `isMe=true` and the claimed Online ID.
6. NPSSO is discarded; only the refresh token is encrypted and persisted.
7. Later synchronization obtains authorization only through `PsnConnectionService.createProviderForOwner(ownerUserId)`.

## M4 library synchronization

M4 performs a lightweight manual import:

```text
POST /api/private/v1/library/sync
  -> PsnConnectionService.createProviderForOwner(ownerUserId)
  -> PsnProvider.getGames()
  -> persist_library_snapshot(...)
  -> games + account_games + sync_runs
```

The first live smoke imported **196** real titles successfully. Dashboard ordering uses PSN's `psn_last_updated_at`, not the common local import timestamp, so recent games appear first.

## M5 trophy synchronization

M5 hydrates exactly one selected title at a time:

```text
POST /api/private/v1/games/{gameId}/sync
  -> verified owner/library target
  -> PsnConnectionService.createProviderForOwner(ownerUserId)
  -> PsnProvider.getTrophyGroups()
  -> PsnProvider.getTrophies()
  -> PsnProvider.getUserTrophies()
  -> strict completeness validation
  -> atomic trophy snapshot persistence
```

The live Final Fantasy XVI baseline contains **3 groups, 69 trophies, and 17 earned player states**. Base-game and additional groups are stored separately.

## M6 progress events

M6 extends the same bounded per-game sync. Before the M5 factual snapshot is updated, PostgreSQL captures existing unearned states and compares them with the incoming complete snapshot.

```text
existing durable player state
  + incoming complete PSN snapshot
  -> false -> true transition detection
  -> persist_game_trophy_snapshot_with_events(...)
  -> factual state + progress_events in one transaction
```

Rules:

- first deep sync is a baseline and creates no historical flood;
- later newly earned trophies create one `trophy_earned` event;
- a newly earned platinum also creates `platinum_earned`;
- `occurred_at` uses PSN's earned timestamp when supplied;
- events are deduplicated by database constraints;
- each event is tied to the game sync run that detected it;
- `sync_runs.new_trophies_found` records the number of newly earned trophies found in that run;
- the private game page shows up to 20 recent progress events.

M6 does not introduce polling, queues, cron jobs, or another hosted service. Detection happens only when the existing manual game sync runs.

## Zero-cost operating envelope

TrophyBridge treats **€0/month** as an architecture requirement. M4 through M6 are manual, bounded, single-flight synchronization paths. Normal reads use PostgreSQL and do not contact PSN. Images remain upstream URLs instead of being mirrored to paid storage.

See [`docs/COST_GUARDRAILS.md`](./docs/COST_GUARDRAILS.md) and the ADRs for the enforceable limits.

## Development roadmap

- ✅ **M0 Foundation**
- ✅ **M1 Domain Model**
- ✅ **M2 PSN Provider**
- ✅ **M3 Authentication**
- ✅ **M4 Library Sync**, including real owner/library smoke
- ✅ **M5 Trophy Sync**, including real Final Fantasy XVI baseline smoke
- ✅ **M6 Progress Events**, implementation/schema complete; first real post-baseline trophy delta next
- **M7 Public Share**
- **M8 AI Context**
- **M9 Dashboard**
- **M10 Hardening**

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
