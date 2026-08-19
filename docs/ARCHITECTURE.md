# TrophyBridge Architecture

## Purpose

TrophyBridge owns factual PlayStation trophy state. It answers what is true about a player's games and trophies; AI strategy is a separate consumer layer.

## High-level system

```text
                 GitHub OAuth
                      |
                      v
                Supabase Auth
                      |
                      v
             Authenticated user
                      |
                      v
               Private routes
                      |
              PSN auth lifecycle
                      |
                      v
PlayStation Network -> PsnApiProvider -> PsnProvider
                                      |
                                      v
                               TrophyBridge Core
                                      |
                                      v
                                 PostgreSQL
                                /          \
                          Private UI      Public API
                                             |
                                             v
                                           AI client
```

## Authentication boundary

M3 establishes two separate identities:

- TrophyBridge owner identity: Supabase Auth user ID.
- PlayStation identity: verified PSN `accountId` + Online ID.

The mapping is stored in `psn_accounts.owner_user_id`. A PSN account may not be silently linked to a different TrophyBridge owner, and v0.1 supports one PSN connection per owner.

GitHub OAuth and SSR cookies establish the TrophyBridge session. PSN uses a separate server-only token lifecycle.

## PSN credential boundary

NPSSO exists only during initial connection. The durable refresh token is AES-256-GCM encrypted in `psn_credentials`; access tokens exist only in runtime memory. Key versions allow rotation.

`PsnConnectionService` owns connection, refresh, reauthentication state, disconnect, and provider construction. Synchronization code must ask it for a `PsnApiProvider` rather than touching credential persistence.

## Provider boundary

`PsnApiProvider` normalizes external `psn-api` data before persistence. Provider-specific names do not leak into sync/database/public API layers.

The saved account locale is passed to the provider. The pilot/default locale is `it-IT`.

## Persistence boundary

Core factual tables:

```text
psn_accounts
games
account_games
trophy_groups
trophies
player_trophies
sync_runs
progress_events
share_links
sync_targets
psn_credentials
```

PostgreSQL protects uniqueness, relational integrity, one base trophy group per title, progress ranges, event deduplication, monotonic earned state, and the one-running-library-sync invariant.

M4 extends `account_games` with provider hidden state and provider last-update time. Its `persist_library_snapshot` function accepts only provider-normalized data and is executable only by the server role.

## RLS boundary

All public-schema application tables use RLS. Authenticated users may read only their own non-secret `psn_accounts` metadata. `psn_credentials` has no browser privileges or policies. Server mutations use the privileged server client.

The M4 persistence function is explicitly revoked from `public`, `anon`, and `authenticated` roles.

## M4 synchronization model

M4 performs the first real factual data synchronization:

```text
owner session
  -> LibrarySyncService
  -> PsnConnectionService.createProviderForOwner(ownerUserId)
  -> provider.getGames()
  -> bounded atomic library snapshot
  -> games + account_games + sync_runs
```

The library layer is deliberately lightweight. It imports title identity, title/platform/icon metadata, hidden state, aggregate progress/counts, and synchronization timestamps. Detailed group/trophy/player hydration remains M5.

A failed PSN refresh or library read must not delete factual data. A later provider response that omits a previously known title also does not delete it. Aggregate progress and trophy counters use monotonic persistence so a partial/regressive upstream response cannot silently erase known progress.

Only one library synchronization can run per account. Old abandoned running records can be marked failed before a new attempt starts.

## Zero-cost boundary

The v0.1 operating target is €0/month. This is enforced in code as well as service selection.

M4 defaults:

```text
manual sync only
successful sync cooldown: 3600 seconds
maximum titles accepted: 2000
stale run recovery: 600 seconds
recent dashboard rows: 12, bounded to 50
```

No cron/background library polling, binary image mirroring, or automatic retry loop is used. Normal dashboard/public reads must come from PostgreSQL rather than contact PSN.

If quota pressure occurs, TrophyBridge should throttle or stop optional synchronization and keep serving last-good state before any paid upgrade is considered. See `docs/COST_GUARDRAILS.md` and ADR 0011.

## Public API boundary

The future public API is read-only, versioned, revocable, and capability-token gated. It never has access to PSN or Supabase authentication material.

The future freshness path must remain bounded so a public client cannot create unbounded upstream or hosting usage.

## Current CI architecture

```text
Application quality
  frozen install -> lint -> typecheck -> Vitest -> production build

Database integrity
  PostgreSQL 17 -> auth bootstrap -> all migrations -> SQL invariant suites

Browser smoke
  Playwright Chromium
```

All CI PSN identities and credentials are fabricated. No workflow makes a live PSN request. The public repository uses standard GitHub-hosted runners only.

## Milestones

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication
- ✅ M4 Library Sync
- M5 Trophy Sync
- M6 Progress Events
- M7 Public Share
- M8 AI Context
- M9 Dashboard
- M10 Hardening

The first live owner PSN smoke is an operational validation step. It must be completed through the private dashboard before claiming real PSN data has been imported; it is not replaced by fixture-based CI.
