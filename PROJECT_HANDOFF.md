# TrophyBridge Project Handoff

Last updated: 2026-08-19

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, keeps base-game trophies separate from additional groups, and will expose a stable read-only public API that a fresh AI conversation can inspect without screenshots or manual trophy lists.

Pilot account: `mrdrage2`.
Pilot game: Final Fantasy XVI on PS5.
Preferred trophy locale: `it-IT`.
Repository: `mrdrage/trophybridge`.
Operating-cost requirement: **€0/month**.
Owner local development port: `3001`; another local project uses `3000`.

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

## Milestone status

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication implementation/schema and live owner connection
- ✅ M4 Library Sync implementation/schema and live 196-title smoke
- ✅ M5 Trophy Sync implementation/schema; live FF16 deep-sync smoke is the immediate operational validation
- M6 Progress Events
- M7 Public Share
- M8 AI Context
- M9 Dashboard
- M10 Hardening

## Authentication state

The real owner flow has been validated.

- GitHub OAuth works locally.
- PSN Online ID `mrdrage2` is connected.
- Universal Search can omit this valid account, so the authentication client first tries exact Universal Search and then falls back to `getProfileFromUserName` when necessary.
- The fallback never establishes identity by itself. TrophyBridge always finishes with `getProfileFromAccountId`, requiring `isMe=true` and the exact claimed Online ID.
- NPSSO is never persisted.
- PSN access tokens are never persisted.
- The durable refresh token is encrypted with AES-256-GCM in server-only `psn_credentials`.
- `PsnConnectionService.createProviderForOwner(ownerUserId)` is the only allowed synchronization boundary for obtaining an authenticated provider.

## M4 live validation

The M4 end-to-end smoke is complete.

Real production result on 2026-08-19:

```text
library sync status: success
games processed: 196
games stored: 196
account_games stored: 196
```

The imported data includes `FINAL FANTASY XVI` on PS5 at 19% aggregate PSN library progress, with the latest provider update timestamp at the time of the smoke.

A dashboard bug initially showed old PS3 titles because every first-import row had the same local `last_seen_at`. PR #7 corrected the overview to order first by `psn_last_updated_at` descending and only then by local `last_seen_at`.

M4 persistence remains conservative: omitted titles are not deleted, aggregate counters/progress do not regress, and only one library run can be active per account.

## M5 Trophy Sync

M5 is implemented on the private, lazy single-game path.

Key components:

```text
lib/trophies/types.ts
lib/trophies/errors.ts
lib/trophies/service.ts
lib/trophies/repository.ts
lib/trophies/runtime.ts
lib/api/trophy-response.ts
app/api/private/v1/games/[gameId]/sync/route.ts
app/dashboard/games/[gameId]/page.tsx
app/dashboard/games/[gameId]/trophy-sync-button.tsx
supabase/migrations/20260819193000_m5_trophy_sync.sql
tests/unit/trophy-sync-service.test.ts
tests/integration/domain_trophy_sync.sql
```

Flow:

```text
Authenticated owner
  -> select one existing account_game
  -> POST /api/private/v1/games/{gameId}/sync
  -> TrophySyncService
  -> PsnConnectionService.createProviderForOwner(ownerUserId)
  -> PsnProvider.getTrophyGroups()
  -> PsnProvider.getTrophies()
  -> PsnProvider.getUserTrophies()
  -> strict complete-snapshot validation
  -> persist_game_trophy_snapshot(...)
  -> trophy_groups + trophies + player_trophies
  -> sync_runs + sync_targets
  -> private game detail
```

Validation before persistence requires:

- at most 100 groups and 1,000 trophies/user states;
- unique group IDs;
- unique title trophy IDs;
- unique user trophy IDs;
- exactly one base group and it must be PSN group `default`;
- every title trophy belongs to a returned group;
- actual bronze/silver/gold/platinum counts for every group exactly match the provider's `definedTrophies` totals;
- title and user trophy arrays have the same complete identity set;
- user trophy type agrees with title metadata.

If validation or PSN fails, the old factual state remains untouched. The database function is atomic and server-role-only. Earned state cannot regress; known localized metadata is preserved if a later provider response has a null field.

Base and additional groups are structurally separate. The private detail exposes base trophy count/earned count and base platinum status separately from additional-group progress. M5 does not generate progress events; that belongs to M6.

## M5 zero-cost guardrails

```text
GAME_SYNC_MIN_INTERVAL_SECONDS=300
GAME_SYNC_MAX_GROUPS=100
GAME_SYNC_MAX_TROPHIES=1000
GAME_SYNC_STALE_AFTER_SECONDS=600
one running game sync per account/game
manual game sync only
```

No library-wide trophy hydration, cron, background polling, automatic retry loop, image mirroring, or new paid dependency was added.

## Production Supabase state

Project ref: `aecehligohfsjqbgoeeo`, region `eu-west-3`.

Applied production migrations:

```text
20260819123205 m1_domain_model
20260819123353 m1_integrity_refinements
20260819123405 m3_authentication
20260819123600 m3_database_hardening
20260819143049 m4_library_sync
20260819192017 m5_trophy_sync
```

Post-M5 verification:

```text
persist_game_trophy_snapshot exists: yes
one-running-game-sync index exists: yes
authenticated can execute deep persistence: no
service_role can execute deep persistence: yes
games/account_games preserved after migration: 196 / 196
trophy_groups/trophies/player_trophies before first M5 live smoke: 0 / 0 / 0
```

Security advisor status after M5 contains the expected informational RLS-without-policy notices for intentionally server-only/deny-by-default tables. A separate Supabase Auth warning says leaked-password protection is disabled; TrophyBridge currently uses GitHub OAuth rather than password sign-in, so this is not an M5 regression and can be revisited during hardening. Performance notices are unused-index informational findings expected before real deep-trophy traffic.

Never paste NPSSO, OAuth client secrets, Supabase secret/service-role keys, refresh/access tokens, or the TrophyBridge encryption key into chat, GitHub, logs, screenshots, or documentation.

## Immediate next operational step

Update the owner's local `main`, open Final Fantasy XVI from the dashboard, and press `Sincronizza trofei` exactly once. Then verify production rows:

- one `default` base group;
- additional groups separately classified;
- trophy metadata in `it-IT` when PSN supplies localization;
- player earned states and earned timestamps;
- base platinum progress excludes additional groups;
- successful `game` sync run and per-game cooldown;
- `progress_events` remains empty because event generation is M6.

Fixture CI does not replace this live PSN smoke. After this validation, proceed to M6.

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

Normal public reads must use durable database state. Any future refresh path must reuse the bounded per-game synchronization boundary rather than permit unbounded PSN calls.

## Documentation map

- `README.md`: overview/status
- `docs/ARCHITECTURE.md`: system boundaries
- `docs/API.md`: API contract
- `docs/DATA_MODEL.md`: factual persistence model
- `docs/SECURITY.md`: security model
- `docs/PSN_INTEGRATION.md`: provider/auth boundary
- `docs/COST_GUARDRAILS.md`: zero-cost operating envelope
- `docs/decisions/`: ADRs
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity
