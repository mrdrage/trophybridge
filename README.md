# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge is being built to synchronize PlayStation trophy progress, normalize base-game and DLC data, and expose a stable read-only API that an AI assistant can use to guide a player toward a platinum trophy.

> Status: **M2 · PSN Provider complete**. `v0.1.0` remains in development; the next milestone is **M3 · Authentication**.

## MVP goal

The first release is complete when a user can connect a PSN account, sync a game such as Final Fantasy XVI, expose a revocable public share link, and let a fresh AI conversation understand the current platinum progress without screenshots or manual trophy lists.

## Architecture

```text
PlayStation Network
        |
        v
   PsnApiProvider
        |
        v
    PsnProvider
        |
        v
  TrophyBridge Core
        |
        v
    PostgreSQL
     /      \
Dashboard  Public API
               |
               v
              AI
```

## Core principles

- Privacy first: secrets never enter the public API or repository.
- Provider isolation: the application depends on `PsnProvider`, not directly on a single PSN library.
- External payloads are runtime-validated before entering the TrophyBridge domain.
- Base game and DLC are structurally separated for platinum calculations.
- Trophy state is monotonic: once a trophy is known to be earned, an incomplete sync cannot silently un-earn it.
- Unsupported provider data stays unknown/null rather than being invented.
- Public sharing is read-only, revocable, non-indexed, and token based.
- The API is versioned and includes an AI-oriented context endpoint.
- PostgreSQL protects critical domain invariants instead of trusting every future application writer to reproduce them perfectly.

## Stack

- TypeScript
- Next.js App Router
- pnpm
- PostgreSQL via Supabase
- Supabase Auth
- `psn-api` 2.18.1 behind `PsnApiProvider`
- Zod
- Vitest
- Playwright
- GitHub Actions
- Vercel

## Local development

Requirements: Node.js 22.13+ (Node 24 recommended and pinned by `.node-version`) and pnpm 11.20.0.

```bash
pnpm install
pnpm dev
```

Application quality gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Database invariant suite, using a disposable PostgreSQL database:

```bash
DATABASE_URL=postgresql://... pnpm test:db
```

GitHub Actions runs the database migrations and invariant suite against PostgreSQL 17 in addition to the application checks.

The public foundation health endpoint is available at `/api/public/v1/health`.

## Development roadmap

- ✅ **M0 Foundation**: project skeleton, CI, tests, documentation.
- ✅ **M1 Domain Model**: PostgreSQL schema, migrations, constraints, RLS, and database invariant tests.
- ✅ **M2 PSN Provider**: provider mapping, pagination, validation, fixtures, error normalization, and real `psn-api` adapter behind `PsnProvider`.
- **M3 Authentication**: PSN connection and encrypted credential storage.
- **M4 Library Sync**: import PlayStation games.
- **M5 Trophy Sync**: game groups, trophies, earned state and DLC separation.
- **M6 Progress Events**: detect newly earned trophies.
- **M7 Public Share**: stable, revocable read-only URLs.
- **M8 AI Context**: compact API for AI-assisted platinum guidance.
- **M9 Dashboard**: production MVP UI.
- **M10 Hardening**: security review, observability and release documentation.

## M1 database model

The executable schema lives under [`supabase/migrations/`](./supabase/migrations). M1 creates:

- `psn_accounts`
- `games`
- `account_games`
- `trophy_groups`
- `trophies`
- `player_trophies`
- `sync_runs`
- `progress_events`
- `share_links`
- `sync_targets`

Important guarantees include idempotent player-trophy UPSERTs, monotonic earned state, preservation of trusted earned timestamps, one base trophy group per game, title-wide trophy IDs, deduplicated progress events, and deny-by-default RLS on the exposed application tables.

See [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) for the definitive model.

## M2 PSN provider

`PsnApiProvider` translates PlayStation trophy responses into TrophyBridge-owned types. It handles title/trophy pagination, propagates `trophy2` for PS5 and `trophy` for legacy platforms, sends a configurable `Accept-Language`, and normalizes provider failures into stable application error codes.

Sanitized fixtures under `tests/fixtures/psn/` exercise the adapter without contacting PSN in CI. Current numeric trophy progress is not exposed by the pinned `psn-api` user-trophy contract, so TrophyBridge stores the target when available but never fabricates a current value.

See [`docs/PSN_INTEGRATION.md`](./docs/PSN_INTEGRATION.md) for the exact provider contract and limitations.

## Documentation

Project decisions and contracts live under [`docs/`](./docs). The continuously maintained [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md) makes the project portable across development sessions and fresh AI conversations.

Key documents:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/API.md`](./docs/API.md)
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/PSN_INTEGRATION.md`](./docs/PSN_INTEGRATION.md)
- [`docs/decisions/`](./docs/decisions)
- [`CHANGELOG.md`](./CHANGELOG.md)

## Security

Never commit PSN credentials, NPSSO values, refresh tokens, Supabase service-role keys, encryption keys, or real `.env` files. See [`docs/SECURITY.md`](./docs/SECURITY.md).

## Disclaimer

TrophyBridge is an independent project and is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment or PlayStation. PSN integration is isolated behind an adapter because community-documented interfaces may change.
