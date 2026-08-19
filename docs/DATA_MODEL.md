# TrophyBridge Data Model

PostgreSQL is the factual source of truth for TrophyBridge. Executable schema changes live in `supabase/migrations/`; documentation describes the invariants but does not replace migrations/tests.

## Relationship map

```text
auth.users
   |
   v
psn_accounts ---- psn_credentials
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

## `psn_accounts`

One connected PlayStation identity per TrophyBridge owner in v0.1.

Important fields:

```text
id
owner_user_id -> auth.users
psn_online_id
psn_account_id unique
auth_status
preferred_locale
last_successful_sync_at
created_at
updated_at
```

Allowed auth states are `connected`, `refreshing`, `reauth_required`, and `error`.

## `psn_credentials`

Server-only one-to-one durable PSN authorization record.

```text
psn_account_id -> psn_accounts
encrypted_refresh_token
encryption_iv
encryption_auth_tag
key_version
refresh_token_expires_at
last_refreshed_at
```

NPSSO and access tokens are not stored here or elsewhere.

## `games`

Global normalized title catalog.

```text
id
np_communication_id
np_service_name
title_name
platforms[]
icon_url
created_at
updated_at
```

Provider identity is unique on `(np_communication_id, np_service_name)`.

## `account_games`

Per-account lightweight game/library state.

```text
id
psn_account_id -> psn_accounts
game_id -> games
progress_percent
earned_bronze / silver / gold / platinum
total_bronze / silver / gold / platinum
is_hidden
psn_last_updated_at
first_seen_at
last_seen_at
last_synced_at
```

The account/game pair is unique. Percentages are constrained to `0..100` and counters cannot be negative.

M4 persists aggregate progress/counts monotonically. Later snapshots may update mutable title metadata and hidden state, but cannot reduce known aggregate progress/counts or move `psn_last_updated_at` backwards. A game omitted by a later library response is not deleted.

## `trophy_groups`

Normalized PlayStation trophy groups. `default` maps to `base`; additional numbered groups map to `dlc`; unexpected values remain `unknown`. The database permits at most one base group per game.

## `trophies`

Normalized title-level trophy metadata. Trophy identity is unique on `(game_id, psn_trophy_id)` and a composite foreign key guarantees its group belongs to the same game.

## `player_trophies`

Per-account current trophy state. Unique on `(psn_account_id, trophy_id)`. A trigger prevents earned state from regressing and preserves the earliest trustworthy earned timestamp.

## `sync_runs`

Audit record for synchronization attempts.

```text
id
psn_account_id
game_id nullable
sync_type: full | library | game | refresh
status: running | success | partial | failed
started_at
finished_at
games_processed
trophies_processed
new_trophies_found
error_code
error_message
```

M4 adds a partial unique index allowing at most one `running` `library` sync per PSN account.

## `progress_events`

Deduplicated meaningful progress history (`game_discovered`, `trophy_earned`, `platinum_earned`). M6 will implement event generation.

## `share_links`

Persistence shape for future revocable capability links. M7 implements generation and public use.

## `sync_targets`

Per-account/game future freshness/cooldown coordination. The composite key must reference an existing `account_games` pair.

## M4 library persistence function

`public.persist_library_snapshot(psn_account_id, games_json, seen_at)` is the atomic persistence boundary for a normalized library snapshot.

It:

- accepts a JSON array only;
- rejects more than 2,000 titles;
- verifies the account exists;
- deduplicates provider game identity;
- upserts `games` and `account_games` in one transaction;
- returns processed/discovered counts;
- updates `last_successful_sync_at`;
- never deletes omitted titles;
- prevents aggregate regression.

Execution is revoked from `public`, `anon`, and `authenticated`, and granted only to the server role.

## Row Level Security

All exposed application tables have RLS enabled. Authenticated browser users may read only their own non-secret `psn_accounts` metadata. Credential ciphertext and synchronization persistence remain server-only.

## Core invariants

1. Provider game identity is unique.
2. One TrophyBridge owner has at most one PSN connection in v0.1.
3. Encrypted credentials are one-to-one with PSN accounts and browser-inaccessible.
4. Player earned state is monotonic.
5. Known earned timestamps cannot be replaced by less trustworthy later/missing values.
6. A game has at most one base trophy group.
7. Trophy IDs are unique within a title.
8. Trophy/group cross-game inconsistencies are rejected.
9. Progress events are deduplicated.
10. Percentages and counters remain valid.
11. Only one library sync may be running per account.
12. Library snapshots are bounded and do not delete last-good titles.
13. Aggregate library progress/counts do not regress.

## Executable verification

GitHub Actions applies every migration to disposable PostgreSQL 17 and executes `tests/integration/domain_*.sql`.

M4 integration coverage verifies first import, idempotent later snapshots, no deletion on omission, no aggregate regression, one-running-sync enforcement, the 2,000-title SQL ceiling, and denial of the privileged persistence function to authenticated browser roles.
