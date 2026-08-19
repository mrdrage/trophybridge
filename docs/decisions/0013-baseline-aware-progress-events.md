# ADR 0013: Baseline-aware progress events

- Status: Accepted
- Date: 2026-08-19

## Context

M5 stores a complete, monotonic per-game trophy snapshot. M6 must turn later trophy changes into durable activity that can eventually be surfaced through the public API and AI context.

The main ambiguity is the first detailed synchronization of a title. A player may already have many trophies before TrophyBridge exists. Treating every earned trophy in that first snapshot as newly earned would create a false activity history and make later AI guidance misleading.

Event detection also must not create a second synchronization path, background polling, or a transaction boundary in which the trophy state commits but the corresponding event does not.

## Decision

The first successful deep trophy snapshot for a game is a **baseline**. It creates factual `player_trophies` state but no historical `trophy_earned` or `platinum_earned` events.

For later complete snapshots, M6 records only durable transitions where TrophyBridge previously stored `earned=false` and the incoming validated PSN snapshot says `earned=true`.

Detection is performed inside the server-only PostgreSQL wrapper `persist_game_trophy_snapshot_with_events(...)`:

```text
active game sync run
  -> inspect existing player_trophies
  -> capture false -> true candidates
  -> delegate to M5 atomic snapshot persistence
  -> insert progress_events
  -> commit factual state and events together
```

Each newly earned trophy creates one `trophy_earned` event. If that trophy is platinum, the same transition also creates a `platinum_earned` event. The number of newly earned trophies, not the number of event rows, is returned as `new_trophies_found` and persisted on the sync run.

`occurred_at` uses the PSN `earnedDateTime` value when available. If PSN does not provide one, TrophyBridge uses the synchronization timestamp. `detected_at` is the synchronization timestamp.

The wrapper must be bound to the active `game` sync run for the same account and game. Existing unique indexes on `progress_events` remain the final deduplication boundary.

## Consequences

### Positive

- Historical trophies present before TrophyBridge do not masquerade as new activity.
- Every later event has a durable before-state and a specific sync run that detected it.
- Event and trophy-state persistence share one PostgreSQL transaction.
- Replaying the same snapshot is idempotent.
- Platinum completion has an explicit event without losing the ordinary trophy-earned event.
- M8 AI Context can consume a trustworthy recent-activity stream.
- No new hosted service or recurring-cost dependency is introduced.

### Negative

- TrophyBridge does not reconstruct historical acquisition order before the first baseline.
- A trophy earned between the player's real-world acquisition and the first deep sync is treated as baseline rather than a newly detected event.
- Event detection depends on an explicit later game sync; there is no real-time push from PlayStation.

These are intentional tradeoffs. TrophyBridge prefers a smaller factual event history over fabricated chronology.

## Rejected alternatives

### Emit events for all earned trophies on first sync

Rejected because those trophies may have been earned months or years earlier and would create a misleading burst of activity.

### Compare snapshots only in application memory

Rejected because a failure between event creation and factual-state persistence could create inconsistent history, and concurrent requests would be harder to reason about.

### Poll PSN in the background

Rejected because M6 does not need real-time detection and background polling would weaken the €0/month operating constraint.

### Store NPSSO or another long-lived PSN secret to support continuous monitoring

Rejected. M6 reuses the existing encrypted refresh-token lifecycle and manual game synchronization boundary. Authentication policy remains unchanged.

## Follow-up

M7 will expose revocable read-only public sharing. M8 will include recent M6 events in `ai-context`. Public reads must consume durable events from PostgreSQL and must not create unbounded PSN synchronization work.
