# Changelog

All notable changes to TrophyBridge are documented here. Public semantic-versioned releases begin after the `0.x` development phase.

## [Unreleased]

### Added

- M0 Next.js/TypeScript foundation, public health endpoint, tests, CI, and architecture documentation.
- M1 PostgreSQL/Supabase factual trophy model with database constraints, RLS, monotonic earned-state protection, event deduplication, and PostgreSQL invariant tests.
- M2 provider-neutral PlayStation contract and real `PsnApiProvider` over pinned `psn-api` 2.18.1.
- M2 pagination, `trophy2`/`trophy` propagation, runtime provider validation, stable provider errors, locale headers, and sanitized PSN fixtures.
- M3 Supabase SSR authentication foundation with GitHub OAuth, private-session `proxy.ts`, and authenticated dashboard.
- M3 transient NPSSO bootstrap, exact PSN identity resolution, and `isMe` verification.
- M3 server-only `psn_credentials` persistence with AES-256-GCM encryption, fresh IVs, authentication tags, account-bound AAD, key versioning, refresh expiry, and rotation support.
- M3 PSN refresh/disconnect lifecycle and `PsnConnectionService.createProviderForOwner()` boundary for future synchronization.
- M3 owner-scoped `psn_accounts` read policy while credential ciphertext remains inaccessible to browser roles.
- M3 private connect/status/refresh/disconnect API routes with non-cacheable responses.
- M3 authentication, crypto, credential lifecycle, RLS/privilege, and connection-state tests.
- Italian `it-IT` trophy metadata locale as the pilot/default configuration.
- Exact `@supabase/ssr` and `@supabase/supabase-js` dependency locking.

### Changed

- TrophyBridge authentication routes now distinguish Supabase owner identity from verified PSN identity.
- `psn_accounts` now stores `preferred_locale` and v0.1 enforces one connected PSN account per TrophyBridge owner.
- The committed lockfile is refreshed for M3 dependencies and CI returns to frozen dependency installation.
- M4 Library Sync is the next implementation milestone after M3 activation.

### Security

- NPSSO and PSN access tokens are never persisted.
- Refresh tokens are encrypted before persistence and are never exposed through public/private responses.
- Supabase service-role and encryption keys remain server-only environment values.
- Authentication/session responses are private and non-cacheable.
- CI remains fully offline with respect to PlayStation Network and uses fabricated credentials only.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
