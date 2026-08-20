# TrophyBridge API v1

## Base paths

Private authenticated routes live under `/api/private/v1/...`. Public capability routes live under `/api/public/v1/share/{token}/...`. The non-sensitive health route remains `GET /api/public/v1/health`.

Private responses are `Cache-Control: private, no-store`. Tokenized public responses are `Cache-Control: no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.

## Private API

### PSN connection

```text
POST /api/private/v1/psn/connect
GET  /api/private/v1/psn/status
POST /api/private/v1/psn/refresh
POST /api/private/v1/psn/disconnect
```

### Library synchronization

```text
POST /api/private/v1/library/sync
```

One bounded lightweight library snapshot. Default cooldown is one hour and maximum accepted library size is 2,000 titles.

### Per-game trophy synchronization

```text
POST /api/private/v1/games/{gameId}/sync
```

One complete game snapshot with M6 event detection. The response includes `newTrophiesFound` after the baseline. Default cooldown is 300 seconds with at most 100 groups and 1,000 trophies.

### Public-share management

```text
GET    /api/private/v1/share
POST   /api/private/v1/share
DELETE /api/private/v1/share
```

`POST` atomically revokes any previous account share and creates a fresh 256-bit `tb1_...` capability. It returns the plaintext token once. PostgreSQL stores only SHA-256. `DELETE` revokes the active link.

The raw token is a bearer secret. It must not be committed, logged, pasted into public issues, or placed in indexed pages.

## Public API

### Discovery

```text
GET /api/public/v1/share/{token}
```

M8 discovery advertises:

```json
{
  "capabilities": {
    "games": true,
    "game_detail": true,
    "trophies": true,
    "ai_context": true,
    "refresh": true
  },
  "endpoints": {
    "games": "./games",
    "game": "./games/{gameId}",
    "trophies": "./games/{gameId}/trophies",
    "ai_context": "./games/{gameId}/ai-context"
  }
}
```

Stable PSN numeric account IDs, TrophyBridge owner IDs and authentication material are not exposed.

### Games

```text
GET /api/public/v1/share/{token}/games?limit=100&offset=0
```

`limit` defaults to 100 and is capped at 200. `offset` defaults to 0 and is bounded to 2,000. Hidden library titles are excluded.

### Game detail

```text
GET /api/public/v1/share/{token}/games/{gameId}
```

Returns base and additional progress separately, group summaries, hydration status, library progress and last deep-trophy sync time.

### Trophies

```text
GET /api/public/v1/share/{token}/games/{gameId}/trophies
?scope=base|dlc|all
?status=earned|missing|all
```

`scope=dlc` means all non-base/additional PSN trophy groups. It does not prove that a numbered group was separately purchased DLC.

For an unearned hidden trophy, public serialization masks spoiler-bearing metadata:

```json
{
  "name": null,
  "description": null,
  "icon_url": null,
  "hidden": true,
  "spoiler_masked": true,
  "earned": false
}
```

### M8 AI context

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=1
```

`fresh` accepts only `0` or `1` and defaults to `0`.

The response is intentionally factual and compact. Top-level fields are:

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

Representative shape:

```json
{
  "schema_version": "1.0",
  "identity": {
    "online_id": "example-player",
    "preferred_locale": "it-IT",
    "game_id": "uuid",
    "title": "Example Game",
    "platforms": ["PS5"]
  },
  "progress": {
    "hydrated": true,
    "library_percent": 36,
    "base": {
      "earned_count": 18,
      "total_count": 50,
      "missing_count": 32,
      "completion_percent": 36,
      "platinum_available": true,
      "platinum_earned": false
    },
    "additional": {
      "earned_count": 0,
      "total_count": 19,
      "missing_count": 19,
      "completion_percent": 0
    }
  },
  "missing_trophies": {
    "scope": "base",
    "count": 32,
    "included_count": 32,
    "truncated": false,
    "items": []
  },
  "recent_activity": [],
  "sync": {
    "last_trophy_sync_at": "2026-08-20T12:00:00Z",
    "age_seconds": 120,
    "freshness_seconds": 600,
    "is_fresh": true,
    "refresh_requested": true,
    "refresh_attempted": false,
    "refresh_outcome": "not_needed",
    "retry_after_seconds": null,
    "refresh_error_code": null,
    "new_trophies_found": null,
    "served_last_good": false
  }
}
```

`missing_trophies` contains only missing base-game trophies because the endpoint is optimized for platinum guidance. The default embedded ceiling is 200 items. `truncated=true` tells clients to use the normal `/trophies` endpoint for the remainder.

`recent_activity` comes from durable M6 progress events, not from inference.

## `fresh=1` semantics

M8 does not turn the public API into an unbounded PSN proxy.

1. TrophyBridge resolves the share and confirms the game is visible.
2. It reads the current durable game snapshot.
3. If the last trophy sync is younger than `AI_CONTEXT_FRESHNESS_SECONDS` (600 seconds by default), the response is returned without a PSN request and `refresh_outcome=not_needed`.
4. If stale, the request must first obtain an atomic per-share refresh claim. The default budget is 12 claims per rolling one-hour window.
5. An allowed refresh reuses the existing `TrophySyncService` for exactly one game. The existing 300-second game cooldown, single-flight constraint, complete-snapshot validation and 1,000-trophy ceiling remain authoritative.
6. After success, AI context is rebuilt from the newly persisted database state.
7. If PSN/reauth/synchronization fails but a usable cached trophy snapshot exists, TrophyBridge serves that last-good state with `served_last_good=true` and a factual `refresh_outcome`.
8. If upstream access fails before any usable trophy snapshot exists, the endpoint returns a stable 503 error rather than inventing data.

Refresh outcomes currently include:

```text
not_requested
not_needed
success
rate_limited
cooldown
in_progress
reauth_required
upstream_unavailable
failed
```

A revoked link cannot claim refresh budget. The claim RPC is executable only by `service_role`, not browser roles.

## Public errors

Stable envelope:

```json
{
  "error": {
    "code": "INVALID_SHARE_TOKEN",
    "message": "Il link TrophyBridge non è valido.",
    "retryable": false
  },
  "request_id": "uuid"
}
```

Current public codes:

```text
INVALID_SHARE_TOKEN    404
SHARE_LINK_REVOKED     410
GAME_NOT_FOUND         404
INVALID_REQUEST        400
PSN_UNAVAILABLE        503
PSN_REAUTH_REQUIRED    503
SYNC_FAILED            503
STORAGE_ERROR          500
INTERNAL_ERROR         500
```

When a `ShareError` carries a retry delay, TrophyBridge also emits `Retry-After`.

## Numeric progress honesty

When PSN does not expose a verified current numeric trophy-progress value, TrophyBridge returns `null`. A target alone is never used to invent current progress.

## Versioning

Breaking public API changes require a new version prefix. Additive fields may be introduced within v1 when clients can safely ignore them.
