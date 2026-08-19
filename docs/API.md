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

M4 performs one bounded library synchronization for the authenticated owner. The route:

- gets PSN authorization through `PsnConnectionService`;
- calls the normalized `PsnProvider.getGames()` contract;
- persists a last-good atomic library snapshot;
- applies concurrency, cooldown, and maximum-library guardrails;
- returns only safe summary metadata.

Successful shape:

```json
{
  "summary": {
    "processedCount": 120,
    "discoveredCount": 3,
    "syncedAt": "2026-08-19T15:00:00.000Z",
    "nextAllowedAt": "2026-08-19T16:00:00.000Z"
  }
}
```

Representative bounded errors include `SYNC_COOLDOWN`, `SYNC_IN_PROGRESS`, `LIBRARY_TOO_LARGE`, `PSN_RATE_LIMITED`, `PSN_AUTH_REQUIRED`, and `SYNC_FAILED`.

All private responses use `Cache-Control: private, no-store`.

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

The public API will be read-only, allowlist-based, revocable, and non-indexed. Authentication material can never appear in public output.

## Numeric progress honesty

When PSN does not expose a current numeric trophy-progress value, TrophyBridge returns `null` rather than infer one. A target value alone is not enough to invent current progress.

## Freshness and zero-cost behavior

Normal public reads will use durable PostgreSQL state. Opening a page or reading JSON must not automatically contact PSN.

A future explicit refresh path may exist, but it must use server-side cooldowns/single-flight coordination so a client cannot create unbounded PlayStation, Vercel, or database work.

If an upstream refresh fails, the most recent valid factual state should remain readable and be marked stale where appropriate.

## Hidden trophy privacy

An unearned hidden trophy should not reveal spoiler-bearing name/description through a public share unless the future share configuration explicitly permits it.

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

Initial public codes include:

```text
INVALID_SHARE_TOKEN
SHARE_LINK_REVOKED
GAME_NOT_FOUND
PSN_UNAVAILABLE
PSN_RATE_LIMITED
PSN_REAUTH_REQUIRED
SYNC_IN_PROGRESS
SYNC_FAILED
INTERNAL_ERROR
```

## Versioning

Breaking public API changes require a new version prefix. Additive fields may be introduced within v1 when existing clients can safely ignore them.
