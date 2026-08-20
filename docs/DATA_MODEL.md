# TrophyBridge Data Model

PostgreSQL/Supabase is the factual persistence layer. SQL migrations are the schema source of truth.

## Identity and credentials

`psn_accounts` stores the verified target PlayStation identity, owner relation, auth state, preferred locale and synchronization timestamps.

`psn_credentials` stores only encrypted durable PSN refresh credential material plus encryption metadata and provider-reported expiry. NPSSO and PSN access tokens are never persisted. Browser roles cannot read this table.

## Library model

`games` stores normalized provider title identity `(np_communication_id, np_service_name)` and descriptive metadata.

`account_games` relates an account to known titles and stores lightweight aggregate progress/counters, hidden state, provider update timestamp and local sync timestamps. M4 snapshots do not delete omitted titles or regress known counters.

The first real library import contains 196 titles.

## Trophy model

`trophy_groups` stores one normalized group per game. PSN `default` is the structural base group; numbered groups are persisted as additional (`dlc` enum today) without asserting purchase semantics.

`trophies` stores game-scoped trophy IDs, localized text, type, hidden flag, image URL, rarity and PlayStation earned-rate metadata.

`player_trophies` stores account-specific earned state/timestamp and honest progress fields when PSN exposes them. Earned state is monotonic and earliest known earned time is preserved.

The real Final Fantasy XVI checkpoint after M6 contains 3 groups, 69 trophies, 69 player rows and 18 earned states.

## Synchronization model

`sync_runs` audits bounded library/game work. M6 uses `new_trophies_found` for newly observed earned transitions.

`sync_targets` coordinates per-account/per-game timing. M5/M6 use it with a 300-second default cooldown and one-running-sync protection.

`progress_events` stores meaningful deduplicated activity. The first deep sync is a baseline. Later normal earned transitions create `trophy_earned`; a newly earned platinum also creates `platinum_earned`.

The first real M6 post-baseline event is the FF16 bronze trophy `Fiamme gemelle`.

## M7 sharing model

`share_links` becomes active product state in M7.

Important fields:

```text
id
psn_account_id
token_hash
label
is_active
created_at
last_used_at
revoked_at
```

The plaintext capability token is **never** stored. Application code generates 256 random bits, formats the bearer token as `tb1_...`, hashes the complete token with SHA-256, and persists only the 64-character hexadecimal hash.

M7 adds a partial unique index so each PSN account can have at most one active capability:

```text
share_links_one_active_per_account_idx
WHERE is_active = true
```

The revocation-state constraint requires active rows to have `revoked_at IS NULL` and inactive rows to have a revocation timestamp.

Server-only RPCs:

```text
rotate_account_share_link(...)
revoke_account_share_link(...)
```

Rotation atomically revokes the previous active row and inserts the new token hash. Revocation changes only sharing state; factual account/game/trophy data remains untouched.

The functions are executable by `service_role` only. `anon` and `authenticated` cannot invoke them.

`last_used_at` is non-factual access metadata. Public reads may update it best-effort at a coarse interval; a telemetry write failure must not make a valid share read fail.

## Public serialization model

The database is not exposed directly. The M7 server reads durable state and creates allowlisted DTOs.

Public data includes online ID, visible library game state, game/group summary and trophy facts. It excludes stable PSN numeric account IDs, TrophyBridge credential material and hidden library titles.

For `hidden=true && earned=false`, trophy name, description and icon are masked at serialization time. The stored private factual row is not modified.

## Persistence functions

`persist_library_snapshot(...)` is the server-only M4 atomic lightweight library writer.

`persist_game_trophy_snapshot(...)` is the M5 bounded atomic trophy writer.

`persist_game_trophy_snapshot_with_events(...)` is the M6 wrapper that detects transitions and delegates the factual snapshot write within the same transaction.

M7 adds only share-management functions and does not modify factual trophy persistence.

## RLS and privilege boundary

Domain tables have RLS enabled. Sensitive and factual tables remain deny-by-default to browser roles unless an explicit owner-safe policy exists. Public sharing does not create an anonymous RLS policy; the Next.js server resolves the capability and performs an allowlisted read through the trusted server client.

## Production checkpoint after M7 migration

```text
games: 196
account_games: 196
Final Fantasy XVI groups/trophies/player rows/earned: 3 / 69 / 69 / 18
progress_events: 1
share_links immediately after migration: 0
active share links immediately after migration: 0
rotate/revoke RPC: service_role yes, authenticated no
```

M7 migration therefore adds sharing capability without manufacturing a public token or altering trophy state.
