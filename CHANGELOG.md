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
- M8 `GET /api/public/v1/share/{token}/games/{gameId}/ai-context` with factual identity, base platinum progress, bounded missing base trophies, recent activity and sync metadata.
- M8 `fresh=1` single-game on-demand freshness path reusing `TrophySyncService` and its existing 300-second cooldown, single-flight lock and snapshot limits.
- M8 atomic per-share AI refresh budget, default 12 stale refresh claims/hour, service-role-only PostgreSQL claim function and revoked-share rejection.
- M8 last-good fallback when requested PSN refresh cannot complete but a durable trophy snapshot already exists.
- M8 unit/PostgreSQL coverage for no-refresh reads, successful stale refresh, budget exhaustion, reauthentication fallback and atomic quota windows.
- ADR 0014 documenting hashed revocable bearer capability sharing.
- ADR 0015 documenting bounded AI-triggered freshness.

### Changed

- Public discovery now advertises `ai_context=true` and `refresh=true`.
- Normal AI usage no longer requires the owner to press the private trophy-sync button: an AI client may request freshness on the one game it is using.
- Fresh-enough `fresh=1` requests are database-only and do not contact PSN.
- AI context embeds at most 200 missing base trophies by default; the normal filtered trophy endpoint remains the complete factual source.
- Public refresh failures preserve availability by serving last-good cached state with explicit refresh outcome metadata.
- PSN integration documentation distinguishes target PSN identity from authenticating data-access identity. A future controlled test will evaluate a separate TrophyBridge PSN read credential to remove recurring target-owner NPSSO entry.
- No claim is made about PSNProfiles' private implementation.
- Roadmap advances to M9 Dashboard after M8.

### Security

- NPSSO and PSN access tokens remain non-persistent; refresh tokens remain encrypted server-side.
- Public capability plaintext remains returned only to the generating owner session; PostgreSQL stores only its hash.
- Public/anon/authenticated roles cannot execute share mutation or M8 AI refresh-budget RPCs.
- Revoked capabilities cannot claim new PSN refresh work.
- Hidden games remain excluded and unearned hidden trophy name/description/icon remain masked.
- Tokenized responses remain `no-store`, non-indexed, `no-referrer` and `nosniff`.
- A leaked capability has bounded upstream-work impact because stale AI refresh claims are quota-limited and still pass through per-game synchronization gates.

### Cost controls

- Library sync: minimum one-hour interval, maximum 2,000 titles.
- Game sync: five-minute default cooldown, maximum 100 groups/1,000 trophies, one running sync/account/game.
- AI-context freshness: ten-minute default freshness threshold, 12 stale refresh claims/hour/share, maximum one game/request.
- M8 is demand-driven and introduces no cron, queue, background worker, Redis, VPS, image mirroring or new paid dependency.
- Accepted hosted target remains Supabase Free + public GitHub/standard Actions + Vercel Hobby.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
