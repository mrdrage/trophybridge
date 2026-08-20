# ADR 0015: Bound AI-triggered freshness at the public capability boundary

**Status:** Accepted

## Context

M7 made TrophyBridge state readable through a revocable public capability, but those reads were passive. The product requirement is that an AI assistant can obtain current trophy state without asking the owner to press `Sincronizza trofei` every time.

Allowing every public request to call PlayStation without limits would turn a leaked capability into an unbounded upstream-work primitive, undermine the €0/month operating envelope and increase PSN rate-limit risk.

## Decision

M8 adds `GET /api/public/v1/share/{token}/games/{gameId}/ai-context?fresh=1` with layered bounds.

- Public freshness is game-scoped only. One request can never fan out across the library.
- TrophyBridge first reads PostgreSQL. If the game is younger than the configured freshness threshold, no PSN request is made.
- A stale refresh must atomically claim from a per-share one-hour budget stored on `share_links`.
- The default public budget is 12 claims/hour.
- An allowed claim reuses the existing `TrophySyncService`; therefore the per-game 300-second cooldown, database single-flight protection, stale-run recovery, snapshot size ceilings and complete-snapshot validation still apply.
- A revoked share cannot claim work.
- The claim function is server-only and executable by `service_role`, never `anon` or `authenticated`.
- If refresh fails but durable trophy state exists, the public response serves last-good data and describes the refresh outcome.
- Upstream failure does not erase or regress factual state.

## Why demand-driven instead of cron

The primary consumer is an AI assistant. Refreshing only when a user actually asks about a game avoids background work while removing the manual sync-button requirement. A future scheduler may be added only if it remains useful and demonstrably inside the zero-cost envelope.

## Consequences

Positive:

- The owner no longer needs to perform a manual trophy sync before routine AI guidance.
- Repeated AI reads of already-fresh state are database-only.
- Public capability leakage has bounded upstream-work impact.
- Existing synchronization correctness rules remain the single source of truth.
- Last-good availability survives PSN outages and reauthentication problems.

Trade-offs:

- `fresh=1` is best-effort, not a promise that PSN will always be reachable.
- A heavily used share may exhaust its hourly refresh budget and temporarily serve stale state.
- Until deployment, a localhost capability cannot be reached from a remote ChatGPT conversation.
- The current PSN data-access credential may still require reauthentication; separating target identity from data-access identity is a distinct authentication follow-up.
