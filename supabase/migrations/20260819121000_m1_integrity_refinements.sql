begin;

alter table public.trophies
  add constraint trophies_id_game_key unique (id, game_id);

alter table public.sync_runs
  add constraint sync_runs_id_account_key unique (id, psn_account_id);

alter table public.progress_events
  add constraint progress_events_trophy_game_fk
  foreign key (trophy_id, game_id)
  references public.trophies(id, game_id)
  on delete cascade;

alter table public.progress_events
  add constraint progress_events_sync_account_fk
  foreign key (sync_run_id, psn_account_id)
  references public.sync_runs(id, psn_account_id)
  on delete cascade;

commit;
