# ADR 0012: Bounded atomic per-game trophy snapshots

- Status: Accepted
- Date: 2026-08-19

## Context

M4 proved that TrophyBridge can import the pilot PlayStation library cheaply and safely, but platinum guidance requires detailed trophy groups, localized trophy metadata, and player earned state.

A naive implementation could deep-hydrate every library title, persist group/title/user responses independently, or accept a successful-but-truncated upstream response as complete. Those options create unnecessary PSN/database load and can corrupt factual last-good state.

The product also has a hard €0/month operating requirement.

## Decision

M5 performs deep trophy synchronization **only for one explicitly selected game**.

Authorization is obtained only through `PsnConnectionService.createProviderForOwner(ownerUserId)`. The synchronization service reads, in order:

```text
getTrophyGroups(game)
getTrophies(game)
getUserTrophies(game)
```

The three responses are treated as one factual snapshot. No database write occurs until the application verifies:

- group/trophy/user identities are unique;
- exactly one base group exists and it is PSN group `default`;
- every trophy belongs to a returned group;
- actual bronze/silver/gold/platinum counts for every group equal the group's `definedTrophies` totals;
- title and user trophy sets have equal complete coverage;
- each user trophy type agrees with title metadata;
- configured hard size ceilings are respected.

After validation, one server-only PostgreSQL function atomically upserts the snapshot.

Database persistence repeats structural/size/identity checks as defense in depth, preserves earned state monotonically, preserves known metadata when later fields are null, and does not delete older trophy rows on failure or omission.

Per-game synchronization is manual with a default 300-second cooldown, a maximum of 100 groups and 1,000 trophies, stale-run recovery, and one running sync per account/game target.

## Consequences

### Positive

- A partial PSN payload cannot silently replace known complete state.
- Deep synchronization cost scales with games the owner actually chooses, not total library size.
- Base platinum progress can be calculated from the structural `default` group independently from additional groups.
- The database receives one coherent transaction rather than three partially committed provider phases.
- M6 can detect newly earned trophies against durable monotonic state.
- Future public freshness can reuse the same bounded per-game synchronization boundary.

### Negative

- First detailed access to a game requires an explicit deep sync.
- Trophy details for other library games remain absent until selected.
- Strict completeness validation may reject a provider response that is temporarily inconsistent even if some fields are usable.

These tradeoffs are intentional. Serving last-good factual state or no detailed state is preferable to persisting a misleading partial snapshot.

## Rejected alternatives

### Deep-hydrate the full library after M4

Rejected because it creates unnecessary upstream/database work, weakens the €0/month requirement, and most titles are irrelevant to the player's current platinum target.

### Persist groups, title trophies, and player state in independent transactions

Rejected because a later phase can fail after earlier phases have committed, leaving a mixed snapshot.

### Trust array length alone

Rejected because a truncated response can still contain equal title/user lengths. M5 also compares each group's actual trophy-type distribution against the provider-defined totals.

### Delete rows absent from a later snapshot

Rejected because transient provider omissions must not destroy last-good factual state.

## Follow-up

M6 will add progress-event detection. It must build on M5's durable transition semantics without introducing background polling or weakening snapshot validation.
