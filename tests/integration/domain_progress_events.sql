\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000000601');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status,
  preferred_locale
) values (
  '10000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000601',
  'fixture-m6-player',
  '9966666666666666666',
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
  '30000000-0000-0000-0000-000000000601',
  'NPWR60001_00',
  'trophy2',
  'Fixture M6',
  array['PS5']
);

insert into public.account_games (
  id,
  psn_account_id,
  game_id,
  progress_percent,
  total_bronze,
  total_platinum,
  first_seen_at,
  last_seen_at
) values (
  '40000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000601',
  0,
  1,
  1,
  '2026-08-19T20:00:00Z',
  '2026-08-19T20:00:00Z'
);

-- First deep sync establishes a baseline and must not create historical progress events.
insert into public.sync_runs (
  id, psn_account_id, game_id, sync_type, status, started_at
) values (
  '50000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000601',
  'game', 'running', '2026-08-19T20:01:00Z'
);

do $$
declare
  found integer;
  event_count integer;
begin
  select new_trophies_found into found
  from public.persist_game_trophy_snapshot_with_events(
    '10000000-0000-0000-0000-000000000601',
    '30000000-0000-0000-0000-000000000601',
    '50000000-0000-0000-0000-000000000601',
    '[{
      "groupId":"default",
      "kind":"base",
      "name":"Fixture M6",
      "iconUrl":null,
      "definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":1}
    }]'::jsonb,
    '[
      {"trophyId":0,"groupId":"default","name":"Primo passo","description":"Bronzo.","type":"bronze","hidden":false,"iconUrl":null},
      {"trophyId":1,"groupId":"default","name":"Platino","description":"Platino.","type":"platinum","hidden":false,"iconUrl":null}
    ]'::jsonb,
    '[
      {"trophyId":0,"type":"bronze","hidden":false,"earned":false,"earnedAt":null,"rarity":"common","earnedRate":70,"progressValue":null,"progressTarget":null,"progressPercent":null},
      {"trophyId":1,"type":"platinum","hidden":false,"earned":false,"earnedAt":null,"rarity":"rare","earnedRate":10,"progressValue":null,"progressTarget":null,"progressPercent":null}
    ]'::jsonb,
    '2026-08-19T20:02:00Z',
    '2026-08-19T20:07:00Z'
  );

  if found <> 0 then
    raise exception 'first deep sync must not report historical trophies as new';
  end if;

  select count(*) into event_count
  from public.progress_events
  where psn_account_id = '10000000-0000-0000-0000-000000000601';

  if event_count <> 0 then
    raise exception 'first deep sync created historical progress events';
  end if;
end;
$$;

update public.sync_runs
set status = 'success', finished_at = '2026-08-19T20:02:00Z'
where id = '50000000-0000-0000-0000-000000000601';

-- A durable false -> true transition creates exactly one trophy_earned event.
insert into public.sync_runs (
  id, psn_account_id, game_id, sync_type, status, started_at
) values (
  '50000000-0000-0000-0000-000000000602',
  '10000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000601',
  'game', 'running', '2026-08-19T20:10:00Z'
);

do $$
declare
  found integer;
  trophy_events integer;
  occurred timestamptz;
begin
  select new_trophies_found into found
  from public.persist_game_trophy_snapshot_with_events(
    '10000000-0000-0000-0000-000000000601',
    '30000000-0000-0000-0000-000000000601',
    '50000000-0000-0000-0000-000000000602',
    '[{"groupId":"default","kind":"base","name":"Fixture M6","iconUrl":null,"definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":1}}]'::jsonb,
    '[
      {"trophyId":0,"groupId":"default","name":"Primo passo","description":"Bronzo.","type":"bronze","hidden":false,"iconUrl":null},
      {"trophyId":1,"groupId":"default","name":"Platino","description":"Platino.","type":"platinum","hidden":false,"iconUrl":null}
    ]'::jsonb,
    '[
      {"trophyId":0,"type":"bronze","hidden":false,"earned":true,"earnedAt":"2026-08-19T20:08:00Z","rarity":"common","earnedRate":70,"progressValue":null,"progressTarget":null,"progressPercent":100},
      {"trophyId":1,"type":"platinum","hidden":false,"earned":false,"earnedAt":null,"rarity":"rare","earnedRate":10,"progressValue":null,"progressTarget":null,"progressPercent":null}
    ]'::jsonb,
    '2026-08-19T20:11:00Z',
    '2026-08-19T20:16:00Z'
  );

  if found <> 1 then
    raise exception 'expected one newly earned trophy, got %', found;
  end if;

  select count(*), min(occurred_at)
  into trophy_events, occurred
  from public.progress_events
  where psn_account_id = '10000000-0000-0000-0000-000000000601'
    and event_type = 'trophy_earned';

  if trophy_events <> 1 then
    raise exception 'expected one trophy_earned event, got %', trophy_events;
  end if;
  if occurred <> '2026-08-19T20:08:00Z'::timestamptz then
    raise exception 'event occurrence time must use PSN earnedAt when available';
  end if;
end;
$$;

update public.sync_runs
set status = 'success', finished_at = '2026-08-19T20:11:00Z', new_trophies_found = 1
where id = '50000000-0000-0000-0000-000000000602';

-- Earning the platinum creates the normal trophy event plus a dedicated platinum event.
insert into public.sync_runs (
  id, psn_account_id, game_id, sync_type, status, started_at
) values (
  '50000000-0000-0000-0000-000000000603',
  '10000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000601',
  'game', 'running', '2026-08-19T20:20:00Z'
);

do $$
declare
  found integer;
  trophy_events integer;
  platinum_events integer;
begin
  select new_trophies_found into found
  from public.persist_game_trophy_snapshot_with_events(
    '10000000-0000-0000-0000-000000000601',
    '30000000-0000-0000-0000-000000000601',
    '50000000-0000-0000-0000-000000000603',
    '[{"groupId":"default","kind":"base","name":"Fixture M6","iconUrl":null,"definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":1}}]'::jsonb,
    '[
      {"trophyId":0,"groupId":"default","name":"Primo passo","description":"Bronzo.","type":"bronze","hidden":false,"iconUrl":null},
      {"trophyId":1,"groupId":"default","name":"Platino","description":"Platino.","type":"platinum","hidden":false,"iconUrl":null}
    ]'::jsonb,
    '[
      {"trophyId":0,"type":"bronze","hidden":false,"earned":true,"earnedAt":"2026-08-19T20:08:00Z","rarity":"common","earnedRate":70,"progressValue":null,"progressTarget":null,"progressPercent":100},
      {"trophyId":1,"type":"platinum","hidden":false,"earned":true,"earnedAt":"2026-08-19T20:18:00Z","rarity":"very_rare","earnedRate":4,"progressValue":null,"progressTarget":null,"progressPercent":100}
    ]'::jsonb,
    '2026-08-19T20:21:00Z',
    '2026-08-19T20:26:00Z'
  );

  if found <> 1 then
    raise exception 'platinum transition must count as one newly earned trophy';
  end if;

  select count(*) into trophy_events
  from public.progress_events
  where psn_account_id = '10000000-0000-0000-0000-000000000601'
    and event_type = 'trophy_earned';

  select count(*) into platinum_events
  from public.progress_events
  where psn_account_id = '10000000-0000-0000-0000-000000000601'
    and event_type = 'platinum_earned';

  if trophy_events <> 2 or platinum_events <> 1 then
    raise exception 'expected two trophy events and one platinum event, got %/%', trophy_events, platinum_events;
  end if;
end;
$$;

update public.sync_runs
set status = 'success', finished_at = '2026-08-19T20:21:00Z', new_trophies_found = 1
where id = '50000000-0000-0000-0000-000000000603';

-- Replaying the same earned state is idempotent and produces no duplicate event.
insert into public.sync_runs (
  id, psn_account_id, game_id, sync_type, status, started_at
) values (
  '50000000-0000-0000-0000-000000000604',
  '10000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000601',
  'game', 'running', '2026-08-19T20:30:00Z'
);

do $$
declare
  found integer;
  event_count integer;
begin
  select new_trophies_found into found
  from public.persist_game_trophy_snapshot_with_events(
    '10000000-0000-0000-0000-000000000601',
    '30000000-0000-0000-0000-000000000601',
    '50000000-0000-0000-0000-000000000604',
    '[{"groupId":"default","kind":"base","name":"Fixture M6","iconUrl":null,"definedTrophies":{"bronze":1,"silver":0,"gold":0,"platinum":1}}]'::jsonb,
    '[
      {"trophyId":0,"groupId":"default","name":"Primo passo","description":"Bronzo.","type":"bronze","hidden":false,"iconUrl":null},
      {"trophyId":1,"groupId":"default","name":"Platino","description":"Platino.","type":"platinum","hidden":false,"iconUrl":null}
    ]'::jsonb,
    '[
      {"trophyId":0,"type":"bronze","hidden":false,"earned":true,"earnedAt":"2026-08-19T20:08:00Z","rarity":"common","earnedRate":70,"progressValue":null,"progressTarget":null,"progressPercent":100},
      {"trophyId":1,"type":"platinum","hidden":false,"earned":true,"earnedAt":"2026-08-19T20:18:00Z","rarity":"very_rare","earnedRate":4,"progressValue":null,"progressTarget":null,"progressPercent":100}
    ]'::jsonb,
    '2026-08-19T20:31:00Z',
    '2026-08-19T20:36:00Z'
  );

  if found <> 0 then
    raise exception 'idempotent replay reported a duplicate newly earned trophy';
  end if;

  select count(*) into event_count
  from public.progress_events
  where psn_account_id = '10000000-0000-0000-0000-000000000601';

  if event_count <> 3 then
    raise exception 'idempotent replay duplicated progress events, count is %', event_count;
  end if;
end;
$$;

update public.sync_runs
set status = 'success', finished_at = '2026-08-19T20:31:00Z'
where id = '50000000-0000-0000-0000-000000000604';

-- The wrapper is server-only and refuses a sync-run ID that is not the active target run.
do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.persist_game_trophy_snapshot_with_events(uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role must not execute M6 progress persistence';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.persist_game_trophy_snapshot_with_events(uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute M6 progress persistence';
  end if;

  begin
    perform public.persist_game_trophy_snapshot_with_events(
      '10000000-0000-0000-0000-000000000601',
      '30000000-0000-0000-0000-000000000601',
      '50000000-0000-0000-0000-000000000699',
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      now(),
      now()
    );
    raise exception 'expected inactive run binding to be rejected';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
