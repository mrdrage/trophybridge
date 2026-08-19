# TrophyBridge Architecture

## Purpose

TrophyBridge is a privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking. Its core responsibility is factual: synchronize a player's trophy state, normalize it into a durable domain model, distinguish base-game trophies from DLC, and expose a stable read-only API.

AI guidance is intentionally a separate layer. TrophyBridge Core answers **what is true** about the player's progress; an AI client decides **what to do next**.

## High-level flow

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

Application code depends on the internal `PsnProvider` contract rather than directly on a concrete community library.

M2 implements two adapters:

- `MockPsnProvider` for deterministic application/domain tests;
- `PsnApiProvider` for real PlayStation trophy retrieval through exact-pinned `psn-api` 2.18.1.

Only `PsnApiProvider` imports the community library for trophy transport. This boundary exists because PlayStation trophy interfaces used by community tooling may evolve independently of TrophyBridge.

`PsnApiProvider` owns transport concerns such as pagination, service-name propagation, locale headers, upstream validation and error normalization. It does **not** own durable authentication or credential storage; M3 provides short-lived authorization and stable account identity to it.

### Domain boundary

Raw provider payloads are mapped into TrophyBridge-owned types before they reach persistence, API, or UI layers. Provider-specific field names must not leak into the rest of the application.

M2 validates fields relied on by TrophyBridge at runtime with Zod even when `psn-api` supplies TypeScript definitions. Malformed upstream responses fail as stable `PsnProviderError` values rather than partially entering the domain.

Unsupported upstream facts are represented explicitly as unknown/null. In particular, the current `psn-api` user-trophy contract exposes a PS5 progress target but not a verified current numeric progress value, so M2 does not manufacture one.

M1 establishes the database schema that receives normalized types. Internal entities use TrophyBridge UUIDs while PlayStation identifiers remain explicit provider attributes.

### Persistence boundary

PostgreSQL is the durable source for normalized application state. M1 implements this boundary with migrations under `supabase/migrations/`.

The current trophy state is stored separately from progress events so the system can answer both:

- What is the player's state now?
- What changed since a previous synchronization?

Critical invariants live in PostgreSQL when they can be expressed unambiguously. This includes uniqueness, relational consistency, one base trophy group per title, event deduplication, valid progress ranges, and monotonic earned trophy state.

### Public API boundary

The public API is read-only, versioned, token-gated, revocable, and deliberately narrow. It never exposes authentication material or unnecessary PSN account data.

## Implemented persistence model

M1 creates these application tables:

```text
psn_accounts
games
account_games
trophy_groups
trophies
player_trophies
sync_runs
progress_events
share_links
sync_targets
```

Important relational choices:

- provider game identity is unique on `(np_communication_id, np_service_name)`;
- player trophy state is unique on `(psn_account_id, trophy_id)`;
- PlayStation `trophyId` is unique within a title, so TrophyBridge uses `(game_id, psn_trophy_id)`;
- trophy-group/game composite foreign keys prevent cross-title mismatches;
- progress events validate both their trophy/game relationship and the PSN account that owns their sync run;
- `sync_targets` can exist only for an existing `account_games` pair.

Every application table in the exposed `public` schema has Row Level Security enabled. M1 intentionally adds no client policies; direct browser access remains denied until the authenticated ownership model is implemented in M3.

## Implemented provider model

M2's TrophyBridge-owned PSN types carry the facts later sync stages need:

```text
PsnAccount
PsnGame / PsnGameRef
PsnTrophyCounts
PsnTrophyGroup + base/dlc/unknown kind
PsnTrophy
PsnUserTrophy
PsnProviderError
```

Detailed calls preserve the service identity from the title list:

```text
PS5 -> trophy2
PS3 / PS4 / PS Vita -> trophy
```

Trophy-group classification is conservative:

```text
default -> base
three-digit additional group -> dlc
unexpected value -> unknown
```

Both title lists and trophy lists are paginated inside the adapter. A repeated upstream offset is rejected rather than allowed to form an infinite request loop.

Provider errors are normalized into stable categories with retryability metadata so synchronization code can distinguish reauthentication, forbidden data, missing resources, rate limits, invalid payloads and temporary upstream failures.

## Synchronization model

TrophyBridge separates synchronization into three operations.

### Library sync

Imports the account's game catalog and aggregated progress. It does not immediately hydrate every trophy from every historical game.

M2 now supplies the provider method that can retrieve this catalog. Database orchestration belongs to M4.

### Game sync

For one selected game, imports trophy groups, trophy metadata, personal earned state, earned timestamps, and progress data when available.

M2 now supplies all read operations required by this flow. Database orchestration belongs to M5.

### Authentication refresh

Refreshes PlayStation authorization without changing trophy state. Credential lifecycle belongs to M3 and will construct authorized `PsnApiProvider` instances.

This lazy model avoids turning first login into a full-history import across potentially hundreds of titles.

## Data invariants

The following invariants are part of the architecture, not merely implementation details:

1. Synchronization is idempotent.
2. A known earned trophy is monotonic. A later incomplete provider response cannot silently revert `earned=true` to `false`.
3. A known valid `earned_at` value is not replaced by a later or missing timestamp. A newly discovered earlier timestamp may refine history.
4. At most one trophy group is classified as the base game.
5. DLC trophies never contribute to platinum-progress counts.
6. A failed synchronization never deletes previously valid state.
7. Public share links can be revoked without disconnecting the PSN account.
8. Secrets never cross the server/public API boundary.
9. Unknown provider states are represented explicitly rather than guessed.
10. Repeated syncs cannot duplicate a player's current trophy row or the same earned/discovery progress event.
11. Cross-game and cross-account event references are rejected by the database.
12. Raw provider payloads must pass the adapter boundary before they can reach persistence.
13. Unsupported current numeric trophy progress is never inferred from a target value.

## Testing architecture

CI has three independent gates:

```text
Application quality
  lint -> typecheck -> Vitest -> production build

Database integrity
  PostgreSQL 17 -> bootstrap auth.users -> apply all migrations -> run SQL invariant suites

Browser smoke
  Playwright Chromium
```

Provider contract tests use fabricated JSON under `tests/fixtures/psn/`. They verify pagination, mapping, service names, locale propagation, group classification, conservative progress behavior and error normalization without a live PSN request.

Database tests never contact PSN and use a disposable PostgreSQL service. The `auth.users` bootstrap is only a minimal stand-in for the schema Supabase provides in production.

## Modules

```text
app/
  api/private/v1/
  api/public/v1/
  dashboard/
  games/
  share/

lib/
  psn/
    provider.ts            # domain contract
    mock-provider.ts       # deterministic adapter
    psn-api-provider.ts    # implemented M2 real adapter
    mapper.ts              # implemented M2 runtime mapping
    errors.ts              # implemented M2 provider errors
    auth.ts                # M3
  sync/
  crypto/
  db/
  api/
  validation/

supabase/
  migrations/              # implemented from M1 onward
```

## Technology choices

- Next.js App Router for UI and HTTP endpoints.
- TypeScript for application code and domain contracts.
- PostgreSQL through Supabase for persistence.
- Supabase Auth for TrophyBridge user authentication.
- Exact-pinned `psn-api` behind the provider adapter.
- Vercel as the initial deployment target.
- Zod for runtime API and provider-boundary validation.
- Vitest for application unit/integration tests.
- PostgreSQL SQL suites for persistence invariants.
- Playwright for end-to-end tests.
- GitHub Actions for CI.

See `docs/decisions/` for the reasoning behind major choices.

## Milestones

- ✅ **M0 Foundation**: skeleton, quality gates, docs and CI.
- ✅ **M1 Domain Model**: executable PostgreSQL schema, migrations, constraints, RLS and invariant tests.
- ✅ **M2 PSN Provider**: normalized domain contract, real adapter, pagination, runtime validation, errors, fixtures and tests.
- **M3 Authentication**: PSN connection and encrypted credential storage.
- **M4 Library Sync**: PSN game catalog persistence.
- **M5 Trophy Sync**: trophy groups, metadata and earned state persistence.
- **M6 Progress Events**: detect new trophies and platinum events.
- **M7 Public Share**: stable revocable share URLs.
- **M8 AI Context**: compact AI-oriented representation.
- **M9 Dashboard**: polished MVP UI.
- **M10 Hardening**: security, observability and release readiness.
