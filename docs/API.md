# TrophyBridge API v1

## Design goals

The public API is optimized for three properties:

1. Stable machine-readable contracts.
2. Minimal disclosure of player data.
3. Easy navigation by an AI client starting from one permanent share URL.

All public endpoints are read-only.

## Base paths

Private authenticated routes:

```text
/api/private/v1/...
```

Public share routes:

```text
/api/public/v1/share/{token}/...
```

The current foundation also exposes a non-sensitive service health route:

```text
GET /api/public/v1/health
```

## Share root

Planned endpoint:

```text
GET /api/public/v1/share/{token}
```

Example shape:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-19T08:00:00Z",
  "player": {
    "online_id": "example"
  },
  "_links": {
    "games": "/api/public/v1/share/.../games"
  }
}
```

The response is deliberately self-describing. A client should be able to discover subsequent endpoints by following `_links` instead of hard-coding internal URL conventions.

## Games collection

Planned endpoint:

```text
GET /api/public/v1/share/{token}/games
```

Each game should include:

- internal TrophyBridge game ID;
- title;
- platform(s);
- aggregate progress;
- base-game trophy counts;
- DLC trophy counts;
- platinum status;
- last successful synchronization;
- links to detail, trophies and AI context.

Example:

```json
{
  "games": [
    {
      "id": "uuid",
      "title": "Final Fantasy XVI",
      "platforms": ["PS5"],
      "base_game": {
        "earned": 16,
        "total": 50,
        "platinum_earned": false
      },
      "dlc": {
        "earned": 0,
        "total": 19
      },
      "last_synced_at": "2026-08-19T08:00:00Z",
      "_links": {
        "details": "...",
        "trophies": "...",
        "ai_context": "..."
      }
    }
  ]
}
```

## Game detail

Planned endpoint:

```text
GET /api/public/v1/share/{token}/games/{gameId}
```

Returns normalized game metadata, trophy groups, aggregate progress and synchronization state.

## Trophy collection

Planned endpoint:

```text
GET /api/public/v1/share/{token}/games/{gameId}/trophies
```

Supported filters:

```text
?scope=base|dlc|all
?status=earned|missing|all
```

Example trophy:

```json
{
  "id": "uuid",
  "name": "Example Trophy",
  "description": "Complete something.",
  "type": "silver",
  "group": "base",
  "earned": false,
  "earned_at": null,
  "hidden": false,
  "progress": {
    "current": 7,
    "target": 20,
    "percent": 35
  }
}
```

When the provider does not expose numeric progress, `progress` is `null`. TrophyBridge must not infer progress values.

## AI context

Planned endpoint:

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
```

This is a first-class API product, not a dump of the database. It should provide enough factual context for an AI assistant to reason about the player's next platinum steps while remaining compact.

Planned top-level fields:

```text
schema_version
identity
progress
missing_trophies
recent_activity
sync
```

Example:

```json
{
  "schema_version": "1.0",
  "identity": {
    "player": "example",
    "game": "Final Fantasy XVI",
    "platform": "PS5"
  },
  "progress": {
    "platinum_earned": false,
    "base_earned": 16,
    "base_total": 50,
    "dlc_earned": 0,
    "dlc_total": 19
  },
  "missing_trophies": [],
  "recent_activity": [],
  "sync": {
    "last_successful_at": "2026-08-19T08:00:00Z",
    "stale": false
  }
}
```

Future Trophy Intelligence may add a `guidance` block without changing the factual responsibility of TrophyBridge Core.

## Freshness

Normal public reads use the durable database state.

A planned optional query parameter:

```text
?fresh=1
```

requests a game refresh before returning, subject to server-side cooldown and synchronization locking. A public client must never be able to cause unbounded calls to PlayStation Network.

Initial target behavior:

- data newer than roughly 10 minutes is considered fresh;
- one game cannot be force-refreshed more often than roughly every 5 minutes;
- if PSN is unavailable, the most recent valid snapshot remains readable and is marked stale.

These intervals are configuration, not API guarantees.

## Hidden trophy privacy

By default an unearned hidden trophy should not reveal spoiler-bearing name or description through a share link unless the share configuration explicitly permits it.

Example:

```json
{
  "name": "Hidden Trophy",
  "description": null,
  "hidden": true,
  "earned": false
}
```

## Error envelope

All public API errors should use a stable envelope:

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

Initial error codes:

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

## Indexing policy

Public share responses and pages must opt out of search-engine indexing using response headers and page metadata such as `X-Robots-Tag: noindex, nofollow` where appropriate.

## Versioning

Breaking public API changes require a new version prefix. Additive fields may be introduced within v1 when existing clients can safely ignore them.
