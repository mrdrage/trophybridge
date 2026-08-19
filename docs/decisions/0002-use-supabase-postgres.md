# ADR 0002: Use Supabase PostgreSQL

**Status:** Accepted

## Context

TrophyBridge needs relational integrity, explicit constraints, row-level security, authentication support, and a path from a single private user to a multi-user product.

## Decision

Use PostgreSQL through Supabase. SQL migrations are the source of truth for schema evolution. Supabase Auth will provide TrophyBridge user authentication.

## Consequences

- The data model can enforce uniqueness and monotonic sync invariants close to the data.
- RLS can isolate private application data.
- Server-side service credentials must never be exposed to browser code or public endpoints.
