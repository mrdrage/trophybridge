# TrophyBridge API v1

## Base paths

Private authenticated routes live under `/api/private/v1/...`. Public capability routes live under `/api/public/v1/share/{token}/...`. The non-sensitive health route remains `GET /api/public/v1/health`.

Private responses are `Cache-Control: private, no-store`. M7 tokenized public responses are `Cache-Control: no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.

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

### M7 public-share management

```text
GET    /api/private/v1/share
POST   /api/private/v1/share
DELETE /api/private/v1/share
```

`GET` returns only safe share status. `POST` atomically revokes any previous account share and creates a fresh capability. It returns the plaintext token **once**, for the current response/browser session. PostgreSQL stores only SHA-256. `DELETE` revokes the active link.

Representative creation shape:

```json
{
  "share": {
    "active": true,
    "createdAt": "2026-08-20T12:00:00.000Z",
    "lastUsedAt": null,
    "token": "tb1_<43 base64url chars>"
  }
}
```

The raw token is a bearer secret. It must not be committed, logged, pasted into public issues, or placed in indexed pages.

## M7 public API

All M7 public reads use durable PostgreSQL state. They do not contact PlayStation and cannot trigger synchronization.

### Discovery

```text
GET /api/public/v1/share/{token}
```

Representative shape:

```json
{
  "schema_version": "1.0",
  "account": {
    "online_id": "example-player",
    "preferred_locale": "it-IT"
  },
  "library": {
    "visible_games": 120
  },
  "sync": {
    "last_successful_sync_at": "2026-08-20T11:44:03.787Z"
  },
  "capabilities": {
    "games": true,
    "game_detail": true,
    "trophies": true,
    "ai_context": false,
    "refresh": false
  },
  "endpoints": {
    "games": "./games",
    "game": "./games/{gameId}",
    "trophies": "./games/{gameId}/trophies"
  }
}
```

Stable PSN numeric account IDs and authentication material are not exposed.

### Games

```text
GET /api/public/v1/share/{token}/games?limit=100&offset=0
```

`limit` defaults to 100 and is capped at 200. `offset` defaults to 0 and is bounded to 2,000. Hidden library titles are excluded.

Each game exposes a TrophyBridge `game_id`, title/platform/icon, aggregate PSN progress and trophy counters, plus provider/local sync timestamps.

### Game detail

```text
GET /api/public/v1/share/{token}/games/{gameId}
```

Returns base and additional progress separately, group summaries, hydration status, library progress and last deep-trophy sync time. Additional groups never contribute to base platinum status.

### Trophies

```text
GET /api/public/v1/share/{token}/games/{gameId}/trophies
?scope=base|dlc|all
?status=earned|missing|all
```

`scope=dlc` currently means all non-base/additional groups. It does not prove that a numbered PSN group was separately purchased DLC.

For an unearned hidden trophy, public serialization returns:

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

Factual non-spoiler fields such as trophy type, group, rarity and earned rate may remain present. Once the hidden trophy is actually earned, its known metadata may be shown.

## Public errors

Stable M7 envelope:

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

Current share codes:

```text
INVALID_SHARE_TOKEN   404
SHARE_LINK_REVOKED    410
GAME_NOT_FOUND        404
INVALID_REQUEST       400
STORAGE_ERROR         500
INTERNAL_ERROR        500
```

A syntactically valid revoked token resolves to `SHARE_LINK_REVOKED`; an unknown/malformed token does not reveal account existence.

## Numeric progress honesty

When PSN does not expose a verified current numeric trophy-progress value, TrophyBridge returns `null`. A target alone is never used to invent current progress.

## Freshness

M7 public reads are intentionally passive. `capabilities.refresh=false` and `capabilities.ai_context=false` make this explicit.

M8 will add:

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
```

and the planned bounded `fresh=1` behavior. The AI client will then be able to request a fresh single-game state without the owner pressing the private sync button. That path must reuse the existing per-game cooldown, one-running-sync protection, size ceilings and last-good fallback. No public endpoint may create unbounded PSN fan-out.

## Versioning

Breaking public API changes require a new version prefix. Additive fields may be introduced within v1 when clients can safely ignore them.
