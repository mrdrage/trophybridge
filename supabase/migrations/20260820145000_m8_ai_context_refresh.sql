begin;

alter table public.share_links
  add column if not exists ai_refresh_window_started_at timestamptz,
  add column if not exists ai_refresh_count integer not null default 0,
  add column if not exists ai_last_refresh_claimed_at timestamptz;

alter table public.share_links
  drop constraint if exists share_links_ai_refresh_count_check;

alter table public.share_links
  add constraint share_links_ai_refresh_count_check check (ai_refresh_count >= 0);

create or replace function public.claim_share_ai_refresh(
  p_link_id uuid,
  p_claimed_at timestamptz,
  p_window_seconds integer,
  p_max_claims integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
set search_path = public
as $$
declare
  link_active boolean;
  link_revoked_at timestamptz;
  window_started timestamptz;
  claim_count integer;
  window_ends timestamptz;
begin
  if p_claimed_at is null then
    raise exception 'claimed timestamp is required' using errcode = '22023';
  end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'refresh window is out of bounds' using errcode = '22023';
  end if;
  if p_max_claims < 1 or p_max_claims > 120 then
    raise exception 'refresh claim limit is out of bounds' using errcode = '22023';
  end if;

  select sl.is_active, sl.revoked_at, sl.ai_refresh_window_started_at, sl.ai_refresh_count
    into link_active, link_revoked_at, window_started, claim_count
  from public.share_links sl
  where sl.id = p_link_id
  for update;

  if not found or not link_active or link_revoked_at is not null then
    return query select false, 0;
    return;
  end if;

  if window_started is null
     or p_claimed_at >= window_started + make_interval(secs => p_window_seconds) then
    window_started := p_claimed_at;
    claim_count := 0;
  end if;

  window_ends := window_started + make_interval(secs => p_window_seconds);

  if claim_count >= p_max_claims then
    return query
    select false, greatest(1, ceil(extract(epoch from (window_ends - p_claimed_at)))::integer);
    return;
  end if;

  update public.share_links sl
  set ai_refresh_window_started_at = window_started,
      ai_refresh_count = claim_count + 1,
      ai_last_refresh_claimed_at = p_claimed_at
  where sl.id = p_link_id;

  return query select true, 0;
end;
$$;

revoke all on function public.claim_share_ai_refresh(uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_share_ai_refresh(uuid, timestamptz, integer, integer)
  to service_role;

comment on function public.claim_share_ai_refresh(uuid, timestamptz, integer, integer)
  is 'Server-only M8 atomic budget claim for public AI-triggered single-game refresh requests.';
comment on column public.share_links.ai_refresh_count
  is 'Number of M8 public freshness claims consumed in the current bounded share window.';

commit;
