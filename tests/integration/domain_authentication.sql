\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status
) values (
  '10000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  'fixture-player',
  '9912345678901234567',
  'connected'
);

-- Italian is the product default selected for the pilot account.
do $$
declare
  locale_value text;
begin
  select preferred_locale into locale_value
  from public.psn_accounts
  where id = '10000000-0000-0000-0000-000000000101';

  if locale_value <> 'it-IT' then
    raise exception 'expected default preferred_locale it-IT, got %', locale_value;
  end if;
end;
$$;

insert into public.psn_credentials (
  id,
  psn_account_id,
  encrypted_refresh_token,
  encryption_iv,
  encryption_auth_tag,
  key_version,
  refresh_token_expires_at
) values (
  '11000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000101',
  'fixture-ciphertext-not-a-real-token',
  'fixture-iv',
  'fixture-auth-tag',
  1,
  '2026-12-01T00:00:00Z'
);

-- v0.1 intentionally supports one PSN connection per TrophyBridge owner.
do $$
begin
  begin
    insert into public.psn_accounts (
      owner_user_id,
      psn_online_id,
      psn_account_id
    ) values (
      '00000000-0000-0000-0000-000000000101',
      'second-account',
      '9912345678901234568'
    );

    raise exception 'expected one-PSN-account-per-owner invariant';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

-- Authenticated users can read only their own non-secret account metadata.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.psn_accounts;
  if visible_count <> 1 then
    raise exception 'expected owner to see exactly one PSN account, got %', visible_count;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.psn_accounts;
  if visible_count <> 0 then
    raise exception 'expected unrelated owner to see no PSN accounts, got %', visible_count;
  end if;
end;
$$;

-- Credential ciphertext is not queryable by authenticated browser roles at all.
do $$
begin
  begin
    perform 1 from public.psn_credentials;
    raise exception 'expected psn_credentials access to be denied';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;

rollback;
