\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000012');

insert into public.psn_accounts (
  id, owner_user_id, psn_online_id, psn_account_id, auth_status
) values
  (
    '10000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000011',
    'player-one',
    'account-one',
    'connected'
  ),
  (
    '10000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000012',
    'player-two',
    'account-two',
    'connected'
  );

insert into public.games (
  id, np_communication_id, np_service_name, title_name, platforms
) values
  (
    '20000000-0000-0000-0000-000000000011',
    'NPWR00011_00',
    'trophy2',
    'Integrity Game One',
    array['PS5']
  ),
  (
    '20000000-0000-0000-0000-000000000012',
    'NPWR00012_00',
    'trophy2',
    'Integrity Game Two',
    array['PS5']
  );

insert into public.trophy_groups (
  id, game_id, psn_group_id, name, kind
) values
  (
    '40000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000011',
    'default',
    'Base Game',
    'base'
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000012',
    'default',
    'Base Game',
    'base'
  );

insert into public.trophies (
  id, game_id, trophy_group_id, psn_trophy_id, name, trophy_type
) values (
  '50000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000011',
  '40000000-0000-0000-0000-000000000011',
  1,
  'Integrity Trophy',
  'bronze'
);

insert into public.sync_runs (
  id, psn_account_id, game_id, sync_type, status
) values (
  '70000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000011',
  'game',
  'success'
);

-- An event cannot claim a trophy from a different game.
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
      '10000000-0000-0000-0000-000000000011',
      '20000000-0000-0000-0000-000000000012',
      '50000000-0000-0000-0000-000000000011',
      'trophy_earned',
      now(),
      '70000000-0000-0000-0000-000000000011'
    );

    raise exception 'expected cross-game progress event to be rejected';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

-- An event cannot attach another account to a sync run it does not own.
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
      '10000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000011',
      '50000000-0000-0000-0000-000000000011',
      'trophy_earned',
      now(),
      '70000000-0000-0000-0000-000000000011'
    );

    raise exception 'expected cross-account sync event to be rejected';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

rollback;
