begin;

-- Supabase grants broad table privileges to API roles by default and relies on
-- RLS to filter them. TrophyBridge's v0.1 contract is narrower: only the owner
-- may directly read the non-secret psn_accounts row; every other application
-- table is server-only through the trusted service-role boundary.
revoke all privileges on all tables in schema public from anon, authenticated;
grant select on table public.psn_accounts to authenticated;

-- Trigger helpers are invoked by PostgreSQL itself and must not be callable by
-- browser-facing roles. Server RPCs already grant EXECUTE explicitly to
-- service_role, so revoking browser/public execution keeps that boundary tight.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Supabase migrations are owned by the postgres role. Table grants are scoped to
-- public, while PostgreSQL's built-in default EXECUTE grant to PUBLIC is global,
-- so revoke both the global function default and any schema-local API-role grants.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
