\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000000501');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status,
  preferred_locale
) values (
  '10000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000501',
  'fixture-m5-player',
  '9955555555555555555',
  'connected',
  'it-IT'
);

select * from public.persist_library_snapshot(
  '10000000-0000-0000-0000-000000000501',
  '[{
    "communicationId":"NPWR50001_00",
    "serviceName":"trophy2",
    "title":"Fixture M5",
    "platforms":["PS5"],
    "progressPercent":30,
    "iconUrl":"https://example.invalid/m5.png",
    "definedTrophies":{"bronze":2,"silver":0,"gold":0,"platinum":1},
    "earnedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":0},
    "lastUpdatedAt":"2026-08-19T18:00:00Z",
    "hidden":false
  }]'::jsonb,
  '2026-08-19T18:10:00Z'
);

-- First deep snapshot persists base/additional structure, localized metadata and player state.
do $$
declare
  target_game uuid;
  processed integer;
  earned integer;
  base_total integer;
  base_earned integer;
  additional_total integer;
  additional_earned integer;
  group_count integer;
  player_count integer;
  next_allowed timestamptz;
begin
  select id into target_game
  from public.games
  where np_communication_id = 'NPWR50001_00'
    and np_service_name = 'trophy2';

  select
    processed_count,
    earned_count,
    base_trophy_count,
    base_earned_count,
    additional_trophy_count,
    additional_earned_count
  into processed, earned, base_total, base_earned, additional_total, additional_earned
  from public.persist_game_trophy_snapshot(
    '10000000-0000-0000-0000-000000000501',
    target_game,
    '[
      {
        "groupId":"default",
        "kind":"base",
        "name":"Fixture M5",
        "iconUrl":null,
        "definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":1}
      },
      {
        "groupId":"001",
        "kind":"dlc",
        "name":"Contenuto aggiuntivo",
        "iconUrl":null,
        "definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":0}
      }
    ]'::jsonb,
    '[
      {
        "trophyId":0,
        "groupId":"default",
        "name":"Primo passo",
        "description":"Ottieni il primo trofeo.",
        "type":"bronze",
        "hidden":false,
        "iconUrl":null
      },
      {
        "trophyId":1,
        "groupId":"default",
        "name":"Platino",
        "description":"Ottieni tutti i trofei base.",
        "type":"platinum",
        "hidden":false,
        "iconUrl":null
      },
      {
        "trophyId":2,
        "groupId":"001",
        "name":"Extra",
        "description":null,
        "type":"bronze",
        "hidden":false,
        "iconUrl":null
      }
    ]'::jsonb,
    '[
      {
        "trophyId":0,
        "type":"bronze",
        "hidden":false,
        "earned":true,
        "earnedAt":"2026-08-19T17:00:00Z",
        "rarity":"common",
        "earnedRate":60,
        "progressValue":null,
        "progressTarget":null,
        "progressPercent":100
      },
      {
        "trophyId":1,
        "type":"platinum",
        "hidden":false,
        "earned":false,
        "earnedAt":null,
        "rarity":"rare",
        "earnedRate":10,
        "progressValue":null,
        "progressTarget":null,
        "progressPercent":null
      },
      {
        "trophyId":2,
        "type":"bronze",
        "hidden":false,
        "earned":true,
        "earnedAt":"2026-08-19T17:30:00Z",
        "rarity":"common",
        "earnedRate":70,
        "progressValue":null,
        "progressTarget":null,
        "progressPercent":100
      }
    ]'::jsonb,
    '2026-08-19T18:20:00Z',
    '2026-08-19T18:25:00Z'
  );

  if processed <> 3 or earned <> 2 then
    raise exception 'expected 3 processed and 2 earned, got %/%', processed, earned;
  end if;
  if base_total <> 2 or base_earned <> 1 then
    raise exception 'base-game separation is incorrect: %/%', base_earned, base_total;
  end if;
  if additional_total <> 1 or additional_earned <> 1 then
    raise exception 'additional-group separation is incorrect: %/%', additional_earned, additional_total;
  end if;

  select count(*) into group_count
  from public.trophy_groups
  where game_id = target_game;
  if group_count <> 2 then
    raise exception 'expected exactly two persisted trophy groups';
  end if;

  select count(*) into player_count
  from public.player_trophies pt
  join public.trophies t on t.id = pt.trophy_id
  where pt.psn_account_id = '10000000-0000-0000-0000-000000000501'
    and t.game_id = target_game;
  if player_count <> 3 then
    raise exception 'expected player state for all title trophies';
  end if;

  select next_allowed_sync_at into next_allowed
  from public.sync_targets
  where psn_account_id = '10000000-0000-0000-0000-000000000501'
    and game_id = target_game;
  if next_allowed <> '2026-08-19T18:25:00Z'::timestamptz then
    raise exception 'game sync target cooldown was not persisted';
  end if;
end;
$$;

-- A later snapshot cannot unearn trophies or erase known localized metadata.
do $$
declare
  target_game uuid;
  first_trophy uuid;
  still_earned boolean;
  preserved_name text;
  earned_total integer;
begin
  select id into target_game
  from public.games
  where np_communication_id = 'NPWR50001_00';

  select id into first_trophy
  from public.trophies
  where game_id = target_game and psn_trophy_id = 0;

  perform public.persist_game_trophy_snapshot(
    '10000000-0000-0000-0000-000000000501',
    target_game,
    '[
      {"groupId":"default","kind":"base","name":null,"iconUrl":null,"definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":1}},
      {"groupId":"001","kind":"dlc","name":null,"iconUrl":null,"definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":0}}
    ]'::jsonb,
    '[
      {"trophyId":0,"groupId":"default","name":null,"description":null,"type":"bronze","hidden":false,"iconUrl":null},
      {"trophyId":1,"groupId":"default","name":"Platino","description":null,"type":"platinum","hidden":false,"iconUrl":null},
      {"trophyId":2,"groupId":"001","name":"Extra","description":null,"type":"bronze","hidden":false,"iconUrl":null}
    ]'::jsonb,
    '[
      {"trophyId":0,"type":"bronze","hidden":false,"earned":false,"earnedAt":null,"rarity":"common","earnedRate":59,"progressValue":null,"progressTarget":null,"progressPercent":null},
      {"trophyId":1,"type":"platinum","hidden":false,"earned":false,"earnedAt":null,"rarity":"rare","earnedRate":10,"progressValue":null,"progressTarget":null,"progressPercent":null},
      {"trophyId":2,"type":"bronze","hidden":false,"earned":false,"earnedAt":null,"rarity":"common","earnedRate":69,"progressValue":null,"progressTarget":null,"progressPercent":null}
    ]'::jsonb,
    '2026-08-19T18:30:00Z',
    '2026-08-19T18:35:00Z'
  );

  select earned into still_earned
  from public.player_trophies
  where psn_account_id = '10000000-0000-0000-0000-000000000501'
    and trophy_id = first_trophy;
  if still_earned is not true then
    raise exception 'earned trophy regressed to unearned';
  end if;

  select name into preserved_name
  from public.trophies
  where id = first_trophy;
  if preserved_name <> 'Primo passo' then
    raise exception 'known localized trophy metadata was erased';
  end if;

  select count(*) into earned_total
  from public.player_trophies pt
  join public.trophies t on t.id = pt.trophy_id
  where pt.psn_account_id = '10000000-0000-0000-0000-000000000501'
    and t.game_id = target_game
    and pt.earned;
  if earned_total <> 2 then
    raise exception 'monotonic earned state did not preserve both earned trophies';
  end if;
end;
$$;

-- Incomplete snapshots are rejected before persistence.
do $$
declare
  target_game uuid;
begin
  select id into target_game from public.games where np_communication_id = 'NPWR50001_00';

  begin
    perform public.persist_game_trophy_snapshot(
      '10000000-0000-0000-0000-000000000501',
      target_game,
      '[{"groupId":"default","kind":"base","name":null,"iconUrl":null,"definedTrophies":{"bronze":2,"silver":0,"gold":0,"platinum":1}}]'::jsonb,
      '[{"trophyId":0,"groupId":"default","name":"Only one","description":null,"type":"bronze","hidden":false,"iconUrl":null}]'::jsonb,
      '[{"trophyId":0,"type":"bronze","hidden":false,"earned":false,"earnedAt":null,"rarity":"common","earnedRate":50,"progressValue":null,"progressTarget":null,"progressPercent":null}]'::jsonb,
      '2026-08-19T18:40:00Z',
      '2026-08-19T18:45:00Z'
    );
    raise exception 'expected partial snapshot to be rejected';
  exception
    when invalid_parameter_value then
      null;
  end;
end;
$$;

-- Only one running game sync is allowed for the same account/game target.
do $$
declare
  target_game uuid;
begin
  select id into target_game from public.games where np_communication_id = 'NPWR50001_00';

  insert into public.sync_runs (
    id, psn_account_id, game_id, sync_type, status, started_at
  ) values (
    '20000000-0000-0000-0000-000000000501',
    '10000000-0000-0000-0000-000000000501',
    target_game,
    'game',
    'running',
    '2026-08-19T18:50:00Z'
  );

  begin
    insert into public.sync_runs (
      psn_account_id, game_id, sync_type, status, started_at
    ) values (
      '10000000-0000-0000-0000-000000000501',
      target_game,
      'game',
      'running',
      '2026-08-19T18:50:01Z'
    );
    raise exception 'expected concurrent game sync invariant';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

-- Browser-authenticated roles cannot invoke privileged deep persistence.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

do $$
declare
  target_game uuid;
begin
  select id into target_game from public.games where np_communication_id = 'NPWR50001_00';
  begin
    perform public.persist_game_trophy_snapshot(
      '10000000-0000-0000-0000-000000000501',
      target_game,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      now(),
      now() + interval '5 minutes'
    );
    raise exception 'expected authenticated role to be denied game trophy persistence';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;

rollback;
