begin;

create unique index sync_runs_one_running_game_per_target_idx
  on public.sync_runs(psn_account_id, game_id)
  where sync_type = 'game' and status = 'running';

create or replace function public.persist_game_trophy_snapshot(
  p_psn_account_id uuid,
  p_game_id uuid,
  p_groups jsonb,
  p_trophies jsonb,
  p_user_trophies jsonb,
  p_seen_at timestamptz,
  p_next_allowed_at timestamptz
)
returns table(
  processed_count integer,
  earned_count integer,
  base_trophy_count integer,
  base_earned_count integer,
  additional_trophy_count integer,
  additional_earned_count integer
)
language plpgsql
set search_path = public
as $$
declare
  expected_trophy_count integer;
begin
  if jsonb_typeof(p_groups) <> 'array'
     or jsonb_typeof(p_trophies) <> 'array'
     or jsonb_typeof(p_user_trophies) <> 'array' then
    raise exception 'game trophy snapshot inputs must be JSON arrays' using errcode = '22023';
  end if;

  if jsonb_array_length(p_groups) > 100
     or jsonb_array_length(p_trophies) > 1000
     or jsonb_array_length(p_user_trophies) > 1000 then
    raise exception 'game trophy snapshot exceeds v0.1 safety limits' using errcode = '54000';
  end if;

  if p_next_allowed_at < p_seen_at then
    raise exception 'game trophy cooldown timestamp precedes sync timestamp' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.account_games
    where psn_account_id = p_psn_account_id
      and game_id = p_game_id
  ) then
    raise exception 'game is not attached to this PSN account' using errcode = '23503';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_groups) source(item)
  ) <> (
    select count(distinct item->>'groupId')
    from jsonb_array_elements(p_groups) source(item)
  ) then
    raise exception 'duplicate trophy group identity in snapshot' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_trophies) source(item)
  ) <> (
    select count(distinct (item->>'trophyId')::integer)
    from jsonb_array_elements(p_trophies) source(item)
  ) then
    raise exception 'duplicate title trophy identity in snapshot' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_user_trophies) source(item)
  ) <> (
    select count(distinct (item->>'trophyId')::integer)
    from jsonb_array_elements(p_user_trophies) source(item)
  ) then
    raise exception 'duplicate user trophy identity in snapshot' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_groups) source(item)
    where item->>'kind' = 'base' and item->>'groupId' = 'default'
  ) <> 1
  or exists (
    select 1
    from jsonb_array_elements(p_groups) source(item)
    where item->>'kind' = 'base' and item->>'groupId' <> 'default'
  ) then
    raise exception 'snapshot must contain exactly one default base trophy group' using errcode = '22023';
  end if;

  select coalesce(sum(
    coalesce((item->'definedTrophies'->>'bronze')::integer, 0)
    + coalesce((item->'definedTrophies'->>'silver')::integer, 0)
    + coalesce((item->'definedTrophies'->>'gold')::integer, 0)
    + coalesce((item->'definedTrophies'->>'platinum')::integer, 0)
  ), 0)::integer
  into expected_trophy_count
  from jsonb_array_elements(p_groups) source(item);

  if expected_trophy_count <> jsonb_array_length(p_trophies)
     or jsonb_array_length(p_trophies) <> jsonb_array_length(p_user_trophies) then
    raise exception 'snapshot trophy totals are incomplete or inconsistent' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_trophies) t(item)
    where not exists (
      select 1
      from jsonb_array_elements(p_groups) g(group_item)
      where g.group_item->>'groupId' = t.item->>'groupId'
    )
  ) then
    raise exception 'title trophy references an unknown trophy group' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_user_trophies) u(item)
    where not exists (
      select 1
      from jsonb_array_elements(p_trophies) t(title_item)
      where (t.title_item->>'trophyId')::integer = (u.item->>'trophyId')::integer
        and t.title_item->>'type' = u.item->>'type'
    )
  ) then
    raise exception 'user trophy state does not match title trophy metadata' using errcode = '22023';
  end if;

  return query
  with group_input as (
    select
      item->>'groupId' as group_id,
      case
        when item->>'kind' in ('base', 'dlc', 'unknown') then item->>'kind'
        else 'unknown'
      end as kind,
      nullif(item->>'name', '') as name,
      nullif(item->>'iconUrl', '') as icon_url
    from jsonb_array_elements(p_groups) source(item)
  ),
  upsert_groups as (
    insert into public.trophy_groups (
      game_id,
      psn_group_id,
      name,
      icon_url,
      kind
    )
    select p_game_id, group_id, name, icon_url, kind
    from group_input
    on conflict (game_id, psn_group_id) do update
    set
      name = coalesce(excluded.name, public.trophy_groups.name),
      icon_url = coalesce(excluded.icon_url, public.trophy_groups.icon_url),
      kind = excluded.kind
    returning id, psn_group_id, kind
  ),
  user_input as (
    select
      (item->>'trophyId')::integer as trophy_id,
      item->>'type' as trophy_type,
      coalesce((item->>'earned')::boolean, false) as earned,
      nullif(item->>'earnedAt', '')::timestamptz as earned_at,
      nullif(item->>'rarity', '') as rarity,
      nullif(item->>'earnedRate', '')::numeric as earned_rate,
      nullif(item->>'progressValue', '')::numeric as progress_value,
      nullif(item->>'progressTarget', '')::numeric as progress_target,
      nullif(item->>'progressPercent', '')::numeric as progress_percent
    from jsonb_array_elements(p_user_trophies) source(item)
  ),
  trophy_input as (
    select
      (item->>'trophyId')::integer as trophy_id,
      item->>'groupId' as group_id,
      nullif(item->>'name', '') as name,
      nullif(item->>'description', '') as description,
      item->>'type' as trophy_type,
      coalesce((item->>'hidden')::boolean, false) as is_hidden,
      nullif(item->>'iconUrl', '') as icon_url
    from jsonb_array_elements(p_trophies) source(item)
  ),
  upsert_trophies as (
    insert into public.trophies (
      game_id,
      trophy_group_id,
      psn_trophy_id,
      name,
      description,
      trophy_type,
      is_hidden,
      icon_url,
      rarity,
      earned_rate
    )
    select
      p_game_id,
      ug.id,
      ti.trophy_id,
      ti.name,
      ti.description,
      ti.trophy_type,
      ti.is_hidden,
      ti.icon_url,
      nullif(ui.rarity, 'unknown'),
      ui.earned_rate
    from trophy_input ti
    join upsert_groups ug on ug.psn_group_id = ti.group_id
    join user_input ui on ui.trophy_id = ti.trophy_id
    on conflict (game_id, psn_trophy_id) do update
    set
      trophy_group_id = excluded.trophy_group_id,
      name = coalesce(excluded.name, public.trophies.name),
      description = coalesce(excluded.description, public.trophies.description),
      trophy_type = excluded.trophy_type,
      is_hidden = excluded.is_hidden,
      icon_url = coalesce(excluded.icon_url, public.trophies.icon_url),
      rarity = coalesce(excluded.rarity, public.trophies.rarity),
      earned_rate = coalesce(excluded.earned_rate, public.trophies.earned_rate)
    returning id, trophy_group_id, psn_trophy_id
  ),
  resolved as (
    select
      ut.id as internal_trophy_id,
      ug.kind,
      ui.earned,
      ui.earned_at,
      ui.progress_value,
      ui.progress_target,
      ui.progress_percent
    from upsert_trophies ut
    join upsert_groups ug on ug.id = ut.trophy_group_id
    join user_input ui on ui.trophy_id = ut.psn_trophy_id
  ),
  player_upsert as (
    insert into public.player_trophies (
      psn_account_id,
      trophy_id,
      earned,
      earned_at,
      progress_value,
      progress_target,
      progress_percent,
      first_seen_at,
      last_seen_at
    )
    select
      p_psn_account_id,
      internal_trophy_id,
      earned,
      earned_at,
      progress_value,
      progress_target,
      progress_percent,
      p_seen_at,
      p_seen_at
    from resolved
    on conflict (psn_account_id, trophy_id) do update
    set
      earned = public.player_trophies.earned or excluded.earned,
      earned_at = case
        when public.player_trophies.earned_at is null then excluded.earned_at
        when excluded.earned_at is null then public.player_trophies.earned_at
        else least(public.player_trophies.earned_at, excluded.earned_at)
      end,
      progress_value = greatest(public.player_trophies.progress_value, excluded.progress_value),
      progress_target = coalesce(excluded.progress_target, public.player_trophies.progress_target),
      progress_percent = greatest(public.player_trophies.progress_percent, excluded.progress_percent),
      last_seen_at = excluded.last_seen_at
    returning trophy_id, earned
  ),
  stats as (
    select
      count(*)::integer as processed,
      count(*) filter (where pu.earned)::integer as earned,
      count(*) filter (where tg.kind = 'base')::integer as base_total,
      count(*) filter (where tg.kind = 'base' and pu.earned)::integer as base_earned,
      count(*) filter (where tg.kind <> 'base')::integer as additional_total,
      count(*) filter (where tg.kind <> 'base' and pu.earned)::integer as additional_earned
    from player_upsert pu
    join public.trophies t on t.id = pu.trophy_id
    join public.trophy_groups tg on tg.id = t.trophy_group_id
  ),
  sync_target_touch as (
    insert into public.sync_targets (
      psn_account_id,
      game_id,
      last_sync_at,
      next_allowed_sync_at,
      lock_until
    ) values (
      p_psn_account_id,
      p_game_id,
      p_seen_at,
      p_next_allowed_at,
      null
    )
    on conflict (psn_account_id, game_id) do update
    set
      last_sync_at = excluded.last_sync_at,
      next_allowed_sync_at = excluded.next_allowed_sync_at,
      lock_until = null
    returning game_id
  ),
  account_touch as (
    update public.psn_accounts
    set last_successful_sync_at = greatest(last_successful_sync_at, p_seen_at)
    where id = p_psn_account_id
    returning id
  )
  select
    stats.processed,
    stats.earned,
    stats.base_total,
    stats.base_earned,
    stats.additional_total,
    stats.additional_earned
  from stats;
end;
$$;

revoke all on function public.persist_game_trophy_snapshot(
  uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) from public;
revoke all on function public.persist_game_trophy_snapshot(
  uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) from anon;
revoke all on function public.persist_game_trophy_snapshot(
  uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) from authenticated;
grant execute on function public.persist_game_trophy_snapshot(
  uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) to service_role;

comment on function public.persist_game_trophy_snapshot(
  uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) is
  'Atomically persists one bounded, provider-normalized game trophy snapshot. It preserves earned state and known metadata, separates the default base group from additional groups, and never deep-syncs another title.';

commit;
