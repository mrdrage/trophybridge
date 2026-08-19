# ADR 0004: Use revocable opaque public share tokens

**Status:** Accepted

## Context

A fresh AI conversation needs a stable read-only URL without receiving PSN credentials or requiring a TrophyBridge login.

## Decision

Expose public resources behind a high-entropy opaque share token. Store only a one-way hash of the token where practical. Tokens are revocable and replaceable independently from the PSN connection.

## Consequences

- Possession of the URL grants read-only access to the explicitly shared trophy data.
- Public routes must be non-indexed and must never expose authentication material.
- Revoking a share link does not disconnect the underlying PlayStation account.
