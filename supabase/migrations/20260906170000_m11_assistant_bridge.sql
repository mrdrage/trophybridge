-- M11: trusted assistant fresh-sync bridge without a long-lived shared bearer.
--
-- Production Supabase exposes the optional `http` extension. CI uses a plain
-- PostgreSQL image, so enable it only when the host makes it available. The
-- invocation function uses dynamic SQL so the portable schema still validates
-- when `http` is absent locally.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'http') then
    execute 'create extension if not exists http with schema extensions';
  end if;
end
$$;

create schema if not exists private;
revoke all on schema private from public;

create table public.assistant_bridge_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  psn_account_id uuid not null references public.psn_accounts(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  fresh_requested boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint assistant_bridge_token_hash_shape check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint assistant_bridge_expiry_after_creation check (expires_at > created_at)
);

alter table public.assistant_bridge_requests enable row level security;
revoke all on public.assistant_bridge_requests from public, anon, authenticated;
grant select, update on public.assistant_bridge_requests to service_role;

create index assistant_bridge_requests_expiry_idx
  on public.assistant_bridge_requests (expires_at);

create table private.assistant_bridge_request_secrets (
  request_id uuid primary key references public.assistant_bridge_requests(id) on delete cascade,
  token text not null,
  constraint assistant_bridge_secret_shape check (token ~ '^tba1_[A-Za-z0-9_-]{43}$')
);

revoke all on private.assistant_bridge_request_secrets from public, anon, authenticated, service_role;

create or replace function private.prepare_trophybridge_ai_context(
  p_psn_account_id uuid,
  p_game_id uuid,
  p_fresh boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_request_id uuid;
  v_token text;
  v_token_hash text;
begin
  if not exists (
    select 1
    from public.share_links
    where psn_account_id = p_psn_account_id
      and is_active = true
      and revoked_at is null
  ) then
    raise exception 'No active AI share for this account';
  end if;

  if not exists (
    select 1
    from public.account_games
    where psn_account_id = p_psn_account_id
      and game_id = p_game_id
      and is_hidden = false
  ) then
    raise exception 'Game is not visible for this account';
  end if;

  delete from public.assistant_bridge_requests
  where expires_at < now() - interval '1 hour';

  -- pgcrypto is installed in `extensions` on Supabase and may be installed in
  -- `public` on a plain PostgreSQL CI host. The fixed search_path resolves both.
  v_token := 'tba1_' || rtrim(
    translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'),
    '='
  );
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.assistant_bridge_requests (
    token_hash,
    psn_account_id,
    game_id,
    fresh_requested,
    expires_at
  ) values (
    v_token_hash,
    p_psn_account_id,
    p_game_id,
    p_fresh,
    now() + interval '60 seconds'
  )
  returning id into v_request_id;

  insert into private.assistant_bridge_request_secrets (request_id, token)
  values (v_request_id, v_token);

  return v_request_id;
end
$$;

revoke all on function private.prepare_trophybridge_ai_context(uuid, uuid, boolean) from public;

create or replace function private.invoke_trophybridge_ai_context(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_request public.assistant_bridge_requests%rowtype;
  v_token text;
  v_url text;
  v_http jsonb;
  v_status integer;
  v_content text;
begin
  -- Lock the public request row so one operator invocation owns this attempt.
  -- The Vercel endpoint performs the separate atomic consumed_at update using
  -- the hash-only row; the private plaintext is never returned to the caller.
  select r.*
  into v_request
  from public.assistant_bridge_requests r
  where r.id = p_request_id
    and r.consumed_at is null
    and r.expires_at > now()
  for update;

  if not found then
    raise exception 'Assistant bridge request is missing, expired, or already consumed';
  end if;

  select s.token
  into v_token
  from private.assistant_bridge_request_secrets s
  where s.request_id = p_request_id;

  if v_token is null then
    raise exception 'Assistant bridge capability is unavailable';
  end if;

  if not exists (select 1 from pg_extension where extname = 'http') then
    raise exception 'The http extension is unavailable on this database host';
  end if;

  v_url := format(
    'https://trophybridge.vercel.app/api/internal/v1/assistant/accounts/%s/games/%s/ai-context?fresh=%s',
    v_request.psn_account_id,
    v_request.game_id,
    case when v_request.fresh_requested then '1' else '0' end
  );

  execute $http$
    select jsonb_build_object('status', status, 'content', content)
    from extensions.http((
      'GET',
      $1,
      extensions.http_headers('Authorization', 'Bearer ' || $2, 'Accept', 'application/json'),
      null,
      null
    )::extensions.http_request)
  $http$
  into v_http
  using v_url, v_token;

  delete from private.assistant_bridge_request_secrets where request_id = p_request_id;

  v_status := (v_http ->> 'status')::integer;
  v_content := v_http ->> 'content';

  if v_status between 200 and 299 then
    return v_content::jsonb;
  end if;

  return jsonb_build_object(
    'bridge_http_status', v_status,
    'response', case
      when v_content is null or v_content = '' then null
      else v_content::jsonb
    end
  );
end
$$;

revoke all on function private.invoke_trophybridge_ai_context(uuid) from public;
