# TrophyBridge Project Handoff

Last updated: 2026-08-20

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, separates base-game trophies from additional groups, records newly observed earned events and exposes revocable read-only JSON so an AI can understand current progress without screenshots or manual trophy lists.

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
10. Deployment remains inside the zero-cost envelope.

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
- ✅ M7 Public Share implementation + production schema
- M8 AI Context + bounded AI-triggered freshness
- M9 Dashboard
- M10 Hardening + hosted deployment validation

## Authentication state

Current M3-M7 implementation uses the pilot owner's PlayStation authorization for synchronization.

- GitHub OAuth works locally.
- PSN target `mrdrage2` is connected.
- Initial PSN ownership is verified with a stable account ID, `getProfileFromAccountId`, `isMe=true`, and exact Online ID matching.
- NPSSO is bootstrap-only and never persisted.
- PSN access tokens are runtime-only.
- The durable refresh credential is AES-256-GCM encrypted in server-only `psn_credentials`.
- Provider-reported refresh expiry is persisted.
- `PsnConnectionService.createProviderForOwner(ownerUserId)` is the synchronization authorization boundary.
- If the current durable owner credential expires/rejects, code enters `reauth_required`.

### Authentication architecture follow-up

Research after M6 established that target PSN identity and authenticating PSN identity do not inherently have to be the same. Community-documented PlayStation trophy endpoints accept a target numeric account ID and can return another account's trophies when the authenticating account has permission to view that target.

Future design should therefore test:

```text
target identity: mrdrage2 + stable accountId
data-access identity: separately managed TrophyBridge PSN credential
```

If all required calls work under the pilot's privacy settings, the target owner would not need to repeatedly provide NPSSO merely because the data-access credential rotates/expires. Ownership verification must remain distinct and cannot be weakened. Do not claim PSNProfiles uses this exact architecture; its private internals were not verified.

Persisting a target owner's NPSSO long term is not accepted.

## M4 live validation

Real first library sync:

```text
games processed/stored: 196
account_games: 196
```

Final Fantasy XVI is present on PS5. Library ordering uses PSN `psn_last_updated_at` before local import time. Persistence never deletes omitted titles or regresses known aggregate counters.

## M5 live validation

Initial real Final Fantasy XVI deep snapshot:

```text
game_id: 0e4a06e6-97f4-4115-bed0-0429dbcf9e7a
library progress at baseline: 19%
trophy groups: 3
trophies: 69
player rows: 69
earned at baseline: 17
progress_events at baseline: 0
```

M5 validates unique identities, exactly one `default` base group, group type counts, title/user identity coverage and matching trophy types. Deep persistence is atomic, bounded and server-only.

## M6 live validation

M6 production schema is active. The first real post-baseline test succeeded on 2026-08-20:

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

This proves M6 end to end against real PSN state. The event is not a historical backfill.

M6 semantics:

```text
first deep sync -> baseline, no events
later false -> true -> trophy_earned
later platinum false -> true -> trophy_earned + platinum_earned
replay same state -> no duplicate
```

## M7 Public Share

M7 adds one active account-level bearer capability at a time.

### Token contract

```text
plaintext: tb1_ + 43 base64url chars (256 random bits)
stored: SHA-256 hexadecimal hash only
```

The raw token is returned only when generated. TrophyBridge cannot reconstruct a lost URL from PostgreSQL. Regenerating creates a fresh token and atomically revokes the previous active capability. Explicit revoke leaves all factual trophy state intact.

### Private owner endpoints

```text
GET    /api/private/v1/share
POST   /api/private/v1/share
DELETE /api/private/v1/share
```

The dashboard M7 share panel can generate/regenerate, copy and revoke the capability.

### Public endpoints

```text
GET /api/public/v1/share/{token}
GET /api/public/v1/share/{token}/games?limit=&offset=
GET /api/public/v1/share/{token}/games/{gameId}
GET /api/public/v1/share/{token}/games/{gameId}/trophies?scope=base|dlc|all&status=earned|missing|all
```

M7 public reads:

- use durable PostgreSQL state only;
- never contact PSN;
- exclude hidden library games;
- mask name/description/icon for unearned hidden trophies;
- exclude stable numeric PSN account IDs and all auth material;
- are `no-store`, non-indexed and `no-referrer`;
- expose a stable error envelope with `request_id`;
- paginate game lists with default 100 / max 200.

M7 discovery advertises `ai_context=false` and `refresh=false`. M8 owns those capabilities.

### M7 production migration

Applied production migration name:

```text
m7_public_share
```

Direct post-migration verification:

```text
rotate_account_share_link exists: yes
revoke_account_share_link exists: yes
authenticated can execute rotate/revoke: no / no
service_role can execute rotate/revoke: yes / yes
games/account_games preserved: 196 / 196
FF16 groups/trophies/player rows/earned: 3 / 69 / 69 / 18
progress_events preserved: 1
share_links immediately after migration: 0
active shares immediately after migration: 0
```

No public link is manufactured by migration. Owner must explicitly create one.

Security advisors after M7 show the same expected RLS-without-policy informational notices on intentionally server-only/deny-by-default tables plus the pre-existing Supabase Auth leaked-password-protection warning. Current login uses GitHub OAuth. Performance advisors are unused-index informational notices on the tiny/new dataset.

## M7 CI history

Initial M7 CI caught two real defects:

- React lint rejected an unescaped apostrophe in the share panel;
- PostgreSQL reported an ambiguous `is_active` reference inside the new PL/pgSQL rotate function because output-column variables can shadow table columns.

Both were fixed. The corrected run passed lint, typecheck, unit tests, build and PostgreSQL domain invariants. Final PR CI should also complete Playwright before merge when runner infrastructure behaves normally.

## M8 accepted direction: no-click freshness

The owner explicitly does not want to press `Sincronizza trofei` forever. M8 should implement:

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
GET .../ai-context?fresh=1
```

Planned behavior:

1. resolve capability and target game;
2. read durable game/trophy/event state;
3. if `fresh=1`, evaluate last sync and configured freshness threshold;
4. if already fresh, do not call PSN;
5. if stale and the existing per-game cooldown/single-flight permits it, reuse `TrophySyncService` for exactly that game;
6. if refresh fails and last-good data exists, return it with stale/error freshness metadata;
7. never fan out across the full library from one public request.

This makes the AI capable of performing the refresh on demand, requires no always-on Mac, and avoids unnecessary background polling. Optional automatic scheduling can be evaluated separately only if it remains safely inside the zero-cost envelope.

Planned `ai-context` top-level fields:

```text
schema_version
identity
progress
missing_trophies
recent_activity
sync
```

M6 `progress_events` are the durable source for `recent_activity`.

## Local M7 validation

After M7 is merged, update local main:

```bash
cd ~/trophybridge
git checkout main
git pull
pnpm install --frozen-lockfile
pnpm dev:local
```

Open `http://localhost:3001/dashboard`, use the M7 Public Share panel and generate a link.

A local capability starts with `http://localhost:3001/...` and is only reachable from the owner's machine. It is not yet a valid remote/fresh-ChatGPT link. True internet access requires TrophyBridge deployment on Vercel Hobby, planned before final end-to-end AI validation.

Never paste NPSSO, OAuth client secrets, Supabase secret/service-role keys, PSN refresh/access tokens or the TrophyBridge encryption key into chat, GitHub, logs or screenshots. Treat an M7 share URL as a revocable read-only bearer secret too.

## Zero-cost guardrails

```text
library sync: >=3600s, <=2000 titles, one running/account
game sync: >=300s, <=100 groups, <=1000 trophies, one running/account/game
M7 public reads: PostgreSQL only
M7 games page: default 100, max 200
one active share/account
no cron
no queue
no background worker
no image mirroring
no paid dependency
```

## Documentation map

- `README.md`: project/status
- `docs/ARCHITECTURE.md`: boundaries and future freshness flow
- `docs/API.md`: private/public API contracts
- `docs/DATA_MODEL.md`: factual + share persistence
- `docs/SECURITY.md`: credentials/capability model
- `docs/PSN_INTEGRATION.md`: PSN provider/auth research
- `docs/COST_GUARDRAILS.md`: €0/month envelope
- `docs/decisions/`: ADRs
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity checkpoint
