# Supabase workspace

M1 establishes SQL migrations as the source of truth for TrophyBridge persistence.

## Current migration

```text
supabase/migrations/20260819120000_m1_domain_model.sql
```

It creates the v0.1 domain tables, constraints, indexes, monotonic trophy-state trigger, event deduplication rules, and enables Row Level Security on every application table in the exposed `public` schema.

## Local/database verification

Database integration tests require a disposable PostgreSQL instance and `psql`:

```bash
DATABASE_URL=postgresql://... pnpm test:db
```

The runner applies `tests/integration/bootstrap.sql`, then every migration under `supabase/migrations/`, then `tests/integration/domain_model.sql`.

GitHub Actions runs the same checks against PostgreSQL 17. No real Supabase project and no PSN credentials are required for M1.

## Supabase Auth note

The production migration references `auth.users`, which exists in Supabase. The CI bootstrap creates only the minimal stub required to verify the TrophyBridge schema against ordinary PostgreSQL.

M1 enables RLS but intentionally defines no browser/client policies. Owner-scoped policies are introduced when TrophyBridge authentication is implemented in M3.
