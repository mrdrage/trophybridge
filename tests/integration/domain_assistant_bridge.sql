\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000001101');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status,
  preferred_locale
) values (
  '10000000-0000-0000-0000-000000001101',
  '00000000-0000-0000-0000-000000001101',
  'fixture-m11-player',
  '9911111111111111111',
  'connected',
  'it-IT'
);

insert into public.games (
  id,
  np_communication_id,
  np_service_name,
  title_name,
  platforms
) values (
  '20000000-0000-0000-0000-000000001101',
  'NPWR-M11-FIXTURE',
  'trophy',
  'M11 Fixture Game',
  array['PS5']
);

insert into public.account_games (psn_account_id, game_id, is_hidden)
values (
  '10000000-0000-0000-0000-000000001101',
  '20000000-0000-0000-0000-000000001101',
  false
);

select * from public.rotate_account_share_link(
  '10000000-0000-0000-0000-000000001101',
  repeat('d', 64),
  '2026-09-06T17:00:00Z',
  'AI share'
);

do $$
declare
  v_request_id uuid;
  v_hash text;
  v_token text;
  v_expires timestamptz;
begin
  v_request_id := private.prepare_trophybridge_ai_context(
    '10000000-0000-0000-0000-000000001101',
    '20000000-0000-0000-0000-000000001101',
    true
  );

  select token_hash, expires_at
  into v_hash, v_expires
  from public.assistant_bridge_requests
  where id = v_request_id;

  select token
  into v_token
  from private.assistant_bridge_request_secrets
  where request_id = v_request_id;

  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'assistant request must persist only a sha256 token hash publicly';
  end if;
  if v_token is null or v_token !~ '^tba1_[A-Za-z0-9_-]{43}$' then
    raise exception 'private one-time capability has an invalid shape';
  end if;
  if encode(digest(v_token, 'sha256'), 'hex') <> v_hash then
    raise exception 'private one-time capability does not match public hash';
  end if;
  if v_expires <= now() then
    raise exception 'assistant capability must expire in the future';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.assistant_bridge_requests', 'SELECT') then
    raise exception 'authenticated must not read assistant bridge requests';
  end if;
  if has_table_privilege('service_role', 'private.assistant_bridge_request_secrets', 'SELECT') then
    raise exception 'service_role must not read private assistant capability plaintext';
  end if;
  if has_function_privilege(
    'authenticated',
    'private.prepare_trophybridge_ai_context(uuid,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not prepare assistant bridge requests';
  end if;
  if has_function_privilege(
    'service_role',
    'private.invoke_trophybridge_ai_context(uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must not invoke the operator-only bridge function';
  end if;
end;
$$;

rollback;
