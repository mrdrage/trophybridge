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
- `psn-api` 2.18.1, exact pinned version, accessible only through `PsnApiProvider`
- Zod for runtime provider/API validation
- Vitest for application tests
- PostgreSQL SQL suites for persistence invariants
- Playwright for end-to-end tests
- GitHub Actions for CI
- Vercel planned for deployment

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
    /       \
Dashboard  Public API
               |
               v
              AI
```

Application code must depend on `PsnProvider`, never directly on `psn-api` outside the adapter implementation.

## Implemented domain model

M1 is complete. PostgreSQL migrations create:

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

## Implemented PSN provider

M2 is complete at the code/contract level. The repository contains:

```text
lib/psn/provider.ts
lib/psn/mock-provider.ts
lib/psn/psn-api-provider.ts
lib/psn/mapper.ts
lib/psn/errors.ts
```

`PsnApiProvider` receives an existing `AuthorizationPayload` plus stable `PsnAccount` identity. Durable authentication is deliberately outside the provider and belongs to M3.

### Provider capabilities

`PsnProvider` exposes:

- `getAccount()`
- `getGames()`
- `getTrophyGroups(game)`
- `getTrophies(game)`
- `getUserTrophies(game)`

The real adapter uses the pinned `psn-api` 2.18.1 package and supports:

- paginated `getUserTitles()` library retrieval;
- `getTitleTrophyGroups()`;
- paginated `getTitleTrophies(..., "all")`;
- paginated `getUserTrophiesEarnedForTitle(..., "all")`;
- PS5 `trophy2` and legacy `trophy` service-name propagation;
- configurable `Accept-Language` header, defaulting to `en-US`;
- repeated-pagination-offset protection;
- runtime validation of fields TrophyBridge relies on;
- stable provider error normalization.

### Domain mapping

M2 maps title data into provider-neutral domain types including:

- communication/service identity;
- platform list;
- aggregate defined/earned trophy counts;
- title progress and last update;
- trophy group kind (`base`, `dlc`, `unknown`);
- trophy metadata and hidden state;
- personal earned state and timestamp;
- rarity and earned-rate percentage;
- PS5 progress target when present.

Group classification is deliberately conservative:

```text
default -> base
001/002/... (exactly three digits) -> dlc
anything else -> unknown
```

### Numeric-progress limitation

The pinned `psn-api` `UserThinTrophy` contract exposes the PS5 progress target but not the player's current numeric progress value.

TrophyBridge therefore uses:

```text
progressTarget -> provider value when available
progressValue -> null
progressPercent -> 100 only for an earned trophy, otherwise null
```

No current progress value is fabricated. If a future verified provider exposes it, the domain contract can be extended deliberately.

### Provider errors

M2 normalizes provider failures into:

```text
AUTH_REQUIRED
FORBIDDEN
NOT_FOUND
RATE_LIMITED
INVALID_RESPONSE
UPSTREAM_UNAVAILABLE
```

Errors carry a `retryable` flag so later synchronization code does not parse raw provider strings.

## Provider verification

CI never contacts PlayStation Network and never requires credentials.

Sanitized/fabricated fixtures live in:

```text
tests/fixtures/psn/
```

M2 unit/contract coverage verifies:

- multi-page game retrieval;
- multi-page title/user trophy retrieval;
- service-name propagation;
- shared-platform normalization;
- base/DLC/unknown group classification;
- rarity/earned-rate conversion;
- conservative progress semantics;
- locale headers;
- malformed-response rejection;
- provider error normalization;
- deterministic `MockPsnProvider` behavior.

A live PSN smoke test is intentionally deferred until M3 establishes a safe real authentication lifecycle.

## Database verification

GitHub Actions has a dedicated PostgreSQL 17 job.

The database test runner:

```text
scripts/test-db.sh
```

applies a minimal `auth.users` CI stub, then all migrations, then every `tests/integration/domain_*.sql` suite.

Current SQL integration coverage verifies migration application, idempotent player-trophy UPSERTs, monotonic earned state, earned timestamp preservation/refinement, one-base-group rules, title-wide trophy ID uniqueness, cross-entity integrity, event deduplication, base/DLC separation, and RLS enablement.

## Synchronization design

Library sync is lightweight and imports title-level information only.

Game sync is lazy and imports trophy groups, trophy metadata, and user-earned state for a selected title.

Public reads use persisted data. A future `fresh=1` mechanism may request a bounded refresh while respecting a per-game cooldown and synchronization lock.

`progress_events` records meaningful changes instead of storing full duplicate snapshots. Initial events include `game_discovered`, `trophy_earned`, and `platinum_earned`.

The `sync_targets` table persists the account/game pair and timing fields needed for later cooldown/locking logic, but lock acquisition is implemented only when sync orchestration is built.

## Authentication and secrets

The planned PSN bootstrap uses NPSSO only transiently. NPSSO is password-equivalent and must never be persisted or logged. Refresh credentials are server-only and encrypted before persistence. The planned encryption primitive is AES-256-GCM with a server-side environment key.

No real PSN credential storage exists yet. That belongs to M3.

The real provider is already designed to receive a short-lived authorization object from M3 rather than own credential persistence itself.

Public share links use high-entropy opaque tokens, are read-only and revocable, and should be non-indexed. M1 created the `share_links` persistence shape only; token generation/hashing behavior belongs to M7.

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
- ✅ M2 PSN Provider: real adapter, runtime mapping/validation, pagination, provider errors, sanitized fixtures and tests.
- M3 Authentication: PSN connection and encrypted credential lifecycle.
- M4 Library Sync: import PlayStation titles.
- M5 Trophy Sync: trophy groups, earned state, base/DLC separation.
- M6 Progress Events: detect newly earned trophies.
- M7 Public Share: stable revocable read-only links.
- M8 AI Context: compact AI-oriented API.
- M9 Dashboard: production MVP UX.
- M10 Hardening: security, observability, release preparation.

## Current implementation state

The repository contains a Next.js/TypeScript application shell, public health route, provider-neutral `PsnProvider`, `MockPsnProvider`, real `PsnApiProvider`, runtime mappers, provider error normalization, sanitized PSN fixtures, Vitest coverage, Playwright smoke coverage, PostgreSQL migrations and SQL invariant suites, ESLint/typecheck/build scripts, three-part GitHub Actions CI, `.env.example`, architecture/API/data-model/security/PSN documentation, and ADRs.

No Supabase production project is connected yet and no real PSN credential is stored. Automated tests remain fully offline with respect to PSN.

## Next milestone

**M3 · Authentication**.

M3 should provide the real connection lifecycle that constructs `PsnApiProvider` safely:

1. authenticate the TrophyBridge user through Supabase Auth;
2. accept NPSSO only through an authenticated server-side connection flow, never through source code or logs;
3. exchange NPSSO for PlayStation authorization;
4. resolve and persist stable PSN account identity;
5. discard NPSSO;
6. encrypt durable refresh credentials with AES-256-GCM and key versioning;
7. refresh access authorization when needed;
8. expose explicit connection states such as `connected`, `refreshing`, `reauth_required`, and `error`;
9. construct `PsnApiProvider` from the short-lived authorization and account identity;
10. add a manual smoke path that can call PSN without ever making live network access part of CI.

Before the first live trophy import, decide the preferred PSN trophy locale (for example `it-IT` versus account/default language). `PsnApiProvider` already supports this setting.

Do not start library persistence orchestration until the authentication/credential lifecycle is secure enough to provide a valid provider instance. Library sync remains M4.

## Documentation map

- `README.md`: project overview and roadmap
- `docs/ARCHITECTURE.md`: system boundaries and persistence/provider flow
- `docs/API.md`: public API contract
- `docs/DATA_MODEL.md`: definitive M1 persistence model
- `docs/SECURITY.md`: security and privacy model
- `docs/PSN_INTEGRATION.md`: implemented M2 provider contract and auth boundary
- `docs/decisions/`: Architecture Decision Records
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity document for a fresh development chat
