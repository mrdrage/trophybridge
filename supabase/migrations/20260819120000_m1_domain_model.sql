begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.psn_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  psn_online_id text not null,
  psn_account_id text not null,
  auth_status text not null default 'reauth_required',
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psn_accounts_psn_account_id_key unique (psn_account_id),
  constraint psn_accounts_auth_status_check check (
    auth_status in ('connected', 'refreshing', 'reauth_required', 'error')
  )
);

create index psn_accounts_owner_user_id_idx on public.psn_accounts(owner_user_id);
create index psn_accounts_online_id_lower_idx on public.psn_accounts(lower(psn_online_id));

create trigger psn_accounts_set_updated_at
before update on public.psn_accounts
for each row execute function public.set_updated_at();

create table public.games (
  id uuid primary key default gen_random_uuid(),
  np_communication_id text not null,
  np_service_name text not null,
  title_name text not null,
  platforms text[] not null default '{}',
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_provider_identity_key unique (np_communication_id, np_service_name)
);

create index games_title_name_lower_idx on public.games(lower(title_name));

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

create table public.account_games (
  id uuid primary key default gen_random_uuid(),
  psn_account_id uuid not null references public.psn_accounts(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  progress_percent numeric(5,2),
  earned_bronze integer not null default 0,
  earned_silver integer not null default 0,
  earned_gold integer not null default 0,
  earned_platinum integer not null default 0,
  total_bronze integer not null default 0,
  total_silver integer not null default 0,
  total_gold integer not null default 0,
  total_platinum integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz,
  constraint account_games_account_game_key unique (psn_account_id, game_id),
  constraint account_games_progress_percent_check check (
    progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)
  ),
  constraint account_games_nonnegative_counts_check check (
    earned_bronze >= 0 and earned_silver >= 0 and earned_gold >= 0 and earned_platinum >= 0
    and total_bronze >= 0 and total_silver >= 0 and total_gold >= 0 and total_platinum >= 0
  ),
  constraint account_games_seen_order_check check (last_seen_at >= first_seen_at)
);

create index account_games_account_recent_idx
  on public.account_games(psn_account_id, last_seen_at desc);
create index account_games_game_id_idx on public.account_games(game_id);

create table public.trophy_groups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  psn_group_id text not null,
  name text,
  icon_url text,
  kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trophy_groups_game_group_key unique (game_id, psn_group_id),
  constraint trophy_groups_id_game_key unique (id, game_id),
  constraint trophy_groups_kind_check check (kind in ('base', 'dlc', 'unknown')),
  constraint trophy_groups_base_mapping_check check (kind <> 'base' or psn_group_id = 'default')
);

create unique index trophy_groups_one_base_per_game_idx
  on public.trophy_groups(game_id)
  where kind = 'base';
create index trophy_groups_game_id_idx on public.trophy_groups(game_id);

create trigger trophy_groups_set_updated_at
before update on public.trophy_groups
for each row execute function public.set_updated_at();

create table public.trophies (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  trophy_group_id uuid not null,
  psn_trophy_id integer not null,
  name text,
  description text,
  trophy_type text not null,
  is_hidden boolean not null default false,
  icon_url text,
  rarity text,
  earned_rate numeric(6,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trophies_game_trophy_key unique (game_id, psn_trophy_id),
  constraint trophies_group_game_fk foreign key (trophy_group_id, game_id)
    references public.trophy_groups(id, game_id) on delete cascade,
  constraint trophies_psn_trophy_id_check check (psn_trophy_id >= 0),
  constraint trophies_type_check check (trophy_type in ('bronze', 'silver', 'gold', 'platinum')),
  constraint trophies_earned_rate_check check (
    earned_rate is null or (earned_rate >= 0 and earned_rate <= 100)
  )
);

create index trophies_group_id_idx on public.trophies(trophy_group_id);
create index trophies_game_type_idx on public.trophies(game_id, trophy_type);

create trigger trophies_set_updated_at
before update on public.trophies
for each row execute function public.set_updated_at();

create table public.player_trophies (
  id uuid primary key default gen_random_uuid(),
  psn_account_id uuid not null references public.psn_accounts(id) on delete cascade,
  trophy_id uuid not null references public.trophies(id) on delete cascade,
  earned boolean not null default false,
  earned_at timestamptz,
  progress_value numeric,
  progress_target numeric,
  progress_percent numeric(5,2),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_trophies_account_trophy_key unique (psn_account_id, trophy_id),
  constraint player_trophies_earned_at_check check (earned_at is null or earned = true),
  constraint player_trophies_progress_value_check check (progress_value is null or progress_value >= 0),
  constraint player_trophies_progress_target_check check (progress_target is null or progress_target >= 0),
  constraint player_trophies_progress_percent_check check (
    progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)
  ),
  constraint player_trophies_seen_order_check check (last_seen_at >= first_seen_at)
);

create index player_trophies_account_earned_idx
  on public.player_trophies(psn_account_id, earned);
create index player_trophies_trophy_id_idx on public.player_trophies(trophy_id);

create or replace function public.preserve_player_trophy_monotonicity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_seen_at = old.first_seen_at;

  if old.earned and not new.earned then
    new.earned = true;
  end if;

  if old.earned_at is not null then
    if new.earned_at is null or new.earned_at > old.earned_at then
      new.earned_at = old.earned_at;
    end if;
  elsif new.earned_at is not null then
    new.earned = true;
  end if;

  return new;
end;
$$;

create trigger player_trophies_preserve_monotonicity
before update on public.player_trophies
for each row execute function public.preserve_player_trophy_monotonicity();

create trigger player_trophies_set_updated_at
before update on public.player_trophies
for each row execute function public.set_updated_at();

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  psn_account_id uuid not null references public.psn_accounts(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  sync_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  games_processed integer not null default 0,
  trophies_processed integer not null default 0,
  new_trophies_found integer not null default 0,
  error_code text,
  error_message text,
  constraint sync_runs_type_check check (sync_type in ('full', 'library', 'game', 'refresh')),
  constraint sync_runs_status_check check (status in ('running', 'success', 'partial', 'failed')),
  constraint sync_runs_nonnegative_counts_check check (
    games_processed >= 0 and trophies_processed >= 0 and new_trophies_found >= 0
  ),
  constraint sync_runs_time_order_check check (finished_at is null or finished_at >= started_at)
);

create index sync_runs_account_started_idx
  on public.sync_runs(psn_account_id, started_at desc);
create index sync_runs_game_started_idx
  on public.sync_runs(game_id, started_at desc)
  where game_id is not null;

create table public.progress_events (
  id uuid primary key default gen_random_uuid(),
  psn_account_id uuid not null references public.psn_accounts(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  trophy_id uuid references public.trophies(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  detected_at timestamptz not null default now(),
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  constraint progress_events_type_check check (
    event_type in ('game_discovered', 'trophy_earned', 'platinum_earned')
  ),
  constraint progress_events_trophy_presence_check check (
    (event_type = 'game_discovered' and trophy_id is null)
    or (event_type in ('trophy_earned', 'platinum_earned') and trophy_id is not null)
  )
);

create unique index progress_events_game_discovered_once_idx
  on public.progress_events(psn_account_id, game_id, event_type)
  where event_type = 'game_discovered';
create unique index progress_events_trophy_event_once_idx
  on public.progress_events(psn_account_id, trophy_id, event_type)
  where event_type in ('trophy_earned', 'platinum_earned');
create index progress_events_account_detected_idx
  on public.progress_events(psn_account_id, detected_at desc);
create index progress_events_game_detected_idx
  on public.progress_events(game_id, detected_at desc);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  psn_account_id uuid not null references public.psn_accounts(id) on delete cascade,
  token_hash text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint share_links_token_hash_key unique (token_hash),
  constraint share_links_active_revoked_check check (not is_active or revoked_at is null)
);

create index share_links_account_active_idx
  on public.share_links(psn_account_id, is_active);

create table public.sync_targets (
  psn_account_id uuid not null,
  game_id uuid not null,
  last_sync_at timestamptz,
  next_allowed_sync_at timestamptz,
  lock_until timestamptz,
  primary key (psn_account_id, game_id),
  constraint sync_targets_account_game_fk foreign key (psn_account_id, game_id)
    references public.account_games(psn_account_id, game_id) on delete cascade,
  constraint sync_targets_cooldown_order_check check (
    next_allowed_sync_at is null or last_sync_at is null or next_allowed_sync_at >= last_sync_at
  )
);

alter table public.psn_accounts enable row level security;
alter table public.games enable row level security;
alter table public.account_games enable row level security;
alter table public.trophy_groups enable row level security;
alter table public.trophies enable row level security;
alter table public.player_trophies enable row level security;
alter table public.sync_runs enable row level security;
alter table public.progress_events enable row level security;
alter table public.share_links enable row level security;
alter table public.sync_targets enable row level security;

comment on table public.psn_accounts is 'Connected PlayStation accounts. Authentication secrets are stored separately in a later milestone.';
comment on table public.games is 'Provider-normalized game catalog shared across TrophyBridge accounts.';
comment on table public.trophy_groups is 'PlayStation trophy groups classified as base, DLC, or unknown.';
comment on table public.player_trophies is 'Current per-player trophy state. Earned state is monotonic by trigger.';
comment on table public.progress_events is 'Deduplicated meaningful progress events observed during synchronization.';
comment on table public.sync_targets is 'Per-account/game synchronization cooldown and locking state.';

commit;
