# ADR 0006: Treat earned trophy state as monotonic

**Status:** Accepted

## Context

External APIs can temporarily return partial or inconsistent responses. A trophy already verified as earned should not disappear locally because a later provider response is incomplete.

## Decision

Once TrophyBridge has persisted `earned=true`, ordinary synchronization cannot revert it to `false`. A valid known `earned_at` timestamp is also preserved when a later response is missing or worse.

## Consequences

- TrophyBridge prefers a slightly stale verified fact over a destructive regression.
- Sync logic must use merge/upsert semantics rather than blindly replacing rows.
- Exceptional administrative correction, if ever needed, must be an explicit separate operation.
