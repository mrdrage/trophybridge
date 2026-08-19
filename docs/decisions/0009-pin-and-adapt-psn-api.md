# ADR 0009: Pin and adapt `psn-api`

## Status

Accepted

## Context

TrophyBridge needs PlayStation trophy data, but the integration is based on community-documented PlayStation interfaces rather than a stable public Sony developer API for this use case. The `psn-api` package already provides typed functions for title lists, trophy groups, trophy metadata and user-earned state, but both the package and upstream behavior can evolve independently of TrophyBridge.

The M1 database and future public API must not become coupled to raw `psn-api` payload shapes.

## Decision

TrophyBridge will:

1. pin `psn-api` to an exact tested version rather than a floating semver range;
2. keep all direct package calls inside `PsnApiProvider`;
3. validate and normalize upstream payloads before returning TrophyBridge domain types;
4. inject authorization/account identity into the adapter rather than letting the provider own durable authentication;
5. paginate title and trophy endpoints inside the provider;
6. normalize raw provider errors into stable TrophyBridge error codes;
7. keep sanitized provider fixtures in CI and prohibit live PSN calls there;
8. represent unsupported data as `null` instead of fabricating it.

M2 pins version `2.18.1`.

## Consequences

Positive:

- package upgrades become explicit review events;
- the database, UI and public API remain isolated from upstream field names;
- tests can simulate PSN without secrets or network access;
- provider replacement remains feasible;
- unsupported numeric trophy progress is represented honestly.

Trade-offs:

- mapper code duplicates a small amount of shape validation already represented by TypeScript types;
- a new `psn-api` release does not reach TrophyBridge automatically;
- real provider improvements require a deliberate dependency bump and fixture/contract validation.

These trade-offs are acceptable because factual trophy integrity is more important than automatic dependency drift.
