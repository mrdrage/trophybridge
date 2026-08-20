# ADR 0007: Provide a dedicated AI context endpoint

**Status:** Accepted and implemented in M8

## Context

Generic trophy APIs can contain far more data than an AI assistant needs to understand a platinum run. A fresh conversation should be able to discover the important factual state from one compact resource.

## Decision

TrophyBridge v1 exposes a game-level `ai-context` endpoint containing identity, base-game platinum progress, missing base trophies, recent activity, additional-group summary and synchronization freshness.

The endpoint is factual. Strategic guide metadata belongs to the later TrophyBridge Intelligence layer rather than being invented by the synchronization layer.

M8 implements:

```text
GET /api/public/v1/share/{token}/games/{gameId}/ai-context
GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=1
```

Missing base trophies are bounded in the compact payload; a truncated response points clients to the normal trophy endpoint. Recent activity comes from durable M6 progress events.

`fresh=1` uses the bounded demand-driven freshness design recorded in ADR 0015. It cannot fan out across the library and must preserve last-good factual state on refresh failure.

## Consequences

- AI clients do not need to download the entire trophy history for routine platinum guidance.
- A fresh AI conversation can establish identity, progress, missing base trophies and recent earned activity from one resource after hosted deployment.
- The schema is versioned and contract-tested.
- Public freshness reuses the existing synchronization boundary instead of creating a second weaker writer.
- Future TrophyBridge Intelligence can add guidance metadata without changing the factual PSN synchronization layer.
