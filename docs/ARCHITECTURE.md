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

The saved account locale is passed to the provider. M3's pilot/default locale is `it-IT`.

## Persistence boundary

M1 factual tables:

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
```

M3 adds:

```text
psn_credentials
psn_accounts.preferred_locale
```

PostgreSQL protects uniqueness, relational integrity, one base trophy group per title, progress ranges, event deduplication, and monotonic earned state. Credential rows are one-to-one with PSN accounts.

## RLS boundary

All public-schema application tables use RLS. M3 introduces the first browser-readable owner policy: authenticated users may read only their own non-secret `psn_accounts` metadata. `psn_credentials` has no browser privileges or policies. Server mutations use the service-role client.

## Synchronization model

M4 begins the first real data synchronization. It will obtain a ready provider through `PsnConnectionService.createProviderForOwner()` and perform lightweight library synchronization. M5 later hydrates one game's groups/trophies/player state lazily.

A failed PSN refresh must not delete factual trophy data. Authentication status and trophy state are separate concerns.

## Public API boundary

The future public API is read-only, versioned, revocable, and capability-token gated. It never has access to PSN or Supabase authentication material.

## Current CI architecture

```text
Application quality
  frozen install -> lint -> typecheck -> Vitest -> production build

Database integrity
  PostgreSQL 17 -> auth bootstrap -> all migrations -> SQL invariant suites

Browser smoke
  Playwright Chromium
```

All CI PSN identities and credentials are fabricated. No workflow makes a live PSN request.

## Milestones

- ✅ M0 Foundation
- ✅ M1 Domain Model
- ✅ M2 PSN Provider
- ✅ M3 Authentication implementation
- M4 Library Sync
- M5 Trophy Sync
- M6 Progress Events
- M7 Public Share
- M8 AI Context
- M9 Dashboard
- M10 Hardening

Production activation of M3 is an external deployment step, not a substitute for the tested authentication implementation: a real Supabase project must be configured and the owner must complete PSN connection through the private dashboard.
