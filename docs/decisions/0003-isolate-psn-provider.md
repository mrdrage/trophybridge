# ADR 0003: Isolate PlayStation behind `PsnProvider`

**Status:** Accepted

## Context

PlayStation trophy access depends on external interfaces and a community library that may change independently of TrophyBridge.

## Decision

All PSN access is translated through the internal `PsnProvider` contract. Application services, persistence, API routes, and UI code do not import `psn-api` directly.

## Consequences

- Tests can use deterministic mock data.
- A broken or replaced PSN library does not require a rewrite of TrophyBridge.
- Mapping code becomes an explicit anti-corruption layer between provider payloads and our domain model.
