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

`trophy_groups` stores one normalized group per game. PSN `default` is the structural base group; numbered groups are persisted as additional without asserting purchase semantics.

`trophies` stores game-scoped trophy IDs, localized text, type, hidden flag, image URL, rarity and PlayStation earned-rate metadata.

`player_trophies` stores account-specific earned state/timestamp and honest progress fields when PSN exposes them. Earned state is monotonic and earliest known earned time is preserved.

The real Final Fantasy XVI checkpoint after M6 contains 3 groups, 69 trophies, 69 player rows and 18 earned states.

## Synchronization model

`sync_runs` audits bounded library/game work. M6 uses `new_trophies_found` for newly observed earned transitions.

`sync_targets` coordinates per-account/per-game timing. M5-M8 reuse it with a 300-second default cooldown and one-running-sync protection.

`progress_events` stores meaningful deduplicated activity. The first deep sync is a baseline. Later normal earned transitions create `trophy_earned`; a newly earned platinum also creates `platinum_earned`.

The first real M6 post-baseline event is the FF16 bronze trophy `Fiamme gemelle`.

## Sharing and M8 refresh-budget model

`share_links` stores revocable capability state. Important fields through M8:

```text
id
psn_account_id
token_hash
label
is_active
created_at
last_used_at
revoked_at
ai_refresh_window_started_at
ai_refresh_count
ai_last_refresh_claimed_at
```

The plaintext capability token is **never** stored. Application code generates 256 random bits, formats the bearer token as `tb1_...`, hashes the complete token with SHA-256, and persists only the 64-character hexadecimal hash.

A partial unique index allows at most one active capability per PSN account. Rotation atomically revokes the previous row and inserts the new token hash. Explicit revocation changes only sharing state and leaves factual trophy history intact.

`last_used_at` is best-effort coarse access telemetry.

The three M8 `ai_refresh_*` fields are operational quota metadata, not trophy facts. They implement a bounded one-hour share-level freshness budget. The application default is 12 stale refresh claims/hour/share.

Server-only RPCs through M8:

```text
rotate_account_share_link(...)
revoke_account_share_link(...)
claim_share_ai_refresh(...)
```

`claim_share_ai_refresh` locks the target share row, resets an expired window, increments an allowed claim atomically, or returns a retry delay when the window is exhausted. Inactive/revoked links cannot claim work.

All share mutation/budget functions are executable by `service_role` only. `anon` and `authenticated` cannot invoke them.

## Public serialization model

The database is never exposed directly. Next.js resolves an active capability with the trusted server client and creates allowlisted DTOs.

Public data can include online ID, visible library state, game/group summaries, trophy facts, M6 recent events and M8 freshness metadata. It excludes stable numeric PSN account IDs, TrophyBridge owner IDs, credential material, token hashes and hidden library titles.

For `hidden=true && earned=false`, trophy name, description and icon are masked at serialization time. The stored private factual row is not modified.

M8 `ai-context` is built from the same factual rows. Its `missing_trophies` block includes missing base-game trophies only and is bounded in size; it does not create a second persistence model.

## Persistence functions

`persist_library_snapshot(...)` is the server-only M4 atomic lightweight library writer.

`persist_game_trophy_snapshot(...)` is the M5 bounded atomic trophy writer.

`persist_game_trophy_snapshot_with_events(...)` is the M6 wrapper that detects transitions and delegates the factual snapshot write within the same transaction.

M7/M8 share functions modify only capability/operational quota metadata. M8 public freshness still writes trophy facts exclusively through the existing `TrophySyncService` and M6 persistence path.

## RLS and privilege boundary

Domain tables have RLS enabled. Sensitive and factual tables remain deny-by-default to browser roles unless an explicit owner-safe policy exists. Public sharing does not create an anonymous RLS policy.

## Production checkpoint after M8 migration

```text
games: 196
account_games: 196
Final Fantasy XVI groups/trophies/player rows/earned: 3 / 69 / 69 / 18
progress_events: 1
share_links: 1
active share_links: 1
active share ai_refresh_count immediately after migration: 0
claim refresh RPC: service_role yes, authenticated no
```

The M8 migration preserves factual trophy state and the existing active M7 capability while adding only bounded refresh-budget metadata.
