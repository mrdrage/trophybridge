# TrophyBridge Project Handoff

Last updated: 2026-08-19

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, keeps base-game trophies separate from DLC, and exposes a stable read-only public API that a fresh AI conversation can inspect without screenshots or manual trophy lists.

Initial pilot account: `mrdrage2`.
Initial pilot game: Final Fantasy XVI on PS5.
Repository: `mrdrage/trophybridge`.

## Product boundary

TrophyBridge Core owns factual state: games, trophy groups, trophies, earned state, timestamps, sync status, and share links.

Trophy Intelligence is a later layer. It may add strategy metadata such as missable, story-related, NG+, online, estimated effort, and recommended order. Those facts must not be fabricated from PSN data.

## v0.1 Definition of Done

The MVP is complete when the following real flow works end to end:

1. Sign in to TrophyBridge.
2. Connect the PSN account.
3. TrophyBridge identifies `mrdrage2`.
4. Library sync discovers Final Fantasy XVI.
5. Game sync imports trophy groups, metadata, and earned state.
6. Base-game platinum progress is correct and DLC trophies are excluded from the platinum denominator.
7. A revocable public share link is generated.
8. A brand-new ChatGPT conversation can open the shared API and understand current platinum progress.
9. A newly earned PS5 trophy is detected on the next sync.
10. The new state is visible to the AI client.

## Technology decisions

- TypeScript
- Next.js App Router
- Node.js 22.13+; Node 24 is the pinned CI/development target
- pnpm 11.20.0
- PostgreSQL through Supabase
- Supabase Auth, initially GitHub OAuth
- Zod for runtime validation
- Vitest for application tests
- PostgreSQL SQL suites for persistence invariants
- Playwright for end-to-end tests
- GitHub Actions for CI
- Vercel planned for deployment
- Community `psn-api` library only behind an internal adapter

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
    /       \
Dashboard  Public API
               |
               v
              AI
```

Application code must depend on `PsnProvider`, never directly on `psn-api` outside the adapter implementation.

## Implemented domain model

M1 is complete. PostgreSQL migrations now create:

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

Executable migrations:

```text
supabase/migrations/20260819120000_m1_domain_model.sql
supabase/migrations/20260819121000_m1_integrity_refinements.sql
```

Important database guarantees:

- provider game identity is unique on `(np_communication_id, np_service_name)`;
- player trophy state is unique on `(psn_account_id, trophy_id)`;
- repeated trophy UPSERTs are idempotent;
- `earned=true` is monotonic at the database layer;
- a known earlier `earned_at` is preserved against later or missing values, while a newly discovered earlier timestamp can refine history;
- at most one trophy group is `base` for a game;
- PSN `trophyId` is treated as unique within a title, using `(game_id, psn_trophy_id)`;
- trophy/group and progress-event references cannot cross games;
- progress events cannot attach a sync run to the wrong PSN account;
- progress events are deduplicated across repeated syncs;
- percentages and counters have validity constraints;
- all ten application tables in the exposed `public` schema have RLS enabled.

M1 intentionally creates no browser/client RLS policies. Until M3, direct client access is denied by default and server/service-role access is the intended writer.

## Database verification

GitHub Actions now has a dedicated PostgreSQL 17 job.

The database test runner:

```text
scripts/test-db.sh
```

applies a minimal `auth.users` CI stub, then all migrations, then every `tests/integration/domain_*.sql` suite.

Current SQL integration coverage verifies:

- migration application;
- idempotent player-trophy UPSERTs;
- monotonic earned state;
- earned timestamp preservation/refinement;
- one-base-group rules;
- title-wide trophy ID uniqueness;
- trophy/group game integrity;
- progress-event game/account integrity;
- event deduplication;
- base/DLC structural separation;
- RLS enablement.

CI never contacts PlayStation Network and uses fabricated identities only.

## Synchronization design

Library sync is lightweight and imports title-level information only.

Game sync is lazy and imports trophy groups, trophy metadata, and user-earned state for a selected title.

Public reads use persisted data. A future `fresh=1` mechanism may request a bounded refresh while respecting a per-game cooldown and synchronization lock.

`progress_events` records meaningful changes instead of storing full duplicate snapshots. Initial events include `game_discovered`, `trophy_earned`, and `platinum_earned`.

The `sync_targets` table now persists the account/game pair and timing fields needed for later cooldown/locking logic, but the actual lock-acquisition algorithm is not part of M1.

## Authentication and secrets

The planned PSN bootstrap uses NPSSO only transiently. NPSSO is password-equivalent and must never be persisted or logged. Refresh credentials are server-only and encrypted before persistence. The planned encryption primitive is AES-256-GCM with a server-side environment key.

No real PSN credential storage exists yet. That belongs to M3.

Public share links use high-entropy opaque tokens, are read-only and revocable, and should be non-indexed. M1 creates the `share_links` persistence shape only; token generation/hashing behavior belongs to M7.

## Public API contract

Version prefix: `/api/public/v1`.

Planned resources:

- `/share/{token}`
- `/share/{token}/games`
- `/share/{token}/games/{gameId}`
- `/share/{token}/games/{gameId}/trophies`
- `/share/{token}/games/{gameId}/ai-context`

The `ai-context` response is intentionally compact and should include player/game identity, base-game platinum progress, missing base trophies, recent activity, DLC summary, and sync freshness.

A foundation health endpoint already exists at `/api/public/v1/health`.

## Privacy rules

Public output is whitelist-based. Allowed categories are limited to the PSN online ID, game/title metadata, trophy metadata, earned state, optional earned dates, progress, and TrophyBridge sync timestamps.

Never expose email addresses, NPSSO, access or refresh tokens, service-role keys, encryption keys, friends lists, device information, or unrelated PSN profile data.

Hidden unearned trophy descriptions should be spoiler-safe by default in the future sharing layer.

## Milestones

- ✅ M0 Foundation: skeleton, CI, tests, documentation.
- ✅ M1 Domain Model: PostgreSQL schema, migrations, constraints, RLS, and database invariant tests.
- M2 PSN Provider: real provider mapping and adapter.
- M3 Authentication: PSN connection and encrypted credential lifecycle.
- M4 Library Sync: import PlayStation titles.
- M5 Trophy Sync: trophy groups, earned state, base/DLC separation.
- M6 Progress Events: detect newly earned trophies.
- M7 Public Share: stable revocable read-only links.
- M8 AI Context: compact AI-oriented API.
- M9 Dashboard: production MVP UX.
- M10 Hardening: security, observability, release preparation.

## Current implementation state

The repository contains a Next.js/TypeScript application shell, public health route, provider-neutral `PsnProvider`, `MockPsnProvider`, Vitest tests, Playwright smoke coverage, PostgreSQL migrations and SQL invariant suites, ESLint/typecheck/build scripts, three-part GitHub Actions CI, `.env.example`, architecture/API/data-model/security/PSN documentation, and ADRs.

M1 deliberately does **not** connect a real Supabase production project or make real PSN network calls. The schema is validated against disposable PostgreSQL in CI and is ready to receive normalized provider data.

## Next milestone

**M2 · PSN Provider**.

The next development session should implement the provider-mapping layer and real `PsnApiProvider` behind the existing `PsnProvider` interface. It should use sanitized fixtures and contract tests first, then verify a small manual real-PSN smoke path without allowing live PSN calls in CI.

M2 should pay particular attention to:

- pagination of title/trophy endpoints;
- PS5 `trophy2` versus legacy `trophy` service names;
- mapping `default` and additional trophy groups into `base` / `dlc` / `unknown` without guessing;
- progress target/value fields and missing optional metadata;
- hidden trophies and locale/header handling;
- converting upstream numeric/string fields into the exact M1 database-compatible domain types;
- stable error normalization so later sync code does not depend on raw provider errors.

Do not start durable PSN credential storage until M2 provider mapping is stable. Authentication lifecycle remains M3.

## Documentation map

- `README.md`: project overview and roadmap
- `docs/ARCHITECTURE.md`: system boundaries and implemented persistence flow
- `docs/API.md`: public API contract
- `docs/DATA_MODEL.md`: definitive M1 persistence model
- `docs/SECURITY.md`: security and privacy model
- `docs/PSN_INTEGRATION.md`: provider/auth/sync boundary
- `docs/decisions/`: Architecture Decision Records
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity document for a fresh development chat
