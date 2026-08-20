# Changelog

All notable TrophyBridge changes are documented here. Public semantic-versioned releases begin after the `0.x` development phase.

## [Unreleased]

### Added

- M0 Next.js/TypeScript foundation, CI, health endpoint and architecture documentation.
- M1 PostgreSQL/Supabase factual model, constraints, RLS, monotonic trophy-state protection and invariant tests.
- M2 provider-neutral `PsnProvider` plus pinned `psn-api` 2.18.1 adapter, validation, pagination and sanitized fixtures.
- M3 GitHub OAuth/Supabase SSR authentication, transient NPSSO bootstrap, exact target identity verification and AES-256-GCM encrypted durable refresh credentials.
- Italian `it-IT` trophy metadata locale.
- M4 bounded library synchronization; real owner smoke imported 196 titles.
- M5 lazy one-game trophy synchronization, atomic complete snapshots, base/additional separation and cooldown/single-flight controls.
- M6 baseline-aware progress events and first real post-baseline event, Final Fantasy XVI `Fiamme gemelle`, moving live earned state from 17 to 18.
- M7 256-bit `tb1_...` public capabilities, SHA-256-only persistence, atomic rotation/revocation, owner share panel and read-only public game/trophy endpoints.
- M7 exclusion of hidden library titles, spoiler masking for unearned hidden trophies, non-cacheable/non-indexed response headers and stable public errors.
- M8 AI context endpoint, bounded `fresh=1` single-game refresh, per-share hourly refresh budget and last-good fallback.
- M9 owner command-center dashboard with PSN/share/library summary and recent-game continuation.
- M9 searchable full-library page and redesigned Platinum-focused game detail.
- M9 migration allowing `psn_credentials.refresh_token_expires_at` to be unknown after a provider token rotation that omits a new lifetime.
- M9 tests proving a rotated refresh token without a new expiry does not inherit the previous token's absolute expiry.
- ADR 0014 documenting hashed revocable bearer capability sharing.
- ADR 0015 documenting bounded AI-triggered freshness.

### Changed

- Normal AI usage no longer requires the owner to press the private trophy-sync button; manual game refresh remains only an optional fallback.
- JSON capability endpoints are explicitly presented as machine interfaces while the owner uses the M9 visual dashboard.
- Library browsing remains bounded but the owner can now search all current pilot titles in one view.
- PSN refresh handling now distinguishes a known expiry on the current token from an obsolete expiry belonging to a replaced token.
- If Sony rotates the refresh token without returning a new `refresh_token_expires_in`, TrophyBridge stores the new encrypted token with unknown local expiry and lets PSN determine validity on the next refresh.
- A new NPSSO is therefore no longer scheduled merely because the original refresh token had a roughly 10-day lifetime; it is required only when PSN genuinely rejects/revokes authorization or a known current token expires.
- No claim is made about PSNProfiles' private implementation.
- Roadmap advances to hosted M9 activation and then M10 hardening/final validation.

### Security

- NPSSO and PSN access tokens remain non-persistent; refresh tokens remain encrypted server-side.
- Unknown local refresh-token expiry does not mean unauthenticated access: every subsequent refresh still goes to PSN and can be rejected by Sony.
- Public capability plaintext remains returned only to the generating owner session; PostgreSQL stores only its hash.
- Public/anon/authenticated roles cannot execute share mutation or AI refresh-budget RPCs.
- Revoked capabilities cannot claim new PSN refresh work.
- Hidden games remain excluded and unearned hidden trophy name/description/icon remain masked.

### Cost controls

- Library sync: minimum one-hour interval, maximum 2,000 titles.
- Game sync: five-minute default cooldown, maximum 100 groups/1,000 trophies, one running sync/account/game.
- AI-context freshness: ten-minute default freshness threshold, 12 stale refresh claims/hour/share, maximum one game/request.
- M9 dashboard and refresh-rotation fix introduce no queue, cron, worker, Redis, VPS, image mirroring or paid dependency.
- Hosted target remains Supabase Free + public GitHub/standard Actions + Vercel Hobby.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
