# TrophyBridge API v1

## Base paths

Private authenticated routes:

```text
/api/private/v1/...
```

Future public share routes:

```text
/api/public/v1/share/{token}/...
```

Current non-sensitive health route:

```text
GET /api/public/v1/health
```

All current private JSON responses use `Cache-Control: private, no-store`.

## Current private API

### PSN connection

```text
POST /api/private/v1/psn/connect
GET  /api/private/v1/psn/status
POST /api/private/v1/psn/refresh
POST /api/private/v1/psn/disconnect
```

These routes require a TrophyBridge owner session. Authentication material is never returned.

### Library synchronization

```text
POST /api/private/v1/library/sync
```

M4 performs one bounded library synchronization for the authenticated owner. It gets authorization through `PsnConnectionService`, calls normalized `PsnProvider.getGames()`, persists an atomic last-good library snapshot, and applies account-level concurrency/cooldown/library-size guards.

Representative success:

```json
{
  "summary": {
    "processedCount": 196,
    "discoveredCount": 196,
    "syncedAt": "2026-08-19T18:49:45.644Z",
    "nextAllowedAt": "2026-08-19T19:49:45.644Z"
  }
}
```

Representative errors include `SYNC_COOLDOWN`, `SYNC_IN_PROGRESS`, `LIBRARY_TOO_LARGE`, normalized PSN errors, and `SYNC_FAILED`.

### Per-game trophy synchronization

```text
POST /api/private/v1/games/{gameId}/sync
```

M5 hydrates exactly one game already present in the authenticated owner's synchronized library.

The route:

1. validates the internal UUID `gameId`;
2. verifies that the game belongs to the connected account's `account_games` set;
3. obtains the provider only through `PsnConnectionService.createProviderForOwner(ownerUserId)`;
4. reads trophy groups, title trophy metadata, and user trophy state;
5. rejects incomplete or inconsistent snapshots before any write;
6. atomically persists the validated snapshot;
7. returns a compact safe summary.

Representative success:

```json
{
  "summary": {
    "gameId": "uuid",
    "processedCount": 68,
    "earnedCount": 20,
    "baseTrophyCount": 50,
    "baseEarnedCount": 16,
    "additionalTrophyCount": 18,
    "additionalEarnedCount": 4,
    "syncedAt": "2026-08-19T20:30:00.000Z",
    "nextAllowedAt": "2026-08-19T20:35:00.000Z"
  }
}
```

The numeric values above are illustrative API shape only, not live Final Fantasy XVI state.

M5 error codes include:

```text
GAME_NOT_FOUND
SYNC_COOLDOWN
SYNC_IN_PROGRESS
TROPHY_SNAPSHOT_TOO_LARGE
INVALID_TROPHY_SNAPSHOT
STORAGE_ERROR
PSN_AUTH_REQUIRED
PSN_FORBIDDEN
PSN_NOT_FOUND
PSN_RATE_LIMITED
PSN_INVALID_RESPONSE
PSN_UPSTREAM_UNAVAILABLE
SYNC_FAILED
```

`SYNC_COOLDOWN` may include `retryAfterSeconds`. Provider and storage exceptions are normalized so raw upstream or credential-bearing messages are not exposed.

## M5 snapshot semantics

A deep trophy write is allowed only for a complete, bounded snapshot. TrophyBridge validates:

- one and only one base group, PSN group ID `default`;
- unique group IDs;
- unique title trophy IDs;
- unique user trophy IDs;
- each title trophy references a returned group;
- each group's actual trophy-type counts exactly equal its `definedTrophies` totals;
- title/user trophy arrays cover the same complete set;
- title and user trophy types match for every ID.

A rejected/failed sync leaves the previous persisted trophy state intact.

Additional groups are persisted separately from the base group. Base platinum calculations must use only trophies attached to the `default` base group.

M5 does not create progress-event rows. Delta/event detection is M6.

## Planned public share API

Share root:

```text
GET /api/public/v1/share/{token}
```

Games:

```text
GET /api/public/v1/share/{token}/games
```

Game detail:

```text
GET /api/public/v1/share/{token}/games/{gameId}
```

Trophies:

```text
GET /api/public/v1/share/{token}/games/{gameId}/trophies
?scope=base|dlc|all
?status=earned|missing|all
```

AI context:

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
```

Planned `ai-context` top-level fields:

```text
schema_version
identity
progress
missing_trophies
recent_activity
sync
```

The public API will be read-only, capability-token gated, revocable, and non-indexed. Authentication material can never appear in public output.

## Numeric progress honesty

When PSN does not expose a current numeric trophy-progress value, TrophyBridge returns `null` rather than infer one. A target value alone is not enough to invent current progress.

## Freshness and zero-cost behavior

Normal dashboard and future public reads use durable PostgreSQL state. Opening a page must not automatically contact PSN.

Current M5 deep refresh is an authenticated explicit action with a 300-second default per-game cooldown, one-running-sync protection, a 100-group ceiling, and a 1,000-trophy ceiling. Future public freshness must reuse similarly bounded server-side coordination.

If an upstream refresh fails, the most recent valid factual state remains readable.

## Hidden trophy privacy

The current private owner dashboard may display the factual metadata PSN returns. A future public share must mask spoiler-bearing name/description for unearned hidden trophies unless an explicit share policy permits disclosure.

## Public error envelope

Planned stable envelope:

```json
{
  "error": {
    "code": "PSN_REAUTH_REQUIRED",
    "message": "The PlayStation connection must be renewed.",
    "retryable": false
  },
  "request_id": "uuid"
}
```

Initial public codes include `INVALID_SHARE_TOKEN`, `SHARE_LINK_REVOKED`, `GAME_NOT_FOUND`, `PSN_UNAVAILABLE`, `PSN_RATE_LIMITED`, `PSN_REAUTH_REQUIRED`, `SYNC_IN_PROGRESS`, `SYNC_FAILED`, and `INTERNAL_ERROR`.

## Versioning

Breaking public API changes require a new version prefix. Additive fields may be introduced within v1 when existing clients can safely ignore them.
