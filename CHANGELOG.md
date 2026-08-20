# Changelog

All notable TrophyBridge changes are documented here.

## [0.1.0] - 2026-08-20

First end-to-end TrophyBridge MVP.

### Added

- M0 Next.js/TypeScript foundation, CI, health endpoint and architecture documentation.
- M1 PostgreSQL/Supabase factual model, constraints, RLS, monotonic trophy-state protection and invariant tests.
- M2 provider-neutral `PsnProvider` plus pinned `psn-api` 2.18.1 adapter, validation, pagination and sanitized fixtures.
- M3 GitHub OAuth/Supabase SSR authentication, transient NPSSO bootstrap, exact target identity verification and AES-256-GCM encrypted durable refresh credentials.
- Italian `it-IT` trophy metadata locale.
- M4 bounded library synchronization; real owner smoke imported 196 titles.
- M5 lazy one-game trophy synchronization, atomic complete snapshots, base/additional separation and cooldown/single-flight controls.
- M6 baseline-aware progress events and first real post-baseline event, Final Fantasy XVI `Fiamme gemelle`, moving live earned state from 17 to 18.
- M7 256-bit public capability tokens, SHA-256-only persistence, atomic rotation/revocation, owner share panel and read-only public game/trophy endpoints.
- M7 exclusion of hidden library titles, spoiler masking for unearned hidden trophies, non-cacheable/non-indexed public responses and stable errors.
- M8 AI context endpoint, bounded `fresh=1` single-game refresh, per-share hourly refresh budget and last-good fallback.
- M9 owner command-center dashboard, searchable library and Platinum-focused game detail.
- M9 hosted Vercel activation and production GitHub OAuth support.
- M9 refresh-token persistence semantics that allow unknown expiry after a genuine token rotation when PSN omits a new lifetime.
- M10 same-origin protection for state-changing private API requests.
- M10 global browser security headers and application-wide noindex/robots policy.
- M10 narrowed PostgreSQL browser-role privileges and restrictive default privileges for future migration-owned objects.
- M10 weekly Dependabot checks for npm and GitHub Actions.
- M10 v0.1 release/security checklist and ADR 0017.

### Changed

- Normal AI usage no longer requires the owner to press the private trophy-sync button; manual game refresh remains only an optional fallback.
- JSON capability endpoints are explicitly presented as machine interfaces while the owner uses the visual dashboard.
- The normal production origin is now `https://trophybridge.vercel.app`; localhost remains development-only.
- PSN refresh handling treats a provider-reported refresh-token expiry as advisory rather than a local kill switch: TrophyBridge attempts the durable credential with PSN before deciding that reauthentication is required.
- If PSN accepts a credential after its recorded local expiry, TrophyBridge discards that stale deadline; if Sony rotates the refresh token without returning a new `refresh_token_expires_in`, the replacement is likewise stored with unknown local expiry.
- A new NPSSO is requested only when PSN actually rejects the durable refresh credential or when no usable credential exists. TrophyBridge still does not claim that Sony guarantees perpetual authorization.
- No claim is made about PSNProfiles' private implementation; a separate PSN data-access identity remains an optional follow-up experiment only if Sony eventually proves to reject the owner's durable credential recurrently.

### Security

- NPSSO and PSN access tokens remain non-persistent; refresh tokens remain encrypted server-side.
- Public capability plaintext is returned only to the generating owner session; PostgreSQL stores only its hash.
- Public/anon/authenticated roles cannot execute server snapshot/share/refresh RPCs after M10; `service_role` remains the trusted boundary.
- `anon` has no direct TrophyBridge application-table privileges; `authenticated` has only owner-RLS-protected `SELECT` on `psn_accounts`.
- Private state-changing API requests reject missing/malformed/cross-origin browser Origin values.
- Global CSP frame/object/base restrictions, HSTS, no-referrer, no-sniff, frame denial, COOP and Permissions Policy are enabled.
- Hidden games remain excluded and unearned hidden trophy name/description/icon remain masked.
- Weekly dependency update proposals are enabled, but upgrades still pass the full CI gate.

### Cost controls

- Library sync: minimum one-hour interval, maximum 2,000 titles.
- Game sync: five-minute default cooldown, maximum 100 groups/1,000 trophies, one running sync/account/game.
- AI-context freshness: ten-minute default freshness threshold, 12 stale refresh claims/hour/share, maximum one game/request.
- Production remains Supabase Free + public GitHub/standard Actions + Vercel Hobby.
- v0.1 introduces no queue, cron, worker, Redis, VPS, image mirroring, paid database, paid rate-limit store or paid observability dependency.

## [Unreleased]

Future maintenance, provider compatibility updates and optional post-MVP product improvements will be recorded here.
