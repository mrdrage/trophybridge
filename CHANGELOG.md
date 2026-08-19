# Changelog

All notable changes to TrophyBridge are documented here. Public semantic-versioned releases begin after the `0.x` development phase.

## [Unreleased]

### Added

- M0 Next.js/TypeScript foundation, public health endpoint, tests, CI, and architecture documentation.
- M1 PostgreSQL/Supabase factual trophy model with constraints, RLS, monotonic earned-state protection, event deduplication, and PostgreSQL invariant tests.
- M2 provider-neutral PlayStation contract and real `PsnApiProvider` over pinned `psn-api` 2.18.1, including pagination, validation, stable errors, locale headers, and sanitized fixtures.
- M3 Supabase SSR authentication with GitHub OAuth, transient NPSSO bootstrap, exact PSN identity verification, AES-256-GCM encrypted durable refresh credentials, refresh/disconnect lifecycle, private routes, RLS tests, and production Supabase schema.
- Italian `it-IT` trophy metadata locale as the pilot/default configuration.
- M4 authenticated manual library synchronization through `PsnConnectionService.createProviderForOwner()` and normalized `PsnProvider.getGames()`.
- M4 atomic `persist_library_snapshot` persistence with last-good preservation, monotonic aggregate progress/counts, provider timestamps, concurrency recovery, one-hour cooldown, and 2,000-title ceiling.
- M4 private dashboard library overview and `POST /api/private/v1/library/sync`.
- Zero-cost operating policy (`docs/COST_GUARDRAILS.md`) and ADR 0011, making €0/month a v0.1 architecture requirement.
- `pnpm dev:local` for the owner's reserved local port 3001.
- M5 lazy per-game trophy synchronization through `POST /api/private/v1/games/{gameId}/sync`.
- M5 strict complete-snapshot validation and server-only atomic `persist_game_trophy_snapshot` persistence.
- M5 per-account/game single-flight protection, five-minute cooldown, stale-run recovery, 100-group ceiling, and 1,000-trophy ceiling.
- ADR 0012 documenting bounded atomic one-game trophy snapshots.
- M6 server-only `persist_game_trophy_snapshot_with_events` wrapper that detects durable `earned=false -> true` transitions in the same transaction as factual trophy persistence.
- M6 `trophy_earned` events and dedicated `platinum_earned` events linked to the detecting game sync run.
- M6 baseline suppression so the first deep sync does not turn historical trophies into fake new activity.
- M6 propagation of `new_trophies_found` into sync summaries and `sync_runs` audit records.
- M6 recent-activity UI on the private game page, bounded to the 20 most recently detected trophy/platinum events.
- M6 PostgreSQL coverage for baseline suppression, transition detection, platinum events, idempotency, occurrence timestamps, active-run binding, and RPC privilege isolation.

### Changed

- PSN identity resolution falls back to `getProfileFromUserName` when Universal Search omits a valid owner, while final verification still requires `getProfileFromAccountId`, `isMe=true`, and exact Online ID matching.
- `account_games` stores `is_hidden` and `psn_last_updated_at` for lightweight library state.
- Library snapshots never delete titles omitted by a later response and do not regress known aggregate progress/trophy counts.
- Dashboard recent-game ordering uses PSN `psn_last_updated_at` before local `last_seen_at`.
- The first live owner library smoke successfully imported 196 games.
- Final Fantasy XVI M5 live validation persisted 3 trophy groups, 69 trophies, and 69 player-state rows, 17 of them earned.
- Detailed trophy state is hydrated only for an explicitly selected game; library sync remains lightweight.
- Base `default` group progress and additional-group progress are displayed separately; additional groups do not contribute to base platinum status.
- Game sync now reports newly detected trophies after the baseline and shows recent events in the private UI.
- Dashboard/game status advances to M6; M7 Public Share is next after the first real post-baseline trophy delta is observed.
- Free-tier pressure must throttle/stop optional work or serve last-good state rather than trigger a paid upgrade.

### Security

- NPSSO and PSN access tokens are never persisted.
- Refresh tokens are encrypted before persistence and never exposed through responses.
- Supabase privileged keys and TrophyBridge encryption keys remain server-only environment values.
- Browser roles have no privilege on `psn_credentials`, `persist_library_snapshot`, `persist_game_trophy_snapshot`, or the M6 event-aware persistence wrapper.
- Deep trophy persistence rejects incomplete/inconsistent snapshots before write and preserves last-good state on provider failure.
- M6 event writes are bound to the active account/game sync run and share the same transaction as trophy-state persistence.
- Trophy/library error persistence uses safe bounded codes/messages rather than raw provider exceptions.
- CI never contacts PlayStation Network and uses fabricated identities/credentials only.

### Cost controls

- Library sync is manual, one-hour cooldown, maximum 2,000 titles.
- Game trophy sync is manual, five-minute per-game cooldown, maximum 100 groups/1,000 trophies.
- Progress-event detection piggybacks on the existing manual game sync and introduces no queue, cron, polling service, or hosted dependency.
- Recent event reads are capped at 20 rows per game page.
- No full-library deep hydration, automatic retry loop, image mirroring, or new paid dependency is used through M6.
- The accepted hosted architecture remains Supabase Free + public GitHub/standard Actions + future Vercel Hobby only.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
