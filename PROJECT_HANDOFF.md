# TrophyBridge Project Handoff

Last updated: 2026-08-19

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, keeps base-game trophies separate from additional groups, records newly observed trophy progress, and will expose a stable read-only public API that a fresh AI conversation can inspect without screenshots or manual trophy lists.

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
- ✅ M5 Trophy Sync implementation/schema and live Final Fantasy XVI baseline smoke
- ✅ M6 Progress Events implementation; production rollout and first real post-baseline trophy delta are the remaining operational checks
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
- NPSSO is bootstrap-only and is never persisted.
- PSN access tokens are never persisted.
- The durable refresh token is encrypted with AES-256-GCM in server-only `psn_credentials`.
- PSN token responses include their refresh-token expiry and TrophyBridge persists the calculated `refresh_token_expires_at` metadata.
- `PsnConnectionService.createProviderForOwner(ownerUserId)` is the only allowed synchronization boundary for obtaining an authenticated provider. It refreshes the short-lived PSN access token with the encrypted refresh token and stores a rotated refresh token when PSN returns one.
- If the durable refresh credential becomes invalid/expired, the account moves to `reauth_required`; a new NPSSO must then be supplied through the private dashboard and is discarded again after bootstrap.

Never paste NPSSO, OAuth client secrets, Supabase secret/service-role keys, refresh/access tokens, or the TrophyBridge encryption key into chat, GitHub, logs, screenshots, or documentation.

## M4 live validation

Real production result on 2026-08-19:

```text
library sync status: success
games processed: 196
games stored: 196
account_games stored: 196
```

Final Fantasy XVI is present on PS5. Dashboard ordering uses `psn_last_updated_at` before local `last_seen_at`.

M4 persistence is conservative: omitted titles are not deleted, aggregate counters/progress do not regress, and only one library run can be active per account.

## M5 live validation

The real Final Fantasy XVI deep-trophy smoke succeeded on 2026-08-19.

Current baseline at that checkpoint:

```text
FINAL FANTASY XVI game_id: 0e4a06e6-97f4-4115-bed0-0429dbcf9e7a
library progress: 19%
trophy groups: 3
trophies: 69
player trophy rows: 69
earned trophies: 17
successful game sync runs: 1
progress_events: 0
```

This is the durable baseline M6 compares against. The empty event table is intentional and must not be backfilled with the 17 trophies already earned before M6 observation began.

M5 validation requires unique identities, exactly one `default` base group, exact group bronze/silver/gold/platinum counts, complete title/user trophy identity coverage, matching trophy types, and bounded response sizes. Failed or incomplete snapshots preserve last-good state.

## M6 Progress Events

M6 extends the existing manual one-game trophy sync without introducing a second PSN synchronization path.

Key implementation:

```text
lib/trophies/types.ts
lib/trophies/service.ts
lib/trophies/repository.ts
app/dashboard/games/[gameId]/page.tsx
app/dashboard/games/[gameId]/trophy-sync-button.tsx
supabase/migrations/20260819225000_m6_progress_events.sql
tests/unit/trophy-sync-service.test.ts
tests/integration/domain_progress_events.sql
docs/decisions/0013-baseline-aware-progress-events.md
```

Flow:

```text
Authenticated owner
  -> POST /api/private/v1/games/{gameId}/sync
  -> existing M5 complete snapshot validation
  -> active game sync run
  -> persist_game_trophy_snapshot_with_events(...)
       -> inspect durable pre-sync player_trophies
       -> capture earned=false -> incoming earned=true transitions
       -> delegate to M5 persist_game_trophy_snapshot(...)
       -> insert deduplicated progress_events
  -> sync_runs.new_trophies_found
  -> private recent-activity view
```

Event semantics:

```text
first deep sync                    -> factual baseline, no historical events
later normal false -> true         -> trophy_earned
later platinum false -> true       -> trophy_earned + platinum_earned
replay of same earned state        -> no duplicate event
```

`occurred_at` uses PSN `earnedDateTime` when present; otherwise it uses the sync timestamp. `detected_at` is the sync timestamp. Events are tied to the detecting `sync_run_id`.

`new_trophies_found` counts newly earned trophies rather than event rows, so a platinum transition counts as one new trophy even though it also gets a dedicated platinum event.

The M6 wrapper and delegated M5 factual persistence share one PostgreSQL transaction. A failure rolls back state and events together.

The private game page shows at most 20 recent events and opening the page never contacts PSN.

## M6 zero-cost guardrails

M6 reuses all M5 limits:

```text
GAME_SYNC_MIN_INTERVAL_SECONDS=300
GAME_SYNC_MAX_GROUPS=100
GAME_SYNC_MAX_TROPHIES=1000
GAME_SYNC_STALE_AFTER_SECONDS=600
one running game sync per account/game
manual game sync only
recent private progress events <=20
```

No queue, cron, polling worker, external event service, image mirroring, or new paid dependency was added. Detection piggybacks on the existing game sync.

## Production Supabase state before M6 rollout

Project ref: `aecehligohfsjqbgoeeo`, region `eu-west-3`.

Applied production migrations before M6:

```text
20260819123205 m1_domain_model
20260819123353 m1_integrity_refinements
20260819123405 m3_authentication
20260819123600 m3_database_hardening
20260819143049 m4_library_sync
20260819192017 m5_trophy_sync
```

M6 migration to apply after final CI:

```text
m6_progress_events
```

Post-rollout verification must confirm:

```text
M6 RPC exists
authenticated cannot execute it
service_role can execute it
196 games/account_games remain intact
FF16 remains 3 groups / 69 trophies / 69 player rows / 17 earned before a new trophy
progress_events remains 0 immediately after migration
```

## Immediate operational validation after M6 rollout

There is no need to manufacture a historical event. The first real M6 end-to-end validation happens after the owner earns another trophy in Final Fantasy XVI.

Then:

1. let PlayStation synchronize the new trophy;
2. wait until the 300-second TrophyBridge per-game cooldown permits a refresh;
3. press `Sincronizza trofei` once on the FF16 game page;
4. expect `newTrophiesFound` to be at least 1 and the UI to report the newly detected trophy;
5. verify one `trophy_earned` row with the PSN earned timestamp when available;
6. if the new trophy is platinum, also verify the dedicated `platinum_earned` row;
7. re-run the same sync later and confirm it does not duplicate the event.

A library re-sync is not required merely to detect a new trophy for an already known game.

## Public API plan

Version prefix: `/api/public/v1`.

Planned M7/M8 routes:

```text
/share/{token}
/share/{token}/games
/share/{token}/games/{gameId}
/share/{token}/games/{gameId}/trophies
/share/{token}/games/{gameId}/ai-context
```

M6 `progress_events` are the intended durable source for M8 `recent_activity`.

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
