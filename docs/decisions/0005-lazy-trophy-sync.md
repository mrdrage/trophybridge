# ADR 0005: Synchronize trophy details lazily

**Status:** Accepted

## Context

A long-lived PlayStation account can contain hundreds of titles and thousands of trophies. Importing every trophy during first connection would be unnecessarily slow and fragile.

## Decision

Split synchronization into a lightweight library sync and an on-demand game sync. Detailed trophy groups and earned states are fetched only for games that need them.

## Consequences

- Initial account setup remains fast.
- API traffic toward PSN is reduced.
- A game can be visible in the library before its detailed trophy set has been synchronized.
