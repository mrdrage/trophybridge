\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000000801');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status,
  preferred_locale
) values (
  '10000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000801',
  'fixture-m8-player',
  '9988888888888888888',
  'connected',
  'it-IT'
);

insert into public.share_links (
  id,
  psn_account_id,
  token_hash,
  label,
  is_active,
  created_at
) values (
  '20000000-0000-0000-0000-000000000801',
  '10000000-0000-0000-0000-000000000801',
  repeat('d', 64),
  'AI share',
  true,
  '2026-08-20T12:00:00Z'
);

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.claim_share_ai_refresh(uuid,timestamptz,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute claim_share_ai_refresh';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_share_ai_refresh(uuid,timestamptz,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute claim_share_ai_refresh';
  end if;
end;
$$;

do $$
declare
  was_allowed boolean;
  retry_after integer;
begin
  select allowed, retry_after_seconds
    into was_allowed, retry_after
  from public.claim_share_ai_refresh(
    '20000000-0000-0000-0000-000000000801',
    '2026-08-20T12:00:00Z',
    3600,
    2
  );
  if not was_allowed or retry_after <> 0 then
    raise exception 'first M8 refresh claim must be allowed';
  end if;

  select allowed, retry_after_seconds
    into was_allowed, retry_after
  from public.claim_share_ai_refresh(
    '20000000-0000-0000-0000-000000000801',
    '2026-08-20T12:01:00Z',
    3600,
    2
  );
  if not was_allowed then
    raise exception 'second M8 refresh claim must be allowed';
  end if;

  select allowed, retry_after_seconds
    into was_allowed, retry_after
  from public.claim_share_ai_refresh(
    '20000000-0000-0000-0000-000000000801',
    '2026-08-20T12:02:00Z',
    3600,
    2
  );
  if was_allowed or retry_after <> 3480 then
    raise exception 'third M8 refresh claim must be rate limited, got allowed %, retry %', was_allowed, retry_after;
  end if;
end;
$$;

do $$
declare
  was_allowed boolean;
  claim_count integer;
begin
  select allowed
    into was_allowed
  from public.claim_share_ai_refresh(
    '20000000-0000-0000-0000-000000000801',
    '2026-08-20T13:01:00Z',
    3600,
    2
  );

  select ai_refresh_count into claim_count
  from public.share_links
  where id = '20000000-0000-0000-0000-000000000801';

  if not was_allowed or claim_count <> 1 then
    raise exception 'new M8 refresh window must reset the counter';
  end if;
end;
$$;

update public.share_links
set is_active = false,
    revoked_at = '2026-08-20T13:02:00Z'
where id = '20000000-0000-0000-0000-000000000801';

do $$
declare
  was_allowed boolean;
begin
  select allowed
    into was_allowed
  from public.claim_share_ai_refresh(
    '20000000-0000-0000-0000-000000000801',
    '2026-08-20T13:03:00Z',
    3600,
    2
  );
  if was_allowed then
    raise exception 'revoked M8 share must not claim refresh budget';
  end if;
end;
$$;

rollback;
