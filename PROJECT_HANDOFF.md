# TrophyBridge Project Handoff

Last updated: 2026-08-20

## Mission

TrophyBridge is a privacy-first bridge between PlayStation trophy state and AI-assisted platinum tracking. It synchronizes factual PSN data, separates base-game trophies from additional groups, records newly observed earned events, exposes a revocable public capability, and gives an AI a compact game context that can request bounded freshness without asking the owner to press a sync button.

Pilot account: `mrdrage2`.
Pilot game: Final Fantasy XVI on PS5.
Preferred trophy locale: `it-IT`.
Repository: `mrdrage/trophybridge`.
Operating-cost requirement: **€0/month**.
Owner local development port: `3001`; another local project uses `3000`.

## MVP definition of done

1. Owner signs in.
2. PSN target identity is connected and verified.
3. Library synchronization discovers the pilot game.
4. Game synchronization imports complete groups/trophy/player state.
5. Base platinum progress excludes additional groups.
6. Newly earned trophies are detected after a baseline.
7. A revocable public capability exposes factual state.
8. A fresh AI conversation can consume an optimized current-game context.
9. The AI can request bounded freshness without the owner manually pressing a sync button.
10. Hosted deployment remains inside the zero-cost envelope.

Items 1-9 are implemented. Item 10 requires the later Vercel Hobby deployment/final hosted validation.

## Stack

TypeScript, Next.js App Router, Node 24, pnpm 11.20.0, PostgreSQL/Supabase Free, Supabase Auth + SSR, GitHub OAuth, `psn-api` 2.18.1 behind `PsnApiProvider`, Zod, AES-256-GCM, Vitest, PostgreSQL invariant tests, Playwright, GitHub Actions, Vercel Hobby planned.

## Milestone status

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication implementation/schema + live owner connection
- ✅ M4 Library Sync + live 196-title validation
- ✅ M5 Trophy Sync + live Final Fantasy XVI baseline
- ✅ M6 Progress Events + first real post-baseline trophy detected
- ✅ M7 Public Share + production schema + local link validation
- ✅ M8 AI Context + bounded AI-triggered freshness implementation + production schema
- M9 Dashboard
- M10 Hardening + hosted deployment validation

M8 still needs the owner-local smoke after merge: open the AI-context URL, then `?fresh=1`, and confirm the JSON/freshness outcome. Hosted/fresh-ChatGPT access cannot be validated until deployment because localhost is unreachable remotely.

## Authentication state

Current synchronization uses the pilot owner's PlayStation authorization.

- GitHub OAuth works locally.
- PSN target `mrdrage2` is connected.
- Initial ownership is verified with stable account ID, `getProfileFromAccountId`, `isMe=true`, and exact Online ID matching.
- NPSSO is bootstrap-only and never persisted.
- PSN access tokens are runtime-only.
- The durable refresh credential is AES-256-GCM encrypted in server-only `psn_credentials`.
- Provider-reported refresh expiry is persisted.
- `PsnConnectionService.createProviderForOwner(ownerUserId)` remains the synchronization authorization boundary.
- If the durable credential expires/rejects, code enters `reauth_required` and M8 can still serve last-good data when it exists.

### Authentication architecture follow-up

`psn-api` 2.18.1 documents that `getUserTitles` and `getUserTrophiesEarnedForTitle` accept a numeric target account ID belonging to another PSN account when the authenticating account has permission to view that target trophy list.

Future controlled validation should therefore test:

```text
target identity: mrdrage2 + stable accountId
data-access identity: separately managed TrophyBridge PSN credential
```

If every required call works for the target under the pilot privacy settings, recurring owner NPSSO entry can be removed without ever persisting the owner's NPSSO. Ownership verification remains a separate concern and must not be weakened. Do not claim PSNProfiles uses this exact architecture; its private implementation is unknown.

Long-term persistence of the target owner's NPSSO is not accepted.

## Real data checkpoints

### M4

```text
games: 196
account_games: 196
```

### M5 baseline, Final Fantasy XVI

```text
game_id: 0e4a06e6-97f4-4115-bed0-0429dbcf9e7a
library progress at baseline: 19%
trophy groups: 3
trophies: 69
player rows: 69
earned at baseline: 17
progress_events at baseline: 0
```

### M6 first real delta

```text
trophy: Fiamme gemelle
PSN trophy id: 8
type: bronze
event: trophy_earned
occurred_at: 2026-08-20T10:52:46Z
detected_at: 2026-08-20T11:44:03.787Z
game sync status: success
trophies_processed: 69
new_trophies_found: 1
FF16 earned total after sync: 18
```

Production remains at 196 games/account_games, FF16 3 groups / 69 trophies / 69 player rows / 18 earned, and one real progress event after the M8 migration.

## M7 Public Share

One active account-level bearer capability exists at a time.

```text
plaintext: tb1_ + 43 base64url chars (256 random bits)
stored: SHA-256 hexadecimal hash only
```

The raw token is returned only when generated. Regeneration atomically revokes the old capability. Explicit revoke preserves trophy state.

Private endpoints:

```text
GET    /api/private/v1/share
POST   /api/private/v1/share
DELETE /api/private/v1/share
```

Public endpoints:

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games?limit=&offset=
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies?scope=base|dlc|all&status=earned|missing|all
```

Public responses are no-store/non-indexed/no-referrer, exclude hidden library games and auth material, and spoiler-mask unearned hidden trophy metadata.

The owner has already generated an M7 link locally and confirmed that it returns JSON.

## M8 AI Context

New endpoint:

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=1
```

Discovery now advertises `ai_context=true` and `refresh=true`.

AI context top-level contract:

```text
schema_version
generated_at
identity
progress
missing_trophies
recent_activity
sync
endpoints
```

The context is factual. It contains base platinum progress, additional-group summary, missing base trophies, recent M6 events and explicit sync/freshness metadata. Hidden unearned trophy names/descriptions/icons remain masked.

Default M8 guardrails:

```text
AI_CONTEXT_FRESHNESS_SECONDS=600
AI_CONTEXT_MAX_REFRESHES_PER_HOUR=12
AI_CONTEXT_MAX_MISSING_TROPHIES=200
```

### M8 `fresh=1` flow

```text
public capability
  -> visible game validation
  -> read durable trophy state
  -> fresh enough? return DB state, no PSN
  -> stale? atomic share refresh claim
  -> TrophySyncService.sync(ownerUserId, gameId)
  -> existing 300s game cooldown + DB single-flight + snapshot limits
  -> persist factual state/events
  -> reload AI context
```

One public request can refresh exactly one game. There is no full-library fan-out.

The per-share refresh budget is stored on `share_links` and claimed by server-only RPC `claim_share_ai_refresh`. `authenticated` cannot execute the RPC; `service_role` can. Revoked links cannot claim work.

If a requested refresh fails and cached trophy data exists, M8 serves last-good data with `served_last_good=true` and a factual outcome such as `reauth_required`, `upstream_unavailable`, `cooldown`, or `in_progress`. It does not regress the database.

### M8 production migration

Applied:

```text
name: m8_ai_context_refresh
Supabase version: 20260820130606
```

Direct verification after migration:

```text
claim_share_ai_refresh exists: yes
authenticated can execute claim: no
service_role can execute claim: yes
share_links: 1
active share_links: 1
active share ai_refresh_count: 0
games/account_games: 196 / 196
FF16 groups/trophies/player rows/earned: 3 / 69 / 69 / 18
progress_events: 1
```

The migration did not consume the owner's refresh budget or alter factual game/trophy state.

Security advisors show the same expected RLS-without-policy informational notices for deny-by-default/server-only tables and the pre-existing Supabase Auth leaked-password-protection warning. No new M8-specific actionable database warning appeared. Performance advisors remain unused-index informational notices on the tiny/new dataset.

## M8 testing

CI coverage includes:

- AI context returns platinum-focused state without refreshing unless requested;
- stale `fresh=1` claims budget and refreshes one game;
- successful refresh reloads the newly persisted state and exposes `new_trophies_found`;
- cached last-good state survives `reauth_required`;
- exhausted public budget serves cached data without PSN work;
- refresh policy values are bounded;
- PostgreSQL claim budget resets by window, denies excess claims, rejects revoked shares and is service-role-only.

The first M8 CI run caught only a strict TypeScript test-cast issue. It was fixed; the corrected run passed lint, typecheck, unit/integration tests, build, PostgreSQL invariants and Playwright.

## Local M8 smoke after merge

```bash
cd ~/trophybridge
git checkout main
git pull
pnpm install --frozen-lockfile
pnpm dev:local
```

Open the existing M7 discovery URL. Discovery should now show:

```text
ai_context: true
refresh: true
```

Use the FF16 `game_id` above and open:

```text
http://localhost:3001/api/public/v1/share/<TOKEN>/games/0e4a06e6-97f4-4115-bed0-0429dbcf9e7a/ai-context
```

Then test once with:

```text
...?fresh=1
```

Never paste the share token into GitHub or public chat. It is a revocable read-only bearer secret.

Expected JSON includes `identity`, `progress`, `missing_trophies`, `recent_activity`, and `sync`. Depending on age, `fresh=1` should show either `not_needed` or an attempted refresh outcome. A localhost link cannot yet be reached from a remote fresh ChatGPT conversation.

## Zero-cost guardrails

```text
library sync: >=3600s, <=2000 titles, one running/account
game sync: >=300s, <=100 groups, <=1000 trophies, one running/account/game
AI freshness threshold: 600s default
AI public refresh budget: 12/hour/share default
AI embedded missing trophies: <=200 default
one public request refreshes at most one game
one active share/account
no cron
no queue
no background worker
no image mirroring
no paid dependency
```

## Next milestone: M9 Dashboard

M9 should improve operational clarity rather than add a second factual source. Priorities:

- connection/reauth health and provider expiry visibility without exposing secrets;
- library/game freshness status;
- clear distinction between library sync and trophy sync;
- public-share status and revocation;
- AI-context/freshness status and budget visibility where useful;
- keep manual trophy sync as a diagnostic fallback, not a requirement for normal AI use;
- preserve mobile usability and the €0/month envelope.

M10 then performs hardening, Vercel Hobby deployment, public URL validation from a fresh ChatGPT conversation, quota/security review, and final release documentation.

## Documentation map

- `README.md`: project/status
- `docs/ARCHITECTURE.md`: boundaries and flows
- `docs/API.md`: private/public API contracts
- `docs/DATA_MODEL.md`: factual + share persistence
- `docs/SECURITY.md`: credentials/capability model
- `docs/PSN_INTEGRATION.md`: PSN provider/auth research
- `docs/COST_GUARDRAILS.md`: €0/month envelope
- `docs/decisions/0007-ai-context-endpoint.md`: AI context decision
- `docs/decisions/0014-hashed-revocable-capability-sharing.md`: M7 bearer capability decision
- `docs/decisions/0015-ai-triggered-freshness.md`: M8 bounded freshness decision
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity checkpoint
