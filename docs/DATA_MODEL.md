# TrophyBridge Data Model

PostgreSQL/Supabase is the factual persistence layer. SQL migrations are the schema source of truth.

## Core ownership and identity

### `psn_accounts`

One normalized PlayStation identity connected to a TrophyBridge owner in v0.1.

Important fields include internal UUID, Supabase owner user ID, verified PSN Online ID, stable PSN account ID, auth status, preferred locale, and synchronization timestamps.

The browser may read only owner-safe account metadata. Credentials are separate.

### `psn_credentials`

Server-only encrypted durable PlayStation refresh credentials.

NPSSO and PSN access tokens are not persisted. Browser roles cannot read this table.

## Library model

### `games`

Provider title identity and mutable descriptive metadata.

Stable identity:

```text
(np_communication_id, np_service_name)
```

`np_service_name` preserves PS5 `trophy2` versus legacy `trophy` behavior.

### `account_games`

Relationship between a PSN account and a known title. Stores lightweight aggregate library state such as progress percentage, earned/defined trophy counters, hidden state, provider last-update timestamp, and local seen/sync timestamps.

M4 snapshots are conservative: missing titles in a later provider response are not deleted and known aggregate counters do not regress.

## Detailed trophy model

### `trophy_groups`

One row per PSN trophy group for a game.

Stable identity:

```text
(game_id, psn_group_id)
```

Kinds:

```text
base
dlc
unknown
```

The PSN group `default` is the one structural base group. Numbered groups such as `001` are additional groups. The internal name `dlc` is a normalized group category and must not be interpreted as proof that content was separately purchased.

Database constraints allow at most one base group per game and require a base group to use `default`.

### `trophies`

One normalized trophy definition per game/trophy ID.

Stable identity:

```text
(game_id, psn_trophy_id)
```

Stores group link, localized name/description when available, bronze/silver/gold/platinum type, hidden flag, icon URL, rarity classification, and earned-rate metadata supplied by PlayStation Network.

M5 upserts preserve already-known localized fields when a later provider payload supplies null rather than deleting factual metadata.

### `player_trophies`

Account-specific state for a normalized trophy.

Stores earned state, earned timestamp, numeric progress values when actually available from PSN, and observation timestamps.

Earned state is monotonic. Once a trophy is recorded as earned, a later partial/inconsistent upstream response cannot unearn it. The earliest trustworthy earned timestamp is preserved.

## Synchronization model

### `sync_runs`

Audit/status records for bounded synchronization work.

Current sync types used by the application:

```text
library
game
```

M4 enforces one running library sync per account. M5 adds one running game sync per `(psn_account_id, game_id)` target.

M6 uses the existing `new_trophies_found` column as the number of newly earned trophies detected during a successful game sync. This is a trophy count, not a raw `progress_events` row count, because a platinum transition may create two event rows while still representing one newly earned trophy.

Successful/failed runs record bounded summary/error metadata rather than raw provider exceptions.

### `sync_targets`

Per-account/per-game synchronization timing state. M5 stores `last_sync_at` and `next_allowed_sync_at` after a successful deep trophy snapshot. This table is also the intended coordination point for later public freshness/single-flight behavior.

## M4 atomic library persistence

`persist_library_snapshot(...)` is server-role-only.

It validates bounded normalized game input and atomically upserts `games` + `account_games` while preserving last-good/monotonic library state.

Default application/SQL ceiling:

```text
2000 titles per library sync
```

## M5 atomic game-trophy persistence

`persist_game_trophy_snapshot(...)` is server-role-only.

Arguments are the account UUID, selected game UUID, normalized group/title/user-trophy JSON arrays, observation timestamp, and next-allowed timestamp.

The function refuses persistence unless:

- the selected game already belongs to the account through `account_games`;
- inputs are JSON arrays;
- groups are at most 100 and trophy/user rows at most 1,000;
- group IDs are unique;
- title trophy IDs are unique;
- user trophy IDs are unique;
- there is exactly one `default` base group and no other base group;
- total group-defined trophy count equals the title trophy count;
- title trophy count equals user-trophy count;
- each title trophy references a returned group;
- every user trophy has a matching title trophy ID/type.

The TypeScript service additionally validates each group's actual bronze/silver/gold/platinum distribution against `definedTrophies`, so a truncated provider response is rejected before the SQL function is called.

On success the transaction upserts:

```text
trophy_groups
trophies
player_trophies
sync_targets
psn_accounts.last_successful_sync_at
```

No deep snapshot deletes existing trophy rows. Failed/incomplete PSN responses therefore leave last-good state intact.

## M6 event-aware game persistence

`persist_game_trophy_snapshot_with_events(...)` is an additive server-only wrapper around the M5 persistence function.

Additional argument:

```text
p_sync_run_id
```

The wrapper first requires that this ID is the currently `running` `game` sync for the same PSN account and game. Before delegating to M5 persistence, it captures incoming trophies that satisfy both conditions:

```text
existing durable player_trophies.earned = false
incoming validated PSN state.earned = true
```

Because no `player_trophies` row exists before a game's first deep sync, that initial import automatically becomes the baseline and produces no historical trophy events.

After the M5 snapshot succeeds inside the same PostgreSQL transaction, M6 inserts:

```text
trophy_earned
platinum_earned   # only in addition to trophy_earned for a newly earned platinum
```

The wrapper returns all M5 summary counts plus:

```text
new_trophies_found
```

A failure anywhere in the wrapper rolls back both the delegated factual snapshot and event creation.

## Progress-event model

### `progress_events`

Durable observed activity tied to the sync run that detected it.

Important fields:

```text
psn_account_id
game_id
trophy_id
event_type
occurred_at
detected_at
sync_run_id
```

M6 currently emits:

```text
trophy_earned
platinum_earned
```

`occurred_at` uses PSN's earned timestamp when available and otherwise falls back to the sync timestamp. `detected_at` is the sync timestamp.

Uniqueness rules inherited from M1 ensure one `trophy_earned` and one `platinum_earned` event at most for a given account/trophy. Replaying an identical earned snapshot therefore creates no duplicate history.

The schema still permits `game_discovered`; M6 does not backfill 196 historical library discoveries because fabricated historical chronology is deliberately avoided.

## Sharing model

### `share_links`

Schema-ready capability links for future public read-only access. M7 activates issuance/revocation and public routes.

## RLS and privilege boundary

Domain tables have RLS enabled. Most factual tables remain deny-by-default to browser roles and are accessed by server-side trusted repositories until the public API introduces explicit allowlisted server reads.

Privileged persistence functions are revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.

M6 integration tests verify the event-aware wrapper is not executable by `authenticated` and is executable by `service_role`.

## Production checkpoint, 2026-08-19

After the live M5 Final Fantasy XVI baseline smoke and before M6 event detection is exercised on a newly earned trophy:

```text
games: 196
account_games: 196
FINAL FANTASY XVI trophy_groups: 3
FINAL FANTASY XVI trophies: 69
FINAL FANTASY XVI player_trophies: 69
FINAL FANTASY XVI earned player_trophies: 17
progress_events: 0
successful game sync runs: 1
```

The empty event table at this checkpoint is intentional. M6 starts observing new activity from the existing M5 durable baseline rather than inventing history for the 17 trophies that were already earned.
