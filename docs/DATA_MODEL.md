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

Stores group link, localized name/description when available, bronze/silver/gold/platinum type, hidden flag, icon URL, rarity classification, and earned-rate metadata.

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

The function returns separate counts for:

```text
processed trophies
earned trophies
base trophies / base earned
additional trophies / additional earned
```

This separation is the factual foundation for platinum progress that excludes additional groups.

## Progress-event model

### `progress_events`

The schema exists from M1 but M5 deliberately does not populate it. M6 will compare persisted player state and create deduplicated events for newly earned trophies.

## Sharing model

### `share_links`

Schema-ready capability links for future public read-only access. M7 will activate issuance/revocation and public routes.

## RLS and privilege boundary

Domain tables have RLS enabled. Most factual tables remain deny-by-default to browser roles and are accessed by server-side trusted repositories until the public API introduces explicit allowlisted server reads.

Privileged persistence functions are revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.

Production post-M5 verification confirms `authenticated` cannot execute `persist_game_trophy_snapshot` while `service_role` can.

## Production checkpoint, 2026-08-19

Before the first live M5 deep-trophy smoke:

```text
games: 196
account_games: 196
trophy_groups: 0
trophies: 0
player_trophies: 0
```

This is intentional: M4 imported only lightweight library state, and M5 remains lazy per selected game.
