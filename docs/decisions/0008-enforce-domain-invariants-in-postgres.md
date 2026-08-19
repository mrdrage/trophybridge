# ADR 0008: Enforce core domain invariants in PostgreSQL

## Status

Accepted

## Context

TrophyBridge synchronizes data from an upstream service that may be incomplete, temporarily inconsistent, or retried. The persistence layer must therefore protect facts that have already been verified. Relying only on application code would leave the same invariants vulnerable to future scripts, migrations, jobs, or alternate writers.

The M1 schema also needs to make base-game and DLC separation structural rather than convention based.

## Decision

The PostgreSQL schema is the source of truth for the v0.1 domain model and directly enforces the invariants that are cheap and unambiguous at the database boundary.

M1 therefore uses:

- foreign keys with deliberate cascade behavior;
- unique constraints for provider identities and player/trophy state;
- a partial unique index allowing at most one `base` trophy group per game;
- a composite trophy-group/game foreign key preventing cross-game mismatches;
- a unique `(game_id, psn_trophy_id)` key because `psn-api` documents `trophyId` as unique within the title, not merely within a trophy group;
- check constraints for enumerated states, percentages, counts, timestamps, and event shape;
- a `BEFORE UPDATE` trigger on `player_trophies` that prevents an earned trophy from regressing to unearned and preserves the earliest known valid `earned_at` timestamp;
- deduplicating indexes for progress events;
- Row Level Security enabled on every application table in the exposed `public` schema.

M1 intentionally creates no browser/client RLS policies. Until TrophyBridge authentication is implemented in M3, direct client access remains denied by default and server-side/service-role access is the intended writer.

## Consequences

Repeated synchronization can use ordinary PostgreSQL UPSERT semantics without creating duplicate player state. Critical trophy facts remain protected even if a future application writer is imperfect.

The schema is stricter and some upstream anomalies will fail loudly rather than being silently accepted. That is intentional: unexpected provider states should be normalized explicitly instead of weakening durable data guarantees.

Database integration tests run against real PostgreSQL in CI so these guarantees are executable rather than documentation only.
