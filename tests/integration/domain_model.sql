\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000000001');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'mrdrage2',
  '1234567890123456789',
  'connected'
);

insert into public.games (
  id,
  np_communication_id,
  np_service_name,
  title_name,
  platforms
) values
  (
    '20000000-0000-0000-0000-000000000001',
    'NPWR00001_00',
    'trophy2',
    'Example PS5 Game',
    array['PS5']
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'NPWR00002_00',
    'trophy2',
    'Second Example Game',
    array['PS5']
  );

insert into public.account_games (
  id,
  psn_account_id,
  game_id,
  progress_percent,
  earned_bronze,
  total_bronze,
  total_platinum
) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  25,
  1,
  2,
  1
);

insert into public.trophy_groups (
  id,
  game_id,
  psn_group_id,
  name,
  kind
) values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'default',
    'Base Game',
    'base'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '001',
    'Expansion',
    'dlc'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    'default',
    'Base Game',
    'base'
  );

-- A title may have at most one group classified as the base game.
do $$
begin
  begin
    insert into public.trophy_groups (
      id,
      game_id,
      psn_group_id,
      name,
      kind
    ) values (
      '40000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000001',
      'default-copy',
      'Invalid second base',
      'base'
    );

    raise exception 'expected second base group to be rejected';
  exception
    when check_violation or unique_violation then
      null;
  end;
end;
$$;

insert into public.trophies (
  id,
  game_id,
  trophy_group_id,
  psn_trophy_id,
  name,
  description,
  trophy_type,
  is_hidden,
  earned_rate
) values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    1,
    'First Step',
    'Earn a test trophy.',
    'bronze',
    false,
    42.5
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    2,
    'Platinum',
    'Earn every base-game trophy.',
    'platinum',
    false,
    5.0
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    3,
    'DLC Trophy',
    'Expansion trophy.',
    'silver',
    false,
    10.0
  );

-- psn-api documents trophyId as unique within a title, not merely within a group.
do $$
begin
  begin
    insert into public.trophies (
      id,
      game_id,
      trophy_group_id,
      psn_trophy_id,
      name,
      trophy_type
    ) values (
      '50000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      1,
      'Duplicate title trophy id',
      'bronze'
    );

    raise exception 'expected duplicate trophy id within title to be rejected';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

-- A trophy group cannot be attached to a different game through the redundant game_id column.
do $$
begin
  begin
    insert into public.trophies (
      id,
      game_id,
      trophy_group_id,
      psn_trophy_id,
      name,
      trophy_type
    ) values (
      '50000000-0000-0000-0000-000000000005',
      '20000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      9,
      'Cross-game mismatch',
      'bronze'
    );

    raise exception 'expected cross-game trophy group mismatch to be rejected';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- The same sync payload can be applied repeatedly without creating duplicate player state.
insert into public.player_trophies (
  id,
  psn_account_id,
  trophy_id,
  earned,
  earned_at,
  progress_percent
) values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  true,
  '2026-08-10T10:00:00Z',
  100
)
on conflict (psn_account_id, trophy_id) do update
set
  earned = excluded.earned,
  earned_at = excluded.earned_at,
  progress_percent = excluded.progress_percent,
  last_seen_at = now();

insert into public.player_trophies (
  psn_account_id,
  trophy_id,
  earned,
  earned_at,
  progress_percent
) values (
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  false,
  null,
  80
)
on conflict (psn_account_id, trophy_id) do update
set
  earned = excluded.earned,
  earned_at = excluded.earned_at,
  progress_percent = excluded.progress_percent,
  last_seen_at = now();

do $$
declare
  row_count integer;
  is_earned boolean;
  earned_time timestamptz;
begin
  select count(*), bool_or(earned), min(earned_at)
  into row_count, is_earned, earned_time
  from public.player_trophies
  where psn_account_id = '10000000-0000-0000-0000-000000000001'
    and trophy_id = '50000000-0000-0000-0000-000000000001';

  if row_count <> 1 then
    raise exception 'idempotent upsert created % rows instead of 1', row_count;
  end if;

  if is_earned is not true then
    raise exception 'earned trophy regressed to false';
  end if;

  if earned_time <> '2026-08-10T10:00:00Z'::timestamptz then
    raise exception 'earned_at was not preserved: %', earned_time;
  end if;
end;
$$;

-- A later provider timestamp must not replace a known earlier earned_at value.
update public.player_trophies
set earned = true,
    earned_at = '2026-08-12T10:00:00Z'
where psn_account_id = '10000000-0000-0000-0000-000000000001'
  and trophy_id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  earned_time timestamptz;
begin
  select earned_at into earned_time
  from public.player_trophies
  where psn_account_id = '10000000-0000-0000-0000-000000000001'
    and trophy_id = '50000000-0000-0000-0000-000000000001';

  if earned_time <> '2026-08-10T10:00:00Z'::timestamptz then
    raise exception 'later earned_at replaced known value: %', earned_time;
  end if;
end;
$$;

-- If a later sync proves the trophy was actually earned earlier, keep the more precise earlier fact.
update public.player_trophies
set earned = true,
    earned_at = '2026-08-09T10:00:00Z'
where psn_account_id = '10000000-0000-0000-0000-000000000001'
  and trophy_id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  earned_time timestamptz;
begin
  select earned_at into earned_time
  from public.player_trophies
  where psn_account_id = '10000000-0000-0000-0000-000000000001'
    and trophy_id = '50000000-0000-0000-0000-000000000001';

  if earned_time <> '2026-08-09T10:00:00Z'::timestamptz then
    raise exception 'earlier authoritative earned_at was not accepted: %', earned_time;
  end if;
end;
$$;

insert into public.sync_runs (
  id,
  psn_account_id,
  game_id,
  sync_type,
  status,
  games_processed,
  trophies_processed,
  new_trophies_found
) values (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'game',
  'success',
  1,
  3,
  1
);

insert into public.progress_events (
  id,
  psn_account_id,
  game_id,
  trophy_id,
  event_type,
  occurred_at,
  sync_run_id
) values (
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'trophy_earned',
  '2026-08-09T10:00:00Z',
  '70000000-0000-0000-0000-000000000001'
);

-- Event generation is append-oriented but deduplicated across repeated syncs.
do $$
begin
  begin
    insert into public.progress_events (
      psn_account_id,
      game_id,
      trophy_id,
      event_type,
      occurred_at,
      sync_run_id
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'trophy_earned',
      '2026-08-09T10:00:00Z',
      '70000000-0000-0000-0000-000000000001'
    );

    raise exception 'expected duplicate trophy event to be rejected';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

insert into public.share_links (
  id,
  psn_account_id,
  token_hash,
  label
) values (
  '90000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'ChatGPT'
);

insert into public.sync_targets (
  psn_account_id,
  game_id,
  last_sync_at,
  next_allowed_sync_at
) values (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '2026-08-19T10:00:00Z',
  '2026-08-19T10:05:00Z'
);

-- RLS is enabled on every table exposed through the public schema. M1 intentionally creates no client policies.
do $$
declare
  secured_tables integer;
begin
  select count(*)
  into secured_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'psn_accounts',
      'games',
      'account_games',
      'trophy_groups',
      'trophies',
      'player_trophies',
      'sync_runs',
      'progress_events',
      'share_links',
      'sync_targets'
    )
    and c.relrowsecurity = true;

  if secured_tables <> 10 then
    raise exception 'expected RLS on 10 domain tables, found %', secured_tables;
  end if;
end;
$$;

-- The schema can cleanly distinguish the base set from DLC when computing platinum progress.
do $$
declare
  base_total integer;
  dlc_total integer;
begin
  select count(*) filter (where tg.kind = 'base'),
         count(*) filter (where tg.kind = 'dlc')
  into base_total, dlc_total
  from public.trophies t
  join public.trophy_groups tg on tg.id = t.trophy_group_id
  where t.game_id = '20000000-0000-0000-0000-000000000001';

  if base_total <> 2 or dlc_total <> 1 then
    raise exception 'unexpected base/DLC split: base %, dlc %', base_total, dlc_total;
  end if;
end;
$$;

rollback;
