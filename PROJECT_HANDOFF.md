# TrophyBridge Project Handoff

Last updated: 2026-08-19

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, keeps base-game trophies separate from additional groups, and will expose a stable read-only public API that a fresh AI conversation can inspect without screenshots or manual trophy lists.

Pilot account: `mrdrage2`.
Pilot game: Final Fantasy XVI on PS5.
Preferred trophy locale: `it-IT`.
Repository: `mrdrage/trophybridge`.
Operating-cost requirement: **€0/month**.
Local TrophyBridge development port for the owner: `3001` (another local project uses `3000`).

## MVP definition of done

1. TrophyBridge owner signs in.
2. Owner connects PSN securely.
3. Stable PSN identity is verified.
4. Library sync discovers Final Fantasy XVI.
5. Game sync imports groups, trophy metadata, and player state.
6. Platinum progress excludes additional trophy groups.
7. A revocable public share link is generated.
8. A fresh ChatGPT conversation can read current progress.
9. A newly earned trophy is detected on the next sync.
10. Updated state is visible to the AI client.
11. Personal deployment remains inside a documented zero-cost operating envelope.

## Stack

TypeScript, Next.js App Router, Node 24, pnpm 11.20.0, PostgreSQL/Supabase, Supabase Auth + SSR, GitHub OAuth, `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, SQL invariant tests, Playwright, GitHub Actions, Vercel Hobby planned.

## Completed milestones

### M0 Foundation

Application skeleton, quality gates, public health endpoint, CI, documentation, handoff discipline.

### M1 Domain Model

PostgreSQL factual trophy model with integrity constraints, RLS, monotonic earned-state protection, event deduplication, and SQL invariant tests.

### M2 PSN Provider

`PsnApiProvider` provides title/group/trophy/user-trophy reads with pagination, PS5 `trophy2` and legacy `trophy`, runtime validation, stable errors, locale headers, sanitized fixtures, and conservative numeric-progress semantics. `psn-api` is pinned exactly to 2.18.1.

### M3 Authentication

Supabase SSR + GitHub OAuth owner sessions; transient NPSSO bootstrap; exact PSN identity verification; AES-256-GCM encrypted refresh-token storage; refresh/reauth/disconnect lifecycle; owner-scoped non-secret RLS; server-only credential access; `PsnConnectionService.createProviderForOwner(ownerUserId)`.

NPSSO and PSN access tokens are never persisted. `it-IT` is saved as the preferred trophy locale.

### M4 Library Sync

M4 is the first factual PSN synchronization layer.

Implemented components:

```text
lib/library/types.ts
lib/library/errors.ts
lib/library/repository.ts
lib/library/service.ts
lib/library/runtime.ts
lib/api/library-response.ts
app/api/private/v1/library/sync/route.ts
app/dashboard/library-panel.tsx
supabase/migrations/20260819161000_m4_library_sync.sql
tests/unit/library-sync-service.test.ts
tests/integration/domain_library_sync.sql
```

Flow:

```text
TrophyBridge owner
  -> LibrarySyncService
  -> PsnConnectionService.createProviderForOwner(ownerUserId)
  -> PsnProvider.getGames()
  -> bounded atomic PostgreSQL snapshot
  -> games + account_games + sync_runs
  -> private dashboard overview
```

M4 imports only lightweight title state: provider identity, title, platforms, icon URL, aggregate progress/counts, hidden state, provider timestamp, and synchronization timestamps. Detailed trophy groups/metadata/player state remain M5.

Persistence properties:

- game identity remains `(np_communication_id, np_service_name)`;
- omitted titles are never deleted from last-good state;
- aggregate progress and trophy counters do not regress;
- PSN last-update time does not regress;
- mutable title/platform/icon/hidden metadata can update;
- only one running library sync is allowed per account;
- stale running sync records can be recovered;
- persistence is atomic through `persist_library_snapshot`;
- the persistence function is server-role-only.

## Zero-cost operating envelope

The user explicitly requires **€0/month** and does not want accidental overages.

Verified on 2026-08-19:

- connected Supabase organization is on the Free plan;
- connected Supabase database is healthy and about 11 MB before the first real PSN import;
- TrophyBridge GitHub repository is public and CI uses standard hosted runners;
- Vercel deployment is planned for Hobby only and has not yet been activated.

M4 application guardrails:

```text
LIBRARY_SYNC_MIN_INTERVAL_SECONDS=3600
LIBRARY_SYNC_MAX_GAMES=2000
LIBRARY_SYNC_STALE_AFTER_SECONDS=600
recent dashboard rows=12, bounded to 50
one running library sync/account
```

No library cron, background polling, automatic retry loop, image mirroring to Supabase Storage, or paid hosted dependency is used.

Quota-pressure policy: throttle/disable optional work, serve last-good state, or stop new synchronization before considering any paid tier. See `docs/COST_GUARDRAILS.md` and ADR 0011.

## Real Supabase project state

Project ref: `aecehligohfsjqbgoeeo`, region `eu-west-3`.

Production migrations now include M1 domain model, M1 integrity refinements, M3 authentication, M3 hardening, and **M4 Library Sync**. Direct post-migration verification confirms the M4 `account_games` columns exist, the `authenticated` role cannot execute `persist_library_snapshot`, and `service_role` can execute it.

Supabase security advisors report only informational RLS-without-policy notices on intentionally server-only/deny-by-default tables. Performance advisors report unused-index informational notices expected while the database contains no real imported game data. No new actionable M4 advisor finding remains.

Never paste NPSSO, OAuth client secrets, Supabase secret/service-role keys, refresh/access tokens, or the TrophyBridge encryption key into ChatGPT, GitHub issues, commits, logs, screenshots, or documentation.

## Live owner validation still required

The owner has TrophyBridge running locally on `http://localhost:3001` with environment configuration prepared. The real GitHub OAuth + PSN owner connection/smoke has not yet been recorded as successful.

Before claiming that M4 imported real data, the owner must:

1. sign in through GitHub OAuth;
2. connect `mrdrage2` through the private dashboard using NPSSO only in that dashboard;
3. verify PSN authorization refresh succeeds;
4. press the M4 library sync button;
5. confirm the real library appears and production rows are coherent.

Fixture-based CI is not a substitute for this operational smoke test.

## M4/M5 boundary

M5 must reuse the existing account/library rows and obtain PSN authorization through `PsnConnectionService`. It must lazily hydrate one selected game's trophy groups, title trophy metadata, and user trophy state.

M5 must not turn library synchronization into full-library deep trophy hydration. Deep imports remain game-scoped to protect PSN and free-tier budgets.

## Public API plan

Version prefix: `/api/public/v1`.

Planned:

```text
/share/{token}
/share/{token}/games
/share/{token}/games/{gameId}
/share/{token}/games/{gameId}/trophies
/share/{token}/games/{gameId}/ai-context
```

Public output is allowlist-based and excludes authentication material. Normal reads must use durable DB state, not trigger unbounded PSN refreshes.

## Roadmap

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication implementation/schema
- ✅ M4 Library Sync implementation/schema
- ⏳ owner live OAuth/PSN + real library smoke
- M5 Trophy Sync
- M6 Progress Events
- M7 Public Share
- M8 AI Context
- M9 Dashboard
- M10 Hardening

## Documentation map

- `README.md`: overview/status
- `docs/ARCHITECTURE.md`: boundaries
- `docs/API.md`: API contract
- `docs/DATA_MODEL.md`: factual persistence model
- `docs/SECURITY.md`: security model
- `docs/PSN_INTEGRATION.md`: provider/auth boundary
- `docs/COST_GUARDRAILS.md`: zero-cost operating envelope
- `docs/decisions/`: ADRs
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity
