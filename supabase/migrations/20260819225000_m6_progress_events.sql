begin;

create or replace function public.persist_game_trophy_snapshot_with_events(
  p_psn_account_id uuid,
  p_game_id uuid,
  p_sync_run_id uuid,
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
  additional_earned_count integer,
  new_trophies_found integer
)
language plpgsql
set search_path = public
as $$
declare
  v_newly_earned jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.sync_runs
    where id = p_sync_run_id
      and psn_account_id = p_psn_account_id
      and game_id = p_game_id
      and sync_type = 'game'
      and status = 'running'
  ) then
    raise exception 'progress events require the active game sync run'
      using errcode = '23503';
  end if;

  -- Capture only false -> true transitions that already had a durable baseline.
  -- The first deep sync for a game deliberately produces no historical flood.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'trophyId', (source.item->>'trophyId')::integer,
        'earnedAt', source.item->>'earnedAt'
      )
      order by (source.item->>'trophyId')::integer
    ),
    '[]'::jsonb
  )
  into v_newly_earned
  from jsonb_array_elements(p_user_trophies) source(item)
  join public.trophies t
    on t.game_id = p_game_id
   and t.psn_trophy_id = (source.item->>'trophyId')::integer
  join public.player_trophies pt
    on pt.psn_account_id = p_psn_account_id
   and pt.trophy_id = t.id
  where coalesce((source.item->>'earned')::boolean, false) = true
    and pt.earned = false;

  select
    result.processed_count,
    result.earned_count,
    result.base_trophy_count,
    result.base_earned_count,
    result.additional_trophy_count,
    result.additional_earned_count
  into
    processed_count,
    earned_count,
    base_trophy_count,
    base_earned_count,
    additional_trophy_count,
    additional_earned_count
  from public.persist_game_trophy_snapshot(
    p_psn_account_id,
    p_game_id,
    p_groups,
    p_trophies,
    p_user_trophies,
    p_seen_at,
    p_next_allowed_at
  ) result;

  with candidates as (
    select
      t.id as trophy_id,
      t.trophy_type,
      coalesce(nullif(source.item->>'earnedAt', '')::timestamptz, p_seen_at) as occurred_at
    from jsonb_array_elements(v_newly_earned) source(item)
    join public.trophies t
      on t.game_id = p_game_id
     and t.psn_trophy_id = (source.item->>'trophyId')::integer
  ),
  trophy_events as (
    insert into public.progress_events (
      psn_account_id,
      game_id,
      trophy_id,
      event_type,
      occurred_at,
      detected_at,
      sync_run_id
    )
    select
      p_psn_account_id,
      p_game_id,
      trophy_id,
      'trophy_earned',
      occurred_at,
      p_seen_at,
      p_sync_run_id
    from candidates
    on conflict do nothing
    returning trophy_id
  ),
  platinum_events as (
    insert into public.progress_events (
      psn_account_id,
      game_id,
      trophy_id,
      event_type,
      occurred_at,
      detected_at,
      sync_run_id
    )
    select
      p_psn_account_id,
      p_game_id,
      trophy_id,
      'platinum_earned',
      occurred_at,
      p_seen_at,
      p_sync_run_id
    from candidates
    where trophy_type = 'platinum'
    on conflict do nothing
    returning trophy_id
  )
  select count(*)::integer
  into new_trophies_found
  from trophy_events;

  new_trophies_found := coalesce(new_trophies_found, 0);
  return next;
end;
$$;

revoke all on function public.persist_game_trophy_snapshot_with_events(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) from public;
revoke all on function public.persist_game_trophy_snapshot_with_events(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) from anon;
revoke all on function public.persist_game_trophy_snapshot_with_events(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) from authenticated;
grant execute on function public.persist_game_trophy_snapshot_with_events(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) to service_role;

comment on function public.persist_game_trophy_snapshot_with_events(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz, timestamptz
) is
  'M6 atomic game snapshot wrapper. It records only durable false-to-true trophy transitions, suppresses historical events on first deep sync, emits a dedicated platinum event when appropriate, and delegates factual persistence to the M5 bounded snapshot function.';

commit;
