begin;

update public.share_links
set revoked_at = coalesce(revoked_at, now())
where is_active = false
  and revoked_at is null;

create unique index if not exists share_links_one_active_per_account_idx
  on public.share_links(psn_account_id)
  where is_active = true;

alter table public.share_links
  drop constraint if exists share_links_revocation_state_check;

alter table public.share_links
  add constraint share_links_revocation_state_check check (
    (is_active = true and revoked_at is null)
    or (is_active = false and revoked_at is not null)
  );

create or replace function public.rotate_account_share_link(
  p_psn_account_id uuid,
  p_token_hash text,
  p_created_at timestamptz,
  p_label text default 'AI share'
)
returns table (
  is_active boolean,
  created_at timestamptz,
  last_used_at timestamptz
)
language plpgsql
set search_path = public
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid share token hash' using errcode = '22023';
  end if;

  if p_created_at is null then
    raise exception 'created timestamp is required' using errcode = '22023';
  end if;

  if p_label is not null and length(p_label) > 100 then
    raise exception 'share label is too long' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.psn_accounts where id = p_psn_account_id
  ) then
    raise exception 'psn account not found' using errcode = '23503';
  end if;

  update public.share_links
  set is_active = false,
      revoked_at = p_created_at
  where psn_account_id = p_psn_account_id
    and is_active = true;

  return query
  insert into public.share_links (
    psn_account_id,
    token_hash,
    label,
    is_active,
    created_at,
    last_used_at,
    revoked_at
  ) values (
    p_psn_account_id,
    lower(p_token_hash),
    nullif(trim(p_label), ''),
    true,
    p_created_at,
    null,
    null
  )
  returning share_links.is_active, share_links.created_at, share_links.last_used_at;
end;
$$;

create or replace function public.revoke_account_share_link(
  p_psn_account_id uuid,
  p_revoked_at timestamptz
)
returns table (
  is_active boolean,
  created_at timestamptz,
  last_used_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  latest_created timestamptz;
  latest_used timestamptz;
begin
  if p_revoked_at is null then
    raise exception 'revoked timestamp is required' using errcode = '22023';
  end if;

  select sl.created_at, sl.last_used_at
    into latest_created, latest_used
  from public.share_links sl
  where sl.psn_account_id = p_psn_account_id
    and sl.is_active = true
  order by sl.created_at desc
  limit 1;

  update public.share_links
  set is_active = false,
      revoked_at = p_revoked_at
  where psn_account_id = p_psn_account_id
    and is_active = true;

  return query
  select false, latest_created, latest_used;
end;
$$;

revoke all on function public.rotate_account_share_link(uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.rotate_account_share_link(uuid, text, timestamptz, text)
  to service_role;

revoke all on function public.revoke_account_share_link(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.revoke_account_share_link(uuid, timestamptz)
  to service_role;

comment on function public.rotate_account_share_link(uuid, text, timestamptz, text)
  is 'Server-only M7 operation that atomically revokes the prior account share and inserts a new SHA-256 token hash.';
comment on function public.revoke_account_share_link(uuid, timestamptz)
  is 'Server-only M7 operation that revokes the active account share without deleting factual trophy state.';

commit;
