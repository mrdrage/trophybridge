# TrophyBridge Project Handoff

Last updated: 2026-08-20

## Mission

TrophyBridge is a privacy-first bridge between PlayStation trophy state and AI-assisted Platinum tracking. It synchronizes factual PSN data, separates base-game trophies from additional groups, records newly observed earned events, exposes a revocable public capability, and gives an AI a compact game context that can request bounded freshness without requiring the owner to press a sync button.

Repository: `mrdrage/trophybridge`.
Hosted app: `https://trophybridge.vercel.app`.
Pilot PSN Online ID: `mrdrage2`.
Pilot game: Final Fantasy XVI on PS5.
Preferred trophy locale: `it-IT`.
Operating-cost requirement: **€0/month**.
Local development port: `3001`; localhost is no longer a production/runtime dependency.

## v0.1 definition of done

The v0.1 MVP is complete:

1. GitHub-authenticated owner session.
2. Verified PSN target identity and secure credential bootstrap.
3. Real library synchronization.
4. Complete per-game trophy synchronization.
5. Base Platinum progress isolated from additional groups.
6. Baseline-aware new trophy events.
7. Revocable public capability sharing.
8. AI-specific current-game context.
9. AI-triggered bounded one-game freshness.
10. Human owner dashboard.
11. Hosted Vercel runtime with no required localhost.
12. Final M10 security/cost/supply-chain hardening.

## Stack

TypeScript, Next.js App Router 16, React 19, Node 24, pnpm 11.20.0, PostgreSQL/Supabase Free, Supabase Auth + SSR, GitHub OAuth, exact `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, PostgreSQL invariant tests, Playwright, public GitHub Actions standard runners, Vercel Hobby.

## Milestone status

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication + live owner connection
- ✅ M4 Library Sync + live 196-title validation
- ✅ M5 Trophy Sync + live Final Fantasy XVI baseline
- ✅ M6 Progress Events + first real post-baseline trophy
- ✅ M7 Public Share
- ✅ M8 AI Context + bounded AI freshness
- ✅ M9 Dashboard + hosted activation + PSN refresh-rotation correction
- ✅ M10 Hardening + production privilege review + release docs

Future work is maintenance/optional product evolution rather than a missing MVP milestone.

## Hosted production checkpoint

Canonical origin:

```text
https://trophybridge.vercel.app
```

Production GitHub OAuth has been validated by the owner and reaches `/dashboard` without localhost. PR #14 fixed the original hosted OAuth origin bug by deriving OAuth/callback origins from real request headers.

Supabase project:

```text
ref: aecehligohfsjqbgoeeo
region: eu-west-3
plan target: Free
status at M10 review: ACTIVE_HEALTHY
```

Production migrations are applied through:

```text
20260820204344  m10_release_hardening
```

## Real factual data checkpoint

Production after the M10 migration remains:

```text
games: 196
account_games: 196
trophy_groups: 3
trophies: 69
player_trophies: 69
progress_events: 1
active share capabilities: 1
```

Final Fantasy XVI:

```text
game_id: 0e4a06e6-97f4-4115-bed0-0429dbcf9e7a
platform: PS5
trophy groups: 3
trophies/player rows: 69 / 69
earned after first real M6 delta: 18
first post-baseline trophy: Fiamme gemelle
PSN trophy id: 8
type: bronze
event: trophy_earned
```

Only intentionally synchronized games receive deep trophy hydration; the 196-title library is not eagerly deep-hydrated.

## PSN authentication and the NPSSO limitation

The owner signs into TrophyBridge with Supabase Auth + GitHub OAuth. The PSN connection is a separate identity boundary.

Initial PSN bootstrap:

```text
Online ID + NPSSO
-> NPSSO exchanged server-side
-> stable accountId resolved
-> profile verified with isMe=true + Online ID match
-> NPSSO discarded
-> access token runtime-only
-> refresh token encrypted AES-256-GCM in server-only psn_credentials
```

All sync paths obtain a provider through `PsnConnectionService.createProviderForOwner(ownerUserId)`.

M9 fixed incorrect expiry inheritance. If PSN returns a **different** refresh token but omits a replacement `refresh_token_expires_in`, TrophyBridge stores the rotated encrypted token with unknown local expiry instead of copying the previous token's absolute deadline.

Important: this is not proof of indefinite PlayStation authorization. The public `psn-api` integration has no known supported endpoint that guarantees perpetual refresh-token renewal. A genuinely expired/revoked/rejected current credential can still require new authentication.

Do not solve this by persisting the owner's NPSSO or password.

If periodic owner reauthentication remains a practical issue, the next safe experiment is:

```text
verified target identity: mrdrage2 + stable accountId
data-access identity: dedicated TrophyBridge PSN account/credential
```

Validate every required provider call against the target account under the target privacy settings. This can move credential maintenance away from the target owner, but must not be described as a proven perpetual-token mechanism and must not claim knowledge of PSNProfiles' private backend.

## Synchronization model

Library sync:

```text
owner -> LibrarySyncService
      -> PsnConnectionService
      -> PsnProvider.getGames
      -> bounded atomic snapshot
      -> games/account_games/sync_runs
```

Game trophy sync:

```text
selected account_game
-> TrophySyncService
-> getTrophyGroups
-> getTrophies
-> getUserTrophies
-> strict complete-snapshot validation
-> atomic persist
-> progress-event delta detection
```

Core limits:

```text
library: >=3600s, <=2000 games
game: >=300s, <=100 groups, <=1000 trophies
stale run: 600s
one running library sync/account
one running game sync/account/game
```

Earned state is monotonic. Incomplete/inconsistent snapshots reject before persistence. Additional trophy groups never count toward base Platinum completion.

## Public share + AI context

One active capability per account. Token shape is `tb1_` + 256 bits random material; PostgreSQL stores SHA-256 only. Plaintext is shown only when generated. Regeneration revokes the prior link.

Public API:

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=0|1
```

`ai-context` contains identity, base Platinum progress, additional-group summary, bounded missing base trophies, recent progress events and explicit sync/freshness metadata.

`fresh=1` flow:

```text
validate active share + visible requested game
-> read durable trophy state
-> fresh enough: return DB, no PSN
-> stale: atomically claim share refresh budget
-> sync exactly one game through TrophySyncService
-> reload context
-> on provider failure, serve last-good state when available
```

Defaults:

```text
AI_CONTEXT_FRESHNESS_SECONDS=600
AI_CONTEXT_MAX_REFRESHES_PER_HOUR=12
AI_CONTEXT_MAX_MISSING_TROPHIES=200
```

Never paste a real public share token into GitHub/issues/docs. Treat the URL as a revocable read-only bearer secret.

## M9 dashboard

Owner-facing pages:

```text
/dashboard
/dashboard/library
/dashboard/games/{gameId}
```

JSON is deliberately a machine interface. The owner sees a human dashboard; the manual trophy-sync button remains an explicit fallback/diagnostic control rather than the normal AI flow.

## M10 hardening

M10 adds:

- no direct application-table privileges for `anon`;
- only `authenticated SELECT` on `psn_accounts`, still owner-filtered by RLS;
- no PUBLIC/anon/authenticated execution of public-schema helper/RPC functions;
- service-role-only execution of snapshot/share/refresh RPCs;
- restrictive default privileges for future migration-owned tables/functions;
- same-origin checks for state-changing `/api/private/*` requests;
- CSP/frame/no-sniff/no-referrer/HSTS/Permissions Policy hardening;
- global noindex + deny-all robots policy;
- weekly Dependabot npm/GitHub Actions checks;
- Playwright assertions for M10 browser headers/robots;
- `docs/RELEASE_CHECKLIST.md` and ADR 0017.

Production verification after migration found exactly one browser table grant:

```text
authenticated -> SELECT public.psn_accounts
```

Public/browser routine grants are absent; required server RPCs remain executable by `service_role`.

Supabase security advisors still show:

- informational `rls_enabled_no_policy` findings for intentionally server-only tables;
- warning: leaked-password protection disabled. TrophyBridge v0.1 owner login uses GitHub OAuth rather than an app password.

Performance advisors show only informational unused-index findings on the small pilot dataset.

## Zero-cost guardrails

Production uses:

```text
Supabase Free
Vercel Hobby
public GitHub repository
standard GitHub-hosted Actions
```

No VPS, Redis, queue, cron, worker, image mirror, paid DB, premium runner, distributed paid rate-limit store or paid observability service is required.

If quota pressure appears:

```text
reduce optional refresh frequency
-> tighten bounds
-> disable optional freshness
-> serve last-good state
-> temporarily refuse sync work
-> redesign
```

Never auto-upgrade to paid capacity.

## CI/release gate

Every meaningful release path must pass:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
PostgreSQL migration/domain invariants
Playwright smoke
```

`pnpm-lock.yaml` is committed and CI uses frozen installs. `psn-api` remains exactly pinned until explicitly revalidated.

## Known follow-ups after v0.1

1. Observe the real PSN refresh credential across its genuine Sony expiry window; do not assume a local date means rotation will or will not occur.
2. If recurring target-owner NPSSO remains annoying, run the dedicated PSN data-access identity experiment above.
3. Keep dependency/provider compatibility current through reviewed Dependabot PRs and CI.
4. Re-check Vercel/Supabase free-tier terms before adding recurring/background work.
5. Optional UI/product work may continue, but it is post-MVP.

## Documentation map

- `README.md`: current project/release state
- `docs/ARCHITECTURE.md`: component and trust boundaries
- `docs/API.md`: private/public API contracts
- `docs/DATA_MODEL.md`: factual/share persistence
- `docs/SECURITY.md`: credential/capability/hardening model
- `docs/PSN_INTEGRATION.md`: provider/auth research
- `docs/COST_GUARDRAILS.md`: €0/month envelope
- `docs/RELEASE_CHECKLIST.md`: v0.1 release validation
- `docs/decisions/0017-m10-release-hardening.md`: final hardening ADR
- `CHANGELOG.md`: release changes
- `PROJECT_HANDOFF.md`: this continuity checkpoint
