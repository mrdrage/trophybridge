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
- M4 atomic `persist_library_snapshot` PostgreSQL persistence with last-good preservation, monotonic aggregate progress/counts, hidden/provider timestamp state, and processed/discovered counts.
- M4 sync-run concurrency protection, stale-run recovery, one-hour default cooldown, and 2,000-title hard ceiling in both application and database layers.
- M4 private dashboard library overview and `POST /api/private/v1/library/sync`.
- M4 unit and PostgreSQL tests for success, cooldown, provider failure, oversized input, omission safety, monotonicity, concurrency, and privileged function access.
- Zero-cost operating policy (`docs/COST_GUARDRAILS.md`) and ADR 0011, making €0/month a v0.1 architecture requirement.
- `pnpm dev:local` convenience script for local port 3001 while retaining port 3000 for standard/CI development.

### Changed

- `account_games` now stores `is_hidden` and `psn_last_updated_at` for lightweight library state.
- Library snapshots never delete titles omitted by a later upstream response and do not regress known aggregate progress/trophy counts.
- Dashboard status advances to M4; M5 Trophy Sync is the next implementation milestone.
- Free-tier pressure must throttle/stop optional synchronization or serve last-good state rather than trigger a paid upgrade.

### Security

- NPSSO and PSN access tokens are never persisted.
- Refresh tokens are encrypted before persistence and never exposed through responses.
- Supabase privileged keys and encryption keys remain server-only environment values.
- Browser roles have no privilege on `psn_credentials` or the M4 library persistence function.
- Library error persistence uses safe bounded error codes/messages rather than raw provider exceptions.
- CI never contacts PlayStation Network and uses fabricated identities/credentials only.

### Cost controls

- M4 uses manual synchronization only, with no cron/background polling or automatic retry loop.
- PSN artwork remains referenced by upstream URL instead of mirrored into Supabase Storage.
- Dashboard library reads are bounded, and concurrent sync work is single-flight per account.
- The accepted hosted architecture is Supabase Free + public GitHub/standard Actions + future Vercel Hobby only.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
