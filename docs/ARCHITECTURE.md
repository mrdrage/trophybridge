# TrophyBridge Architecture

## System intent

TrophyBridge isolates PlayStation integration, factual persistence, private owner controls and public AI consumption so unstable/community-documented PSN behavior does not leak into the product contract.

```text
PlayStation Network
        |
        v
    psn-api 2.18.1
        |
        v
   PsnApiProvider -> PsnProvider
        |
        +-----------------------------+
        |                             |
        v                             v
 Authentication                 Sync services
 encrypted refresh             M4 / M5-M8
 credential                         |
                                    v
                               PostgreSQL
                               /        \
                      private UI    public capability API
                                         |
                             ai-context + bounded fresh=1
                                         |
                                         v
                                      AI client
```

## Authentication boundary

GitHub OAuth through Supabase Auth identifies the TrophyBridge owner. The connected target PlayStation identity is verified separately.

NPSSO is accepted only by a private server route during bootstrap, exchanged for PlayStation authorization and discarded. Access tokens are runtime-only. The durable refresh credential is encrypted server-side.

All current PSN synchronization obtains its provider through `PsnConnectionService.createProviderForOwner(ownerUserId)`. Sync code never decrypts credential rows directly.

## Provider boundary

Application code consumes TrophyBridge-owned provider operations for account, games, groups, trophy definitions and user trophy states. The adapter handles PS5 `trophy2` versus legacy `trophy`, pagination, locale, validation, platform normalization and stable provider errors. The pilot locale is `it-IT`.

## Factual persistence paths

M4 library sync is lightweight and bounded. M5 hydrates exactly one selected game's complete trophy snapshot after strict completeness checks. M6 wraps that persistence so durable `earned=false -> true` transitions create deduplicated progress events while the first snapshot remains a baseline.

The real pilot contains 196 library titles. Final Fantasy XVI has 3 groups, 69 trophies and 18 earned states after the first real post-baseline event.

## Public capability boundary

M7 activates account-level sharing without granting database roles to public consumers.

```text
owner generates random 256-bit tb1_... token
        |
        +--> plaintext returned once
        |
        v
SHA-256 token hash stored in share_links
        |
public request carries plaintext token
        |
        v
server hashes -> resolves active capability -> allowlisted serializer
```

Only one active account share is allowed. Regeneration atomically revokes the prior capability. Hidden games are excluded, auth material/stable numeric PSN IDs are excluded, and unearned hidden trophy name/description/icon are masked.

Public responses are non-cacheable, non-indexed and use `Referrer-Policy: no-referrer`.

## Public route family through M8

```text
/api/public/v1/share/{token}
/api/public/v1/share/{token}/games
/api/public/v1/share/{token}/games/{gameId}
/api/public/v1/share/{token}/games/{gameId}/trophies
/api/public/v1/share/{token}/games/{gameId}/ai-context
```

## M8 AI context and freshness

M8 implements demand-driven freshness so normal AI usage does not require the owner to press a sync button and does not require an always-on polling worker.

```text
AI requests ai-context?fresh=1
        |
        v
validate active share + visible game
        |
        v
read durable trophy state
        |
        +--> < 10 min old: return DB state, no PSN
        |
        v
atomic per-share refresh-budget claim
        |
        +--> exhausted/revoked: serve cached state
        |
        v
TrophySyncService.sync(ownerUserId, gameId)
        |
        +--> existing 300s cooldown
        +--> DB single-flight
        +--> strict complete snapshot bounds
        |
        v
persist factual state/events -> reload AI context
```

The default public budget is 12 stale refresh claims/hour/share. One request can refresh one game only. This protects the zero-cost envelope and limits the impact of a leaked bearer capability.

If PSN/reauth/synchronization fails and durable trophy state exists, M8 serves that last-good state with explicit freshness/error metadata. Provider failure never deletes or regresses factual state.

AI context contains factual identity, base-game platinum progress, additional-group summary, bounded missing base trophies, recent M6 progress events and synchronization metadata. Strategic trophy guidance remains outside the factual synchronization layer.

## Target identity versus data-access credential

Current code couples the target owner identity and the PSN credential used for reads. `psn-api` documents that relevant trophy calls can query another PSN account when the authenticating account has permission to view the target.

A future authentication refinement should live-test:

```text
target PSN identity: mrdrage2 / stable accountId
PSN data-access identity: separately managed read credential
```

If the complete pilot flow works this way, recurring target-owner NPSSO entry can be removed without persisting the owner's NPSSO. Ownership verification remains separate. TrophyBridge makes no claim about PSNProfiles' private architecture.

## Zero-cost architecture

Accepted hosted envelope remains Supabase Free + public GitHub/standard Actions + Vercel Hobby. M4-M8 add no Redis, VPS, queue, worker, mirrored images or paid data broker. AI freshness is single-game, freshness-gated and share-budgeted.

## Failure behavior

Provider/snapshot failures record safe sync metadata and preserve last-good rows. Invalid/revoked public capabilities return stable error envelopes. A public freshness failure returns last-good state whenever possible rather than inventing or erasing data.

## Milestone boundary

M8 ends with a dedicated AI context and bounded no-click freshness. M9 refines the private owner dashboard and operational visibility. M10 performs hardening, hosted deployment and fresh-conversation validation.
