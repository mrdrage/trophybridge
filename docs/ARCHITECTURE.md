# TrophyBridge Architecture

## System intent

TrophyBridge separates PlayStation-facing integration, factual persistence, private owner controls, and future public AI consumption so that unstable/community-documented PSN behavior does not leak through the product contract.

```text
PlayStation Network
        |
        v
    psn-api 2.18.1
        |
        v
   PsnApiProvider
        |
        v
     PsnProvider
        |
        +------------------------+
        |                        |
        v                        v
 Authentication             Sync services
        |                  /             \
        v                 v               v
 encrypted            M4 library      M5/M6 one-game
 credential            snapshot       trophy + events
                              \          /
                               v        v
                              PostgreSQL
                              /        \
                             v          v
                     Private dashboard  Future public API
                                              |
                                              v
                                              AI
```

## Trust boundaries

### Owner authentication

GitHub OAuth through Supabase Auth identifies the TrophyBridge owner. This identity is distinct from the connected PlayStation identity.

### PlayStation authentication

NPSSO is accepted only in a private server path as bootstrap material. It is exchanged for PlayStation tokens and discarded.

The initial connection resolves the claimed Online ID. Exact Universal Search is preferred; when Sony omits a valid owner profile, `getProfileFromUserName` may supply the stable account ID. The final authority is always `getProfileFromAccountId` using the same authenticated PlayStation token, requiring `isMe=true` and the exact Online ID.

Only an encrypted refresh token is durable. Access tokens are runtime-only.

### Synchronization authorization boundary

All current PSN sync operations obtain a provider through:

```text
PsnConnectionService.createProviderForOwner(ownerUserId)
```

Library/trophy services must not decrypt refresh credentials themselves.

## Provider boundary

Application code consumes the internal `PsnProvider` contract:

```text
getAccount()
getGames()
getTrophyGroups(game)
getTrophies(game)
getUserTrophies(game)
```

`PsnApiProvider` hides raw `psn-api` payload shapes, pagination, platform normalization, service-name propagation, locale headers, and stable provider errors.

`PSN_TROPHY_LOCALE=it-IT` is persisted/configured for the pilot so metadata requests align with the language used in-game when PSN provides that localization.

## M4 lightweight library path

```text
owner action
  -> POST /api/private/v1/library/sync
  -> LibrarySyncService
  -> authenticated PsnProvider
  -> getGames()
  -> bounded validation
  -> persist_library_snapshot()
  -> games + account_games + sync_runs
```

M4 deliberately avoids trophy details. This makes the initial 196-title real library import cheap and bounded.

The dashboard overview sorts by provider `psn_last_updated_at` first. Local `last_seen_at` is only a secondary ordering key because all titles in an initial full import can share the same local timestamp.

## M5/M6 lazy trophy path

```text
owner selects one account_game
  -> POST /api/private/v1/games/{gameId}/sync
  -> TrophySyncService
  -> verify game belongs to account
  -> per-game cooldown/concurrency gate
  -> authenticated PsnProvider
  -> getTrophyGroups(game)
  -> getTrophies(game)
  -> getUserTrophies(game)
  -> complete-snapshot validation
  -> persist_game_trophy_snapshot_with_events()
       -> capture durable false -> true transitions
       -> delegate to M5 persist_game_trophy_snapshot()
       -> insert progress_events
  -> finish sync_run with new_trophies_found
  -> private game detail + recent activity
```

The path remains explicitly one-game-at-a-time. TrophyBridge never turns the M4 library import into full-library trophy hydration.

## Snapshot validation strategy

TrophyBridge treats an upstream deep response as one factual snapshot, not three independent writes. Before any persistence, the service verifies identities, group membership, exact trophy-type counts per group, and a one-to-one title/user trophy set.

This is important because a successful HTTP response can still be incomplete. A partial trophy payload must not overwrite last-good factual state.

The M5 PostgreSQL function repeats structural/size/identity checks as defense in depth and performs the factual write atomically. M6 wraps that function rather than replacing its validation contract.

## M6 progress-event boundary

M6 deliberately distinguishes factual state from observed history.

The **first** successful deep synchronization of a game establishes a baseline. Existing earned trophies are persisted as factual state but do not generate events.

On later complete snapshots, the event-aware PostgreSQL wrapper captures only rows that previously existed as `earned=false` and now arrive as `earned=true`. Because that capture and the M5 factual write run inside the same PostgreSQL function call, either both factual state and events commit or neither does.

Event rules:

```text
false -> true normal trophy  => trophy_earned
false -> true platinum       => trophy_earned + platinum_earned
same earned state replay     => no event
first deep snapshot          => no historical event flood
```

`occurred_at` uses PSN's earned timestamp when supplied; `detected_at` is the synchronization time. Each event is bound to the active account/game `sync_run_id`. Existing unique indexes guarantee final deduplication.

`sync_runs.new_trophies_found` counts newly earned trophies, not raw event rows, so a platinum transition still counts as one newly earned trophy even though two event records are written.

See ADR 0013.

## Base versus additional groups

PSN `groupId=default` is the structural base-game group. M5 requires exactly one such base group.

Numbered groups are normalized as additional (`dlc` internally for the current provider mapper). Platinum status is calculated only from base-group trophies. Additional-group completion is tracked separately.

## Monotonic state

Persistence favors factual safety over mirroring transient upstream regressions:

- earned trophies never revert to unearned;
- earliest known earned timestamp is retained;
- known localized trophy metadata is not erased by later null values;
- failed or rejected snapshots do not delete last-good trophy rows;
- M4 aggregate library state also does not regress;
- M6 events are created only from a durable unearned baseline, never from guessed chronology.

## Private dashboard

The dashboard is intentionally lean.

- M4 list: recent library titles, aggregate PSN progress, manual library sync.
- M5/M6 game page: manual deep sync, base/additional progress summary, recent detected activity, trophy list and earned state.

Opening dashboard pages reads PostgreSQL only. It does not automatically contact PSN. Recent progress-event reads are bounded to 20 rows per game page.

## Public API boundary

M7/M8 will expose capability-token read-only routes. Public clients will never receive authentication material or direct access to server-side persistence functions.

Normal public reads will use durable PostgreSQL state. Any future `fresh=1` behavior must reuse bounded per-game synchronization and single-flight/cooldown state rather than permit arbitrary PSN fan-out.

M8 can consume M6 `progress_events` as trustworthy recent activity. Unearned hidden trophy metadata must be masked at the future public serialization boundary unless explicit policy allows spoilers.

## Zero-cost architecture

The v0.1 deployment requirement is €0/month.

Current hosted plan:

```text
Supabase Free
public GitHub + standard GitHub Actions
Vercel Hobby planned
```

Current application guardrails:

```text
library: manual, >=3600s cooldown, <=2000 titles, 1 running/account
game trophies/events: manual, >=300s cooldown, <=100 groups, <=1000 trophies, 1 running/account+game
recent private events: <=20 rows/game page
```

M6 adds no queue, cron, worker, polling service, Redis, VPS, mirrored artwork, or paid dependency. Event detection piggybacks on the existing bounded game sync transaction.

## Failure behavior

Provider failure or invalid snapshot:

```text
record safe failed sync metadata
keep last-good factual rows
create no progress events
return normalized error
allow later manual retry after applicable guards
```

If the M6 wrapper itself fails, PostgreSQL rolls back both the delegated factual snapshot and any event inserts.

## Milestone boundary

M6 ends with durable baseline-aware `trophy_earned` / `platinum_earned` history, per-run `new_trophies_found`, and a bounded private recent-activity view.

M7 adds revocable public sharing. Public sharing must read the durable M4-M6 state rather than introduce another PSN synchronization path.
