\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000000201');

insert into public.psn_accounts (
  id,
  owner_user_id,
  psn_online_id,
  psn_account_id,
  auth_status
) values (
  '10000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000201',
  'fixture-library-player',
  '9922222222222222222',
  'connected'
);

-- First library snapshot creates two titles atomically.
do $$
declare
  processed integer;
  discovered integer;
begin
  select processed_count, discovered_count
  into processed, discovered
  from public.persist_library_snapshot(
    '10000000-0000-0000-0000-000000000201',
    '[
      {
        "communicationId":"NPWR20001_00",
        "serviceName":"trophy2",
        "title":"Fixture XVI",
        "platforms":["PS5"],
        "progressPercent":42,
        "iconUrl":"https://example.invalid/fixture-xvi.png",
        "definedTrophies":{"bronze":40,"silver":6,"gold":3,"platinum":1},
        "earnedTrophies":{"bronze":14,"silver":2,"gold":1,"platinum":0},
        "lastUpdatedAt":"2026-08-19T09:00:00Z",
        "hidden":false
      },
      {
        "communicationId":"NPWR20002_00",
        "serviceName":"trophy",
        "title":"Legacy Fixture",
        "platforms":["PS4","PSVITA"],
        "progressPercent":10,
        "iconUrl":null,
        "definedTrophies":{"bronze":20,"silver":4,"gold":1,"platinum":1},
        "earnedTrophies":{"bronze":2,"silver":0,"gold":0,"platinum":0},
        "lastUpdatedAt":"2026-08-18T09:00:00Z",
        "hidden":false
      }
    ]'::jsonb,
    '2026-08-19T12:00:00Z'
  );

  if processed <> 2 or discovered <> 2 then
    raise exception 'expected 2 processed/2 discovered, got %/%', processed, discovered;
  end if;
end;
$$;

-- A later partial-looking snapshot never deletes the omitted title and never regresses
-- monotonic progress/counts. Mutable metadata such as title and hidden state may update.
do $$
declare
  processed integer;
  discovered integer;
  progress numeric;
  bronze integer;
  hidden boolean;
  title text;
  provider_updated timestamptz;
  library_count integer;
begin
  select processed_count, discovered_count
  into processed, discovered
  from public.persist_library_snapshot(
    '10000000-0000-0000-0000-000000000201',
    '[
      {
        "communicationId":"NPWR20001_00",
        "serviceName":"trophy2",
        "title":"Fixture XVI Updated",
        "platforms":["PS5"],
        "progressPercent":20,
        "iconUrl":"https://example.invalid/fixture-xvi-new.png",
        "definedTrophies":{"bronze":35,"silver":5,"gold":2,"platinum":1},
        "earnedTrophies":{"bronze":8,"silver":1,"gold":0,"platinum":0},
        "lastUpdatedAt":"2026-08-19T08:00:00Z",
        "hidden":true
      }
    ]'::jsonb,
    '2026-08-19T13:00:00Z'
  );

  if processed <> 1 or discovered <> 0 then
    raise exception 'expected idempotent 1 processed/0 discovered, got %/%', processed, discovered;
  end if;

  select
    ag.progress_percent,
    ag.earned_bronze,
    ag.is_hidden,
    g.title_name,
    ag.psn_last_updated_at
  into progress, bronze, hidden, title, provider_updated
  from public.account_games ag
  join public.games g on g.id = ag.game_id
  where ag.psn_account_id = '10000000-0000-0000-0000-000000000201'
    and g.np_communication_id = 'NPWR20001_00';

  if progress <> 42 or bronze <> 14 then
    raise exception 'library sync regressed monotonic progress/counts';
  end if;
  if hidden is not true or title <> 'Fixture XVI Updated' then
    raise exception 'expected mutable library metadata to update';
  end if;
  if provider_updated <> '2026-08-19T09:00:00Z'::timestamptz then
    raise exception 'provider last-updated timestamp regressed';
  end if;

  select count(*) into library_count
  from public.account_games
  where psn_account_id = '10000000-0000-0000-0000-000000000201';

  if library_count <> 2 then
    raise exception 'omitted game was deleted from the last-good library';
  end if;
end;
$$;

-- Only one running library sync is allowed per account.
insert into public.sync_runs (
  id, psn_account_id, sync_type, status, started_at
) values (
  '20000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000201',
  'library',
  'running',
  '2026-08-19T14:00:00Z'
);

do $$
begin
  begin
    insert into public.sync_runs (
      psn_account_id, sync_type, status, started_at
    ) values (
      '10000000-0000-0000-0000-000000000201',
      'library',
      'running',
      '2026-08-19T14:00:01Z'
    );
    raise exception 'expected concurrent library sync invariant';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

-- The SQL hard ceiling mirrors the application free-tier guardrail.
do $$
declare
  oversized jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'communicationId', 'NPWR' || lpad(n::text, 5, '0') || '_00',
    'serviceName', 'trophy2',
    'title', 'Fixture ' || n,
    'platforms', jsonb_build_array('PS5'),
    'progressPercent', 0,
    'definedTrophies', jsonb_build_object('bronze',0,'silver',0,'gold',0,'platinum',0),
    'earnedTrophies', jsonb_build_object('bronze',0,'silver',0,'gold',0,'platinum',0),
    'hidden', false
  )) into oversized
  from generate_series(1, 2001) n;

  begin
    perform public.persist_library_snapshot(
      '10000000-0000-0000-0000-000000000201',
      oversized,
      '2026-08-19T15:00:00Z'
    );
    raise exception 'expected oversized library snapshot to fail';
  exception
    when program_limit_exceeded then
      null;
  end;
end;
$$;

-- Browser-authenticated roles cannot invoke the privileged persistence function.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);

do $$
begin
  begin
    perform public.persist_library_snapshot(
      '10000000-0000-0000-0000-000000000201',
      '[]'::jsonb,
      now()
    );
    raise exception 'expected authenticated role to be denied library persistence';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;

rollback;
