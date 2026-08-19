# TrophyBridge Architecture

## Purpose

TrophyBridge is a privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking. Its core responsibility is factual: synchronize a player's trophy state, normalize it into a durable domain model, distinguish base-game trophies from DLC, and expose a stable read-only API.

AI guidance is intentionally a separate layer. TrophyBridge Core answers **what is true** about the player's progress; an AI client decides **what to do next**.

## High-level flow

```text
PlayStation Network
        |
        v
    PsnProvider
        |
        v
  Sync + normalization
        |
        v
 PostgreSQL / Supabase
      /          \
     v            v
Private UI     Public API
                   |
                   v
                 AI client
```

## Architectural boundaries

### PSN provider boundary

Application code must depend on the internal `PsnProvider` contract rather than directly on a concrete community library. The first production adapter is expected to use `psn-api`, while tests use `MockPsnProvider`.

This boundary exists because PlayStation trophy interfaces used by community tooling may evolve independently of TrophyBridge.

### Domain boundary

Raw provider payloads are mapped into TrophyBridge-owned types before they reach persistence, API, or UI layers. Provider-specific field names must not leak into the rest of the application.

### Persistence boundary

PostgreSQL is the durable source for normalized application state. The current trophy state is stored separately from progress events so the system can answer both:

- What is the player's state now?
- What changed since a previous synchronization?

### Public API boundary

The public API is read-only, versioned, token-gated, revocable, and deliberately narrow. It never exposes authentication material or unnecessary PSN account data.

## Synchronization model

TrophyBridge separates synchronization into three operations.

### Library sync

Imports the account's game catalog and aggregated progress. It does not immediately hydrate every trophy from every historical game.

### Game sync

For one selected game, imports trophy groups, trophy metadata, personal earned state, earned timestamps, and progress data when available.

### Authentication refresh

Refreshes PlayStation authorization without changing trophy state.

This lazy model avoids turning first login into a full-history import across potentially hundreds of titles.

## Data invariants

The following invariants are part of the architecture, not merely implementation details:

1. Synchronization is idempotent.
2. A known earned trophy is monotonic. A later incomplete provider response cannot silently revert `earned=true` to `false`.
3. A known valid `earned_at` value is not replaced arbitrarily.
4. At most one trophy group is classified as the base game.
5. DLC trophies never contribute to platinum-progress counts.
6. A failed synchronization never deletes previously valid state.
7. Public share links can be revoked without disconnecting the PSN account.
8. Secrets never cross the server/public API boundary.
9. Unknown provider states are represented explicitly rather than guessed.

## Planned modules

```text
app/
  api/private/v1/
  api/public/v1/
  dashboard/
  games/
  share/

lib/
  psn/
    provider.ts
    mock-provider.ts
    psn-api-provider.ts   # later milestone
    mapper.ts             # later milestone
    auth.ts               # later milestone
  sync/
  crypto/
  db/
  api/
  validation/
```

## Technology choices

- Next.js App Router for UI and HTTP endpoints.
- TypeScript for application code and domain contracts.
- PostgreSQL through Supabase for persistence.
- Supabase Auth for TrophyBridge user authentication.
- Vercel as the initial deployment target.
- Zod for runtime API and boundary validation.
- Vitest for unit/integration tests.
- Playwright for end-to-end tests.
- GitHub Actions for CI.

See `docs/decisions/` for the reasoning behind major choices.

## Milestones

- **M0 Foundation**: skeleton, quality gates, docs and CI.
- **M1 Domain Model**: database schema and migrations.
- **M2 PSN Provider**: mock and real adapters.
- **M3 Authentication**: PSN connection and encrypted credential storage.
- **M4 Library Sync**: PSN game catalog.
- **M5 Trophy Sync**: trophy groups, metadata and earned state.
- **M6 Progress Events**: detect new trophies and platinum events.
- **M7 Public Share**: stable revocable share URLs.
- **M8 AI Context**: compact AI-oriented representation.
- **M9 Dashboard**: polished MVP UI.
- **M10 Hardening**: security, observability and release readiness.
