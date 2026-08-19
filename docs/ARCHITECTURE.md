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
        +------------------+
        |                  |
        v                  v
 Authentication       Sync services
        |             /           \
        v            v             v
 encrypted       M4 library     M5 one-game
 credential       snapshot       trophy snapshot
                         \         /
                          v       v
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

## M5 lazy trophy path

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
  -> persist_game_trophy_snapshot()
  -> trophy_groups + trophies + player_trophies
  -> game sync run + sync target
  -> private game detail
```

M5 never deep-hydrates the entire library. The owner explicitly chooses the title whose trophies should be refreshed.

## Snapshot validation strategy

TrophyBridge treats an upstream deep response as one factual snapshot, not three independent writes. Before any persistence, the service verifies identities, group membership, exact trophy-type counts per group, and a one-to-one title/user trophy set.

This is important because a successful HTTP response can still be incomplete. A partial trophy payload must not overwrite last-good factual state.

The PostgreSQL function repeats structural/size/identity checks as defense in depth and performs the write atomically.

## Base versus additional groups

PSN `groupId=default` is the structural base-game group. M5 requires exactly one such base group.

Numbered groups are normalized as additional (`dlc` internally for the current provider mapper). Platinum status is calculated only from base-group trophies. Additional-group completion is tracked separately.

## Monotonic state

Persistence favors factual safety over mirroring transient upstream regressions:

- earned trophies never revert to unearned;
- earliest known earned timestamp is retained;
- known localized trophy metadata is not erased by later null values;
- failed or rejected snapshots do not delete last-good trophy rows;
- M4 aggregate library state also does not regress.

M6 will build event detection on top of these durable transitions.

## Private dashboard

The dashboard is intentionally lean.

- M4 list: recent library titles, aggregate PSN progress, manual library sync.
- M5 game page: manual deep sync, base/additional progress summary, trophy list and earned state.

Opening dashboard pages reads PostgreSQL only. It does not automatically contact PSN.

## Public API boundary

M7/M8 will expose capability-token read-only routes. Public clients will never receive authentication material or direct access to server-side persistence functions.

Normal public reads will use durable PostgreSQL state. Any future `fresh=1` behavior must reuse bounded per-game synchronization and single-flight/cooldown state rather than permit arbitrary PSN fan-out.

Unearned hidden trophy metadata must be masked at the future public serialization boundary unless explicit policy allows spoilers.

## Zero-cost architecture

The v0.1 deployment requirement is €0/month.

Current hosted plan:

```text
Supabase Free
public GitHub + standard GitHub Actions
Vercel Hobby planned
```

M4 and M5 enforce this in application behavior:

```text
library: manual, >=3600s cooldown, <=2000 titles, 1 running/account
game trophies: manual, >=300s cooldown, <=100 groups, <=1000 trophies, 1 running/account+game
```

No cron, full-library trophy crawl, automatic retry loop, mirrored PSN artwork, Redis, VPS, or paid worker is part of the current architecture.

## Failure behavior

Provider failure or invalid snapshot:

```text
record safe failed sync metadata
keep last-good factual rows
return normalized error
allow later manual retry after applicable guards
```

Only the absence of any prior factual state can leave a game without detailed trophy rows. Opening the game page still succeeds and invites the owner to perform the first explicit M5 sync.

## Milestone boundary

M5 ends with durable one-game trophy metadata/player state and base/additional separation.

M6 adds newly-earned event detection. It should compare durable pre/post state without weakening M5 monotonicity or turning the sync path into background polling.
