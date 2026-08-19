# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge is being built to synchronize PlayStation trophy progress, normalize base-game and DLC data, and expose a stable read-only API that an AI assistant can use to guide a player toward a platinum trophy.

> Status: **M0 · Foundation complete**. `v0.1.0` remains in development; the next milestone is **M1 · Domain Model**.

## MVP goal

The first release is complete when a user can connect a PSN account, sync a game such as Final Fantasy XVI, expose a revocable public share link, and let a fresh AI conversation understand the current platinum progress without screenshots or manual trophy lists.

## Architecture

```text
PlayStation Network
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
- Base game and DLC are structurally separated for platinum calculations.
- Trophy state is monotonic: once a trophy is known to be earned, an incomplete sync cannot silently un-earn it.
- Public sharing is read-only, revocable, non-indexed, and token based.
- The API is versioned and includes an AI-oriented context endpoint.

## Stack

- TypeScript
- Next.js App Router
- pnpm
- PostgreSQL via Supabase
- Supabase Auth
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

Quality gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The public foundation health endpoint is available at `/api/public/v1/health`.

## Development roadmap

- ✅ **M0 Foundation**: project skeleton, CI, tests, documentation.
- **M1 Domain Model**: database schema and migrations.
- **M2 PSN Provider**: mock adapter, then real `psn-api` adapter.
- **M3 Authentication**: PSN connection and encrypted credential storage.
- **M4 Library Sync**: import PlayStation games.
- **M5 Trophy Sync**: game groups, trophies, earned state and DLC separation.
- **M6 Progress Events**: detect newly earned trophies.
- **M7 Public Share**: stable, revocable read-only URLs.
- **M8 AI Context**: compact API for AI-assisted platinum guidance.
- **M9 Dashboard**: production MVP UI.
- **M10 Hardening**: security review, observability and release documentation.

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
