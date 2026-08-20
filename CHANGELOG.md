# Changelog

All notable TrophyBridge changes are documented here. Public semantic-versioned releases begin after the `0.x` development phase.

## [Unreleased]

### Added

- M0 Next.js/TypeScript foundation, CI, health endpoint and architecture documentation.
- M1 PostgreSQL/Supabase factual model, constraints, RLS, monotonic trophy-state protection and invariant tests.
- M2 provider-neutral `PsnProvider` plus pinned `psn-api` 2.18.1 adapter, validation, pagination and sanitized fixtures.
- M3 GitHub OAuth/Supabase SSR authentication, transient NPSSO bootstrap, exact target identity verification and AES-256-GCM encrypted durable refresh credentials.
- Italian `it-IT` trophy metadata locale.
- M4 bounded manual library synchronization and dashboard overview; real owner smoke imported 196 titles.
- M5 lazy one-game trophy synchronization, complete-snapshot validation, atomic persistence, base/additional separation and per-game cooldown/single-flight controls.
- M6 baseline-aware progress events, `new_trophies_found`, recent-activity UI and atomic event/state persistence.
- First real M6 post-baseline event: Final Fantasy XVI trophy `Fiamme gemelle`, moving the live earned count from 17 to 18.
- M7 high-entropy account share capabilities using 256 random bits and `tb1_...` token format.
- M7 SHA-256-only token persistence, one-active-share constraint, atomic rotate/revoke server RPCs and owner dashboard share panel.
- M7 public discovery, game-list, game-detail and filtered trophy routes.
- M7 spoiler masking for unearned hidden trophies and exclusion of hidden library titles.
- M7 non-cacheable/non-indexed public response headers and stable public error envelope with `request_id`.
- M7 unit/PostgreSQL coverage for token shape/hash, spoiler masking, one-active-link enforcement, rotation, revocation and RPC privilege isolation.
- ADR 0014 documenting hashed revocable bearer capability sharing.

### Changed

- Dashboard project status advances to M7 Public Share.
- The MVP public boundary now exposes durable factual data but deliberately leaves `ai_context=false` and `refresh=false` until M8.
- Public reads use PostgreSQL only and never contact PSN through M7.
- The roadmap now assigns bounded AI-triggered single-game freshness to M8 so the owner will not need to press the private trophy-sync button for normal AI use.
- PSN integration documentation distinguishes the target PSN identity from the authenticating data-access identity. Future work will test whether a separately managed TrophyBridge PSN credential can read the pilot target's trophy data under its privacy settings, avoiding repeated target-owner NPSSO entry.
- No claim is made about PSNProfiles' private implementation.

### Security

- NPSSO and PSN access tokens remain non-persistent.
- Refresh tokens remain encrypted before persistence.
- M7 plaintext public tokens are returned once to the generating owner session and never stored in PostgreSQL.
- Public/anon/authenticated roles cannot execute share mutation RPCs.
- Public serializers exclude stable numeric PSN account IDs and all credential material.
- Unearned hidden trophy name/description/icon are masked.
- Tokenized responses use `no-store`, `noindex`, `nofollow`, `noarchive`, `no-referrer` and `nosniff` headers.
- Regeneration revokes the prior active capability atomically; explicit revocation preserves factual trophy history.

### Cost controls

- Library sync: manual, one-hour cooldown, maximum 2,000 titles.
- Game sync: bounded one-game operation, five-minute default cooldown, maximum 100 groups/1,000 trophies.
- M6 event detection adds no polling path.
- M7 public reads are database-only with bounded pagination and no PSN fan-out.
- No queue, cron, background worker, Redis, VPS, image mirroring or new paid dependency is used through M7.
- Accepted hosted target remains Supabase Free + public GitHub/standard Actions + Vercel Hobby.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
