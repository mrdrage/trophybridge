# ADR 0007: Provide a dedicated AI context endpoint

**Status:** Accepted

## Context

Generic trophy APIs can contain far more data than an AI assistant needs to understand a platinum run. A fresh conversation should be able to discover the important state from one compact resource.

## Decision

TrophyBridge v1 public API will expose a game-level `ai-context` endpoint containing identity, base-game platinum progress, missing base trophies, recent activity, DLC summary, and synchronization freshness.

## Consequences

- AI clients do not need to download the entire trophy history for routine guidance.
- The schema is versioned and contract-tested.
- Future Trophy Intelligence can add guidance metadata without changing the factual PSN synchronization layer.
