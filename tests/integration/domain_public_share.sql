\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000000701');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status,
  preferred_locale
) values (
  '10000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000701',
  'fixture-m7-player',
  '9977777777777777777',
  'connected',
  'it-IT'
);

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.rotate_account_share_link(uuid,text,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute rotate_account_share_link';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.rotate_account_share_link(uuid,text,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute rotate_account_share_link';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.revoke_account_share_link(uuid,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute revoke_account_share_link';
  end if;
end;
$$;

select * from public.rotate_account_share_link(
  '10000000-0000-0000-0000-000000000701',
  repeat('a', 64),
  '2026-08-20T12:00:00Z',
  'AI share'
);

do $$
declare
  active_count integer;
  stored_hash text;
begin
  select count(*), min(token_hash)
    into active_count, stored_hash
  from public.share_links
  where psn_account_id = '10000000-0000-0000-0000-000000000701'
    and is_active = true;

  if active_count <> 1 then
    raise exception 'expected exactly one active share, got %', active_count;
  end if;
  if stored_hash <> repeat('a', 64) then
    raise exception 'stored token hash mismatch';
  end if;
end;
$$;

select * from public.rotate_account_share_link(
  '10000000-0000-0000-0000-000000000701',
  repeat('b', 64),
  '2026-08-20T12:05:00Z',
  'AI share'
);

do $$
declare
  active_count integer;
  revoked_count integer;
begin
  select count(*) into active_count
  from public.share_links
  where psn_account_id = '10000000-0000-0000-0000-000000000701'
    and is_active = true;

  select count(*) into revoked_count
  from public.share_links
  where psn_account_id = '10000000-0000-0000-0000-000000000701'
    and is_active = false
    and revoked_at is not null;

  if active_count <> 1 or revoked_count <> 1 then
    raise exception 'share rotation must leave one active and one revoked';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.share_links(psn_account_id, token_hash, is_active)
    values (
      '10000000-0000-0000-0000-000000000701',
      repeat('c', 64),
      true
    );
    raise exception 'expected one-active-share uniqueness violation';
  exception
    when unique_violation then null;
  end;
end;
$$;

select * from public.revoke_account_share_link(
  '10000000-0000-0000-0000-000000000701',
  '2026-08-20T12:10:00Z'
);

do $$
declare
  active_count integer;
  invalid_revocation_count integer;
begin
  select count(*) into active_count
  from public.share_links
  where psn_account_id = '10000000-0000-0000-0000-000000000701'
    and is_active = true;

  select count(*) into invalid_revocation_count
  from public.share_links
  where psn_account_id = '10000000-0000-0000-0000-000000000701'
    and is_active = false
    and revoked_at is null;

  if active_count <> 0 then
    raise exception 'revocation must leave zero active links';
  end if;
  if invalid_revocation_count <> 0 then
    raise exception 'inactive links must carry revoked_at';
  end if;
end;
$$;

do $$
begin
  begin
    perform * from public.rotate_account_share_link(
      '10000000-0000-0000-0000-000000000701',
      'not-a-sha256',
      '2026-08-20T12:15:00Z',
      'AI share'
    );
    raise exception 'expected invalid hash rejection';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

rollback;
