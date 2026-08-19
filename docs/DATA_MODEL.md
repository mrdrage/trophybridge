# TrophyBridge Data Model

M1 makes PostgreSQL the source of truth for the TrophyBridge v0.1 persistence model. The executable schema lives in [`supabase/migrations/20260819120000_m1_domain_model.sql`](../supabase/migrations/20260819120000_m1_domain_model.sql).

The schema is intentionally provider-aware at its boundaries but uses TrophyBridge-owned UUID primary keys internally. PlayStation identifiers remain attributes, never application primary keys.

## Relationship map

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
      |                |
      |                v
      |          trophy_groups
      |                |
      |                v
      |             trophies
      |                |
      |                v
      +---------- player_trophies
      |
      +---------- sync_targets
```

## Tables

### `psn_accounts`

One connected PlayStation identity owned by a TrophyBridge user.

Important columns:

```text
id uuid primary key
owner_user_id uuid -> auth.users(id)
psn_online_id text
psn_account_id text unique
auth_status text
last_successful_sync_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Allowed `auth_status` values:

```text
connected
refreshing
reauth_required
error
```

Authentication secrets do not belong in this table. Encrypted refresh credentials are a later M3 concern.

### `games`

Global normalized title catalog.

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

Provider identity is unique on:

```text
(np_communication_id, np_service_name)
```

This prevents PS4/PS5 service-name differences from being collapsed incorrectly.

### `account_games`

Relationship between a PSN account and a known game, including lightweight aggregate state used by library sync.

```text
id uuid primary key
psn_account_id uuid -> psn_accounts(id)
game_id uuid -> games(id)
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

The account/game pair is unique. Percentages are constrained to `0..100` and counters cannot be negative.

### `trophy_groups`

Normalized PlayStation trophy groups.

```text
id uuid primary key
game_id uuid -> games(id)
psn_group_id text
name text
icon_url text
kind text
created_at timestamptz
updated_at timestamptz
```

Allowed `kind` values:

```text
base
dlc
unknown
```

Initial mapping:

```text
PSN group "default" -> base
numbered/additional groups -> dlc
unexpected upstream state -> unknown
```

The database enforces at most one `base` group per game with a partial unique index. A base group must use PSN group id `default`.

### `trophies`

Normalized trophy metadata independent of the player.

```text
id uuid primary key
game_id uuid -> games(id)
trophy_group_id uuid -> trophy_groups(id)
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

Allowed trophy types:

```text
bronze
silver
gold
platinum
```

The definitive provider key is:

```text
unique (game_id, psn_trophy_id)
```

This is no longer provisional. The upstream `psn-api` Trophy model documents `trophyId` as unique within the title, not merely within a trophy group.

A composite foreign key also guarantees that `trophy_group_id` belongs to the same `game_id`; inconsistent cross-game rows cannot be persisted.

### `player_trophies`

Current state of one trophy for one PSN account.

```text
id uuid primary key
psn_account_id uuid -> psn_accounts(id)
trophy_id uuid -> trophies(id)
earned boolean
earned_at timestamptz
progress_value numeric
progress_target numeric
progress_percent numeric
first_seen_at timestamptz
last_seen_at timestamptz
updated_at timestamptz
```

Unique key:

```text
(psn_account_id, trophy_id)
```

This is the idempotency anchor for trophy synchronization. Sync code can use `INSERT ... ON CONFLICT ... DO UPDATE` repeatedly without multiplying state rows.

A database trigger protects the two most important monotonic facts:

- once `earned=true`, a later update cannot silently turn it back to `false`;
- an existing valid `earned_at` is not replaced by a later or missing timestamp;
- if a later sync provides an earlier valid timestamp, the earlier timestamp is accepted as the more precise historical fact.

### `sync_runs`

Audit record for synchronization attempts.

```text
id uuid primary key
psn_account_id uuid -> psn_accounts(id)
game_id uuid nullable -> games(id)
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

Allowed sync types:

```text
full
library
game
refresh
```

Allowed statuses:

```text
running
success
partial
failed
```

`game_id` is nullable because library/auth refresh runs are not necessarily tied to one game.

### `progress_events`

Append-oriented history for meaningful changes rather than full duplicate snapshots.

```text
id uuid primary key
psn_account_id uuid -> psn_accounts(id)
game_id uuid -> games(id)
trophy_id uuid nullable -> trophies(id)
event_type text
occurred_at timestamptz
detected_at timestamptz
sync_run_id uuid -> sync_runs(id)
```

Initial event types:

```text
game_discovered
trophy_earned
platinum_earned
```

`trophy_earned` and `platinum_earned` require a trophy reference; `game_discovered` does not.

Partial unique indexes prevent a repeated sync from creating the same discovery/earned event again.

`occurred_at` is when the upstream fact happened. `detected_at` is when TrophyBridge first observed it.

### `share_links`

Revocable read-only capability links.

```text
id uuid primary key
psn_account_id uuid -> psn_accounts(id)
token_hash text unique
label text
is_active boolean
created_at timestamptz
last_used_at timestamptz
revoked_at timestamptz
```

M1 stores only the persistence shape. Token generation and hashing are implemented in M7.

### `sync_targets`

Per-account/game synchronization coordination.

```text
psn_account_id uuid
game_id uuid
last_sync_at timestamptz
next_allowed_sync_at timestamptz
lock_until timestamptz
primary key (psn_account_id, game_id)
```

The pair is also a composite foreign key to `account_games`, so a synchronization lock cannot exist for a game the account does not know about.

## Index strategy

M1 adds explicit indexes for the first known access paths:

- account games by account and recency;
- games by lower-cased title for search;
- trophy groups by game;
- trophies by group and by game/type;
- player trophies by account/earned state and by trophy;
- sync runs by account/game and recency;
- progress events by account/game and detection time;
- active share links by account.

Indexes will be revisited against production query plans rather than guessed indefinitely.

## Row Level Security

Every application table in the exposed `public` schema has Row Level Security enabled in M1.

M1 deliberately creates **no browser/client policies**. Before TrophyBridge authentication exists, direct client access is denied by default. Server-side/service-role access remains the intended database writer. Owner-scoped policies are added with the authentication layer in M3.

## Core invariants

The database enforces or structurally supports the following rules:

1. Provider game identities are unique.
2. A player has at most one current row per trophy.
3. Repeated UPSERTs are idempotent.
4. Earned trophy state is monotonic.
5. Known earned timestamps cannot be replaced by less trustworthy later/missing values.
6. A game has at most one base trophy group.
7. Trophy IDs are unique within a title.
8. A trophy cannot point to a group belonging to another game.
9. DLC remains structurally separate from the base group used for platinum calculations.
10. Progress events are deduplicated across repeated syncs.
11. Percentages and counters remain inside valid ranges.
12. RLS is enabled on every public application table.

## Executable verification

The schema is tested against a real PostgreSQL service in GitHub Actions.

`tests/integration/domain_model.sql` verifies, among other things:

- idempotent player-trophy UPSERT behavior;
- monotonic `earned` state;
- timestamp preservation;
- one-base-group enforcement;
- title-wide trophy-id uniqueness;
- cross-game trophy-group protection;
- progress-event deduplication;
- base/DLC separation;
- RLS enablement.

The integration test uses an isolated disposable PostgreSQL database and never contacts PSN.
