# TrophyBridge v0.1 Release Checklist

Release review date: 2026-08-20.

## Product

- [x] PlayStation ownership/bootstrap flow implemented without persisting NPSSO.
- [x] Library synchronization validated against the pilot account (196 titles).
- [x] Per-game trophy synchronization validated with Final Fantasy XVI.
- [x] Base-game and additional trophy groups remain structurally separate.
- [x] Baseline-aware progress events detect new earned trophies without replaying historical trophies as new.
- [x] Revocable hashed public capability sharing is implemented.
- [x] AI context exposes compact Platinum-oriented state and bounded `fresh=1` refresh.
- [x] Human owner dashboard and searchable library are hosted.
- [x] Production GitHub OAuth reaches the hosted dashboard without localhost.

## Hosted production

- [x] Canonical origin: `https://trophybridge.vercel.app`.
- [x] Vercel deployment uses the GitHub repository and free Hobby envelope.
- [x] Supabase production project is healthy in `eu-west-3`.
- [x] Database migrations applied through `20260820204344_m10_release_hardening`.
- [x] Local Mac is not required for normal runtime or AI access.

## Security

- [x] PSN access token runtime-only; refresh credential encrypted AES-256-GCM.
- [x] Supabase service secret and token-encryption key are server-only.
- [x] `anon` has no direct TrophyBridge application-table privileges.
- [x] `authenticated` has only owner-RLS-protected `SELECT` on `psn_accounts`.
- [x] Public/browser roles cannot execute public-schema helper or snapshot/share RPC functions.
- [x] Future migration-owned tables/functions use restrictive default privileges.
- [x] State-changing `/api/private/*` requests enforce same-origin `Origin` validation.
- [x] Global framing/content-type/referrer/HSTS/permissions hardening enabled.
- [x] Application and capability surfaces opt out of search indexing.
- [x] Public share plaintext is never persisted; rotation/revocation is supported.
- [x] Hidden games and unearned hidden trophy metadata are excluded/masked publicly.

Known advisory: Supabase reports leaked-password protection disabled. TrophyBridge v0.1 owner authentication uses GitHub OAuth, not a TrophyBridge password flow. Server-only RLS tables also produce expected no-policy informational notices after browser grants are removed.

## Reliability and correctness

- [x] Complete bounded trophy snapshots are validated before writes.
- [x] Earned trophy state is monotonic.
- [x] Snapshot persistence is atomic.
- [x] Game sync uses cooldown, stale-run recovery and single-flight controls.
- [x] AI freshness uses a database-backed per-share hourly claim budget.
- [x] Provider failures preserve/serve last-good factual state when available.
- [x] Public API errors do not expose raw provider/database exceptions.
- [x] A provider-reported refresh-token expiry is advisory; TrophyBridge asks PSN before requiring reauthentication.
- [x] A successful refresh after a stale local expiry clears that obsolete deadline.
- [x] Genuine PSN rejection still clears the unusable credential and requests reauthentication.

## Cost

- [x] Mandatory operating target remains €0/month.
- [x] Supabase Free.
- [x] Vercel Hobby.
- [x] Public GitHub repository + standard GitHub Actions runners.
- [x] No VPS, Redis, queue, background worker, cron, image mirror, paid database or paid observability dependency.
- [x] Optional PSN work is demand-driven and bounded.

## Supply chain and quality gates

- [x] `pnpm-lock.yaml` committed; CI installs with frozen lockfile.
- [x] `psn-api` pinned exactly to the validated version.
- [x] Weekly Dependabot checks configured for npm and GitHub Actions.
- [x] Lint.
- [x] Typecheck.
- [x] Unit/integration tests.
- [x] Production build.
- [x] PostgreSQL migration/domain invariant tests.
- [x] Playwright smoke test including M10 headers/robots assertions.

## PSN authorization boundary

TrophyBridge no longer contains a fixed or locally enforced ten-day reauthentication rule. The stored expiry reported during bootstrap is retained only as metadata. Even after that timestamp, TrophyBridge attempts the encrypted durable refresh credential with PlayStation. If PSN accepts it, the app continues normally and removes a stale local deadline; if PSN genuinely rejects it, owner reauthentication may still be necessary.

TrophyBridge intentionally does not persist the owner's NPSSO/password. A separate PSN data-access identity remains an optional experiment only if real production observation later shows recurrent Sony-side credential rejection. PSNProfiles' private implementation is unknown and is not treated as an architectural specification.

## Release outcome

M0-M10 satisfy the TrophyBridge v0.1 MVP definition. Remaining work is operational maintenance, provider compatibility and optional product evolution rather than a missing milestone.
