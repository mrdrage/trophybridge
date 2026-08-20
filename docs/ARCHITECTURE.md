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
   PsnApiProvider
        |
        v
     PsnProvider
        |
        +---------------------+
        |                     |
        v                     v
 Authentication          Sync services
        |                 M4 / M5-M6
        v                     |
 encrypted refresh            v
 credential              PostgreSQL
                         /        \
                        v          v
                Private dashboard  M7 public capability API
                                        |
                                        v
                                     AI client
```

## Authentication boundary

GitHub OAuth through Supabase Auth identifies the TrophyBridge owner. The connected target PlayStation identity is verified separately.

NPSSO is accepted only by a private server route during bootstrap, exchanged for PlayStation authorization, and discarded. Access tokens are runtime-only. The durable refresh credential is encrypted server-side.

All current PSN synchronization obtains its provider through `PsnConnectionService.createProviderForOwner(ownerUserId)`. Sync code never decrypts credential rows directly.

## Provider boundary

Application code consumes:

```text
getAccount()
getGames()
getTrophyGroups(game)
getTrophies(game)
getUserTrophies(game)
```

The adapter handles PS5 `trophy2` versus legacy `trophy`, pagination, locale, validation, platform normalization and stable provider errors. The pilot locale is `it-IT`.

## Factual persistence paths

M4 library sync is lightweight and bounded. It imports normalized title/library aggregates and preserves last-good values.

M5 hydrates exactly one selected game's complete trophy snapshot. Before persistence, identities, group counts and title/user coverage are validated. PostgreSQL then performs one atomic snapshot write.

M6 wraps the M5 write so durable `earned=false -> incoming earned=true` transitions create deduplicated progress events in the same transaction. The first deep snapshot is a baseline and creates no historical event flood.

The real pilot now has 196 library titles. Final Fantasy XVI has 3 groups, 69 trophies and 18 earned states after the first real M6 post-baseline event was detected.

## M7 public capability boundary

M7 activates account-level sharing without granting database roles to public consumers.

```text
owner POST /api/private/v1/share
        |
        v
random 256-bit tb1_... token
        |
        +--> plaintext returned once to owner browser
        |
        v
SHA-256 token hash
        |
        v
share_links
        |
public request carries plaintext token
        |
        v
server hashes -> resolves active capability -> allowlisted serializer
```

Only one active account share is allowed. Regeneration revokes the old capability atomically. Explicit revocation preserves all factual trophy data.

The public API is server-mediated. `anon`/browser roles do not gain direct table or RPC access. Public endpoints receive a bearer capability, resolve it through the trusted server client, and serialize only allowlisted fields.

## Public privacy rules

- hidden library games are excluded;
- stable PSN numeric account IDs are not exposed;
- auth material is permanently excluded;
- unearned hidden trophy name/description/icon are masked;
- public responses are non-indexed and non-cacheable;
- capability URL referrers are suppressed;
- M7 never contacts PSN on a public GET.

The optional share `last_used_at` metadata touch is best-effort and rate-limited by timestamp so telemetry cannot turn a valid read into failure.

## Public route family

```text
/api/public/v1/share/{token}
/api/public/v1/share/{token}/games
/api/public/v1/share/{token}/games/{gameId}
/api/public/v1/share/{token}/games/{gameId}/trophies
```

M8 owns `/ai-context` and freshness.

## Freshness architecture after M7

Opening dashboard/public pages reads PostgreSQL only. This is deliberate through M7.

The accepted M8 direction is **AI-triggered bounded freshness**, not requiring the owner to press a button and not requiring an always-on polling worker:

```text
AI requests ai-context?fresh=1
        |
        v
validate share + game
        |
        v
check last sync / cooldown / single-flight
        |
        +--> fresh enough: return durable state
        |
        +--> allowed stale: reuse TrophySyncService for one game
        |                   |
        |                   v
        |              validated PSN snapshot
        |                   |
        v                   v
             return fresh or last-good state
```

If PSN fails, last-good factual state remains readable. This gives the assistant a way to do the refresh for the owner while keeping PSN load proportional to actual AI use.

## Target identity versus data-access credential

Current M3-M7 code couples the target owner identity and the PSN credential used for requests. Research after M6 identified that PlayStation trophy operations can query another PSN account when the authenticating account has permission to view that target's trophies.

Therefore a future authentication refinement can separate:

```text
target PSN identity: mrdrage2 / stable accountId
PSN data-access identity: authenticated credential used to call trophy endpoints
```

This may remove the need for the target owner to repeatedly provide NPSSO. It requires its own live test, security review and privacy/terms analysis. TrophyBridge does not claim knowledge of PSNProfiles' private architecture and will not persist an NPSSO merely as a shortcut.

## Zero-cost architecture

Accepted hosted envelope remains Supabase Free + public GitHub/standard Actions + future Vercel Hobby.

M4-M7 add no Redis, VPS, queue, worker, mirrored images or paid data broker. M7 public reads use PostgreSQL and bounded pagination. Free-tier pressure must cause throttling or optional-feature refusal, not an automatic paid upgrade.

## Failure behavior

Provider/snapshot failures record safe sync metadata and preserve last-good rows. Invalid/revoked public capabilities return stable error envelopes without exposing secrets or raw storage exceptions.

## Milestone boundary

M7 ends with secure revocable public factual access. M8 adds AI-optimized context, recent activity and bounded AI-triggered freshness. M9 refines the owner dashboard. M10 performs hardening and deployment validation.
