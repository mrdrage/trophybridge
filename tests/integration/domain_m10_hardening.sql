\set ON_ERROR_STOP on

begin;

do $$
declare
  unexpected text;
begin
  select string_agg(grantee || ':' || table_name || ':' || privilege_type, ', ' order by grantee, table_name, privilege_type)
    into unexpected
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and not (
      grantee = 'authenticated'
      and table_name = 'psn_accounts'
      and privilege_type = 'SELECT'
    );

  if unexpected is not null then
    raise exception 'unexpected browser table grants after M10: %', unexpected;
  end if;

  if not has_table_privilege('authenticated', 'public.psn_accounts', 'SELECT') then
    raise exception 'authenticated must retain SELECT on psn_accounts for owner RLS';
  end if;

  if has_table_privilege('anon', 'public.psn_accounts', 'SELECT') then
    raise exception 'anon must not read psn_accounts directly';
  end if;
end;
$$;

do $$
declare
  unexpected text;
begin
  select string_agg(grantee || ':' || routine_name, ', ' order by grantee, routine_name)
    into unexpected
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and grantee in ('PUBLIC', 'anon', 'authenticated');

  if unexpected is not null then
    raise exception 'unexpected browser/public routine grants after M10: %', unexpected;
  end if;

  if not has_function_privilege('service_role', 'public.persist_library_snapshot(uuid,jsonb,timestamp with time zone)', 'EXECUTE') then
    raise exception 'service_role must execute persist_library_snapshot';
  end if;

  if not has_function_privilege('service_role', 'public.persist_game_trophy_snapshot_with_events(uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamp with time zone,timestamp with time zone)', 'EXECUTE') then
    raise exception 'service_role must execute persist_game_trophy_snapshot_with_events';
  end if;

  if not has_function_privilege('service_role', 'public.claim_share_ai_refresh(uuid,timestamp with time zone,integer,integer)', 'EXECUTE') then
    raise exception 'service_role must execute claim_share_ai_refresh';
  end if;
end;
$$;

create table public.m10_future_table_probe (id integer primary key);
create function public.m10_future_function_probe()
returns integer
language sql
as $$ select 1 $$;

do $$
begin
  if has_table_privilege('anon', 'public.m10_future_table_probe', 'SELECT')
     or has_table_privilege('authenticated', 'public.m10_future_table_probe', 'SELECT') then
    raise exception 'future public tables must not grant browser roles by default';
  end if;

  if has_function_privilege('PUBLIC', 'public.m10_future_function_probe()', 'EXECUTE')
     or has_function_privilege('anon', 'public.m10_future_function_probe()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.m10_future_function_probe()', 'EXECUTE') then
    raise exception 'future public functions must not grant browser/public execution by default';
  end if;
end;
$$;

rollback;
