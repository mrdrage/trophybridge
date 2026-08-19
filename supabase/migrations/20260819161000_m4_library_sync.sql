begin;

alter table public.account_games
  add column is_hidden boolean not null default false,
  add column psn_last_updated_at timestamptz;

create unique index sync_runs_one_running_library_per_account_idx
  on public.sync_runs(psn_account_id)
  where sync_type = 'library' and status = 'running';

create or replace function public.persist_library_snapshot(
  p_psn_account_id uuid,
  p_games jsonb,
  p_seen_at timestamptz
)
returns table(processed_count integer, discovered_count integer)
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(p_games) <> 'array' then
    raise exception 'library snapshot must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_games) > 2000 then
    raise exception 'library snapshot exceeds the v0.1 hard limit of 2000 games'
      using errcode = '54000';
  end if;

  if not exists (
    select 1 from public.psn_accounts where id = p_psn_account_id
  ) then
    raise exception 'PSN account does not exist' using errcode = '23503';
  end if;

  return query
  with input_raw as (
    select
      item->>'communicationId' as np_communication_id,
      item->>'serviceName' as np_service_name,
      item->>'title' as title_name,
      coalesce(
        array(select jsonb_array_elements_text(item->'platforms')),
        '{}'::text[]
      ) as platforms,
      nullif(item->>'iconUrl', '') as icon_url,
      nullif(item->>'progressPercent', '')::numeric as progress_percent,
      coalesce((item->'earnedTrophies'->>'bronze')::integer, 0) as earned_bronze,
      coalesce((item->'earnedTrophies'->>'silver')::integer, 0) as earned_silver,
      coalesce((item->'earnedTrophies'->>'gold')::integer, 0) as earned_gold,
      coalesce((item->'earnedTrophies'->>'platinum')::integer, 0) as earned_platinum,
      coalesce((item->'definedTrophies'->>'bronze')::integer, 0) as total_bronze,
      coalesce((item->'definedTrophies'->>'silver')::integer, 0) as total_silver,
      coalesce((item->'definedTrophies'->>'gold')::integer, 0) as total_gold,
      coalesce((item->'definedTrophies'->>'platinum')::integer, 0) as total_platinum,
      coalesce((item->>'hidden')::boolean, false) as is_hidden,
      nullif(item->>'lastUpdatedAt', '')::timestamptz as psn_last_updated_at
    from jsonb_array_elements(p_games) as source(item)
  ),
  input as (
    select distinct on (np_communication_id, np_service_name) *
    from input_raw
    where np_communication_id is not null
      and np_communication_id <> ''
      and np_service_name in ('trophy', 'trophy2')
      and title_name is not null
      and title_name <> ''
    order by np_communication_id, np_service_name
  ),
  upsert_games as (
    insert into public.games (
      np_communication_id,
      np_service_name,
      title_name,
      platforms,
      icon_url
    )
    select
      np_communication_id,
      np_service_name,
      title_name,
      platforms,
      icon_url
    from input
    on conflict (np_communication_id, np_service_name) do update
    set
      title_name = excluded.title_name,
      platforms = excluded.platforms,
      icon_url = excluded.icon_url
    returning id, np_communication_id, np_service_name
  ),
  resolved as (
    select ug.id as game_id, i.*
    from input i
    join upsert_games ug
      on ug.np_communication_id = i.np_communication_id
     and ug.np_service_name = i.np_service_name
  ),
  discovered as (
    select count(*)::integer as count
    from resolved r
    where not exists (
      select 1
      from public.account_games ag
      where ag.psn_account_id = p_psn_account_id
        and ag.game_id = r.game_id
    )
  ),
  upsert_account_games as (
    insert into public.account_games (
      psn_account_id,
      game_id,
      progress_percent,
      earned_bronze,
      earned_silver,
      earned_gold,
      earned_platinum,
      total_bronze,
      total_silver,
      total_gold,
      total_platinum,
      first_seen_at,
      last_seen_at,
      last_synced_at,
      is_hidden,
      psn_last_updated_at
    )
    select
      p_psn_account_id,
      game_id,
      progress_percent,
      earned_bronze,
      earned_silver,
      earned_gold,
      earned_platinum,
      total_bronze,
      total_silver,
      total_gold,
      total_platinum,
      p_seen_at,
      p_seen_at,
      p_seen_at,
      is_hidden,
      psn_last_updated_at
    from resolved
    on conflict (psn_account_id, game_id) do update
    set
      progress_percent = greatest(
        public.account_games.progress_percent,
        excluded.progress_percent
      ),
      earned_bronze = greatest(public.account_games.earned_bronze, excluded.earned_bronze),
      earned_silver = greatest(public.account_games.earned_silver, excluded.earned_silver),
      earned_gold = greatest(public.account_games.earned_gold, excluded.earned_gold),
      earned_platinum = greatest(public.account_games.earned_platinum, excluded.earned_platinum),
      total_bronze = greatest(public.account_games.total_bronze, excluded.total_bronze),
      total_silver = greatest(public.account_games.total_silver, excluded.total_silver),
      total_gold = greatest(public.account_games.total_gold, excluded.total_gold),
      total_platinum = greatest(public.account_games.total_platinum, excluded.total_platinum),
      last_seen_at = excluded.last_seen_at,
      last_synced_at = excluded.last_synced_at,
      is_hidden = excluded.is_hidden,
      psn_last_updated_at = greatest(
        public.account_games.psn_last_updated_at,
        excluded.psn_last_updated_at
      )
    returning game_id
  ),
  counts as (
    select count(*)::integer as processed from upsert_account_games
  ),
  account_touch as (
    update public.psn_accounts
    set last_successful_sync_at = p_seen_at
    where id = p_psn_account_id
    returning id
  )
  select counts.processed, discovered.count
  from counts
  cross join discovered;
end;
$$;

revoke all on function public.persist_library_snapshot(uuid, jsonb, timestamptz) from public;
revoke all on function public.persist_library_snapshot(uuid, jsonb, timestamptz) from anon;
revoke all on function public.persist_library_snapshot(uuid, jsonb, timestamptz) from authenticated;
grant execute on function public.persist_library_snapshot(uuid, jsonb, timestamptz) to service_role;

comment on function public.persist_library_snapshot(uuid, jsonb, timestamptz) is
  'Atomically persists a bounded provider-normalized library snapshot without deleting missing titles or regressing monotonic trophy counts.';

commit;
