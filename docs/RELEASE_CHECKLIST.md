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

## PSN authorization limitation

The M9 correction removes TrophyBridge's false refresh-token expiry inheritance but does not establish an indefinitely renewable public PSN authorization flow. A real Sony expiry/revocation can still require reauthentication. TrophyBridge intentionally does not persist the owner's NPSSO/password. If recurring target-owner reauthentication remains a practical problem, the supported next experiment is a separate PSN data-access identity tested against the verified target account.

## Release outcome

M0-M10 satisfy the TrophyBridge v0.1 MVP definition. Remaining work is operational maintenance, provider compatibility, optional UX/product improvements, and the separate PSN service-identity experiment if needed.
