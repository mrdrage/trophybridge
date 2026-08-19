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
- M5 `TrophySyncService`, Supabase repository/runtime, private game detail page, and manual `Sincronizza trofei` UI.
- M5 strict complete-snapshot validation for group identities, exact group-defined trophy counts, title/user trophy identity/type agreement, and hard size bounds.
- M5 server-only atomic `persist_game_trophy_snapshot` persistence for `trophy_groups`, `trophies`, `player_trophies`, and `sync_targets`.
- M5 per-account/game single-flight protection, five-minute default cooldown, stale-run recovery, 100-group ceiling, and 1,000-trophy ceiling.
- M5 unit and PostgreSQL invariant tests covering success, partial-response rejection, cooldown, out-of-library access, oversized input, upstream failure, monotonic earned state, metadata preservation, concurrency, and RPC privilege isolation.
- ADR 0012 documenting bounded atomic one-game trophy snapshots.

### Changed

- PSN identity resolution now falls back to `getProfileFromUserName` when Universal Search omits a valid owner, while final verification still requires `getProfileFromAccountId`, `isMe=true`, and exact Online ID matching.
- `account_games` stores `is_hidden` and `psn_last_updated_at` for lightweight library state.
- Library snapshots never delete titles omitted by a later response and do not regress known aggregate progress/trophy counts.
- Dashboard recent-game ordering uses PSN `psn_last_updated_at` before local `last_seen_at`, fixing arbitrary old-title ordering after a bulk import.
- The first live owner library smoke successfully imported 196 games.
- Detailed trophy state is now hydrated only for an explicitly selected game; library sync remains lightweight.
- Base `default` group progress and additional-group progress are displayed separately; additional groups do not contribute to base platinum status.
- Dashboard status advances to M5; M6 Progress Events is next after the live FF16 deep-sync validation.
- Free-tier pressure must throttle/stop optional work or serve last-good state rather than trigger a paid upgrade.

### Security

- NPSSO and PSN access tokens are never persisted.
- Refresh tokens are encrypted before persistence and never exposed through responses.
- Supabase privileged keys and TrophyBridge encryption keys remain server-only environment values.
- Browser roles have no privilege on `psn_credentials`, `persist_library_snapshot`, or `persist_game_trophy_snapshot`.
- Deep trophy persistence rejects incomplete/inconsistent snapshots before write and preserves last-good state on provider failure.
- Trophy/library error persistence uses safe bounded codes/messages rather than raw provider exceptions.
- CI never contacts PlayStation Network and uses fabricated identities/credentials only.

### Cost controls

- Library sync is manual, one-hour cooldown, maximum 2,000 titles.
- Game trophy sync is manual, five-minute per-game cooldown, maximum 100 groups/1,000 trophies.
- No full-library deep hydration, cron, background polling, automatic retry loop, image mirroring, or new paid dependency is used through M5.
- The accepted hosted architecture remains Supabase Free + public GitHub/standard Actions + future Vercel Hobby only.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
