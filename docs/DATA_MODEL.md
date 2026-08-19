# TrophyBridge Data Model

This document defines the planned v0.1 persistence model. The definitive SQL migrations will be created in M1 after validating representative PSN payloads.

## Entities

### `psn_accounts`

Represents a PlayStation account connected to a TrophyBridge user.

Planned fields:

```text
id uuid primary key
owner_user_id uuid
psn_online_id text
psn_account_id text
auth_status text
last_successful_sync_at timestamptz
created_at timestamptz
updated_at timestamptz
```

`psn_account_id` is text because it is an identifier, not a numeric quantity.

Allowed authentication states are expected to include:

```text
connected
refreshing
reauth_required
error
```

Authentication secrets do not belong in this table.

### `games`

Global normalized game catalog.

```text
id uuid primary key
np_communication_id text
np_service_name text
title_name text
platforms text[]
icon_url text
created_at timestamptz
updated_at timestamptz
```

Expected uniqueness:

```text
unique (np_communication_id, np_service_name)
```

### `account_games`

Player-to-game relationship and aggregate state.

```text
id uuid primary key
psn_account_id uuid
game_id uuid
progress_percent numeric
earned_bronze integer
earned_silver integer
earned_gold integer
earned_platinum integer
total_bronze integer
total_silver integer
total_gold integer
total_platinum integer
first_seen_at timestamptz
last_seen_at timestamptz
last_synced_at timestamptz
```

### `trophy_groups`

Normalized PlayStation trophy groups.

```text
id uuid primary key
game_id uuid
psn_group_id text
name text
icon_url text
kind text
created_at timestamptz
updated_at timestamptz
```

Expected `kind` values:

```text
base
dlc
unknown
```

Initial mapping rule:

```text
PSN group "default" -> base
numbered/additional groups -> dlc
unexpected state -> unknown
```

The `unknown` state prevents the system from silently guessing when upstream behavior changes.

### `trophies`

Normalized trophy metadata independent of a player.

```text
id uuid primary key
game_id uuid
trophy_group_id uuid
psn_trophy_id integer
name text
description text
trophy_type text
is_hidden boolean
icon_url text
rarity text
earned_rate numeric
created_at timestamptz
updated_at timestamptz
```

Expected trophy types:

```text
bronze
silver
gold
platinum
```

The exact unique key will be finalized against real payloads. Preferred candidates are:

```text
unique (game_id, psn_trophy_id)
```

or, if IDs repeat across groups:

```text
unique (game_id, trophy_group_id, psn_trophy_id)
```

### `player_trophies`

Current player state for one trophy.

```text
id uuid primary key
psn_account_id uuid
trophy_id uuid
earned boolean
earned_at timestamptz
progress_value numeric
progress_target numeric
progress_percent numeric
first_seen_at timestamptz
last_seen_at timestamptz
updated_at timestamptz
```

Expected uniqueness:

```text
unique (psn_account_id, trophy_id)
```

Updates use UPSERT semantics.

### `progress_events`

Append-oriented event history for meaningful state changes.

```text
id uuid primary key
psn_account_id uuid
game_id uuid
trophy_id uuid nullable
event_type text
occurred_at timestamptz
detected_at timestamptz
sync_run_id uuid
```

Initial event types:

```text
game_discovered
trophy_earned
platinum_earned
```

`occurred_at` means when the upstream data says the event happened. `detected_at` means when TrophyBridge first observed it.

### `sync_runs`

Audit and diagnostics for synchronization attempts.

```text
id uuid primary key
psn_account_id uuid
sync_type text
status text
started_at timestamptz
finished_at timestamptz
games_processed integer
trophies_processed integer
new_trophies_found integer
error_code text
error_message text
```

Expected sync types:

```text
full
library
game
refresh
```

Expected statuses:

```text
running
success
partial
failed
```

### `share_links`

Revocable public read-only access.

```text
id uuid primary key
psn_account_id uuid
token_hash text
label text
is_active boolean
created_at timestamptz
last_used_at timestamptz
revoked_at timestamptz
```

The raw public token should not need to be stored once issued. The server can compare a cryptographic hash of the incoming token.

### `sync_targets`

Coordinates game-level synchronization and cooldowns.

```text
psn_account_id uuid
game_id uuid
last_sync_at timestamptz
next_allowed_sync_at timestamptz
lock_until timestamptz
```

This prevents concurrent public requests from launching duplicate upstream synchronization work.

## Relationships

```text
auth.users
   |
   v
psn_accounts
   |\
   | \---- sync_runs
   | \---- share_links
   | \---- progress_events
   |
   v
account_games ------> games
                       |
                       v
                 trophy_groups
                       |
                       v
                    trophies
                       |
                       v
                player_trophies
```

## Data invariants

- One trophy state row per player/trophy pair.
- Earned state is monotonic unless an explicit future repair workflow proves local data invalid.
- A failed sync cannot delete valid prior data.
- Platinum progress counts only trophies in the base group.
- A game may have at most one group classified as `base`.
- Public tokens and authentication secrets are separate concerns.
- Provider identifiers remain attributes, not internal primary keys.

## Snapshot strategy

TrophyBridge does not plan to save a complete duplicate snapshot after every sync. The current state lives in normalized tables while `progress_events` records meaningful deltas. This keeps history useful without multiplying unchanged rows.
