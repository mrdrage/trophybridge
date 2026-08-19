begin;

-- Evaluate auth.uid() once per statement rather than once per row.
drop policy if exists psn_accounts_owner_select on public.psn_accounts;
create policy psn_accounts_owner_select
on public.psn_accounts
for select
to authenticated
using (owner_user_id = (select auth.uid()));

-- Cover composite foreign keys used by progress-event integrity checks.
create index if not exists progress_events_sync_account_idx
  on public.progress_events(sync_run_id, psn_account_id);

create index if not exists progress_events_trophy_game_idx
  on public.progress_events(trophy_id, game_id)
  where trophy_id is not null;

create index if not exists trophies_group_game_idx
  on public.trophies(trophy_group_id, game_id);

commit;
