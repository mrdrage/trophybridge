# PSN Integration

## Purpose

TrophyBridge treats PlayStation Network as an external provider behind a narrow adapter. Application code depends on the internal `PsnProvider` contract, not directly on a community library or raw PSN payloads.

## Implemented provider boundary

The v0.1 domain contract exposes five operations:

- `getAccount()`
- `getGames()`
- `getTrophyGroups(game)`
- `getTrophies(game)`
- `getUserTrophies(game)`

M2 contains two implementations:

- `MockPsnProvider`: deterministic domain fixtures for application tests.
- `PsnApiProvider`: real adapter over the pinned `psn-api` package.

`psn-api` is pinned to version `2.18.1` so TrophyBridge is tested against a known provider contract. Future upgrades should be deliberate and validated through the M2 fixture suite.

## Construction and authentication boundary

`PsnApiProvider` receives an access authorization payload and stable account identity through its constructor. It does not own durable authentication.

```text
M3 authentication lifecycle
       |
       v
AuthorizationPayload + PsnAccount
       |
       v
PsnApiProvider
       |
       v
normalized TrophyBridge domain data
```

This keeps M2 focused on transport, pagination, validation and mapping. NPSSO exchange, refresh-token storage, encryption and reauthentication remain M3 responsibilities.

The planned credential lifecycle remains:

```text
NPSSO bootstrap
    |
    v
PlayStation access + refresh tokens
    |
    v
encrypted server-side credential storage
```

Rules:

1. NPSSO is password-equivalent and is never persisted by TrophyBridge.
2. Refresh credentials are server-only and encrypted at rest before persistence.
3. Tokens, authorization headers, and raw credential payloads are never logged.
4. `PsnApiProvider` receives only the authorization it needs for the current call lifecycle.
5. `getAccount()` returns the already resolved stable account identity rather than performing a redundant profile lookup on every provider use.

## Library sync source

`getGames()` uses `getUserTitles()` and maps each PSN title into a `PsnGame` containing:

- `npCommunicationId` as `communicationId`;
- `npServiceName` as `trophy` or `trophy2`;
- title and icon;
- normalized platform list;
- overall PSN progress percentage;
- defined trophy counts;
- earned trophy counts;
- last-updated timestamp;
- hidden-title flag.

The provider paginates until `nextOffset` disappears. It protects against a repeated offset so malformed upstream pagination cannot create an infinite loop.

The `getUserTitles()` endpoint supports large pages; TrophyBridge currently defaults to 200 titles per page and caps configured values at 800.

## PS5 versus legacy service names

The service name is part of the game identity and is never inferred from the title string.

```text
PS5                    -> trophy2
PS3 / PS4 / PS Vita    -> trophy
```

Every detailed trophy call receives the service name stored on `PsnGameRef`. This prevents a PS5 title from accidentally being queried through the legacy trophy service.

## Trophy groups

`getTrophyGroups()` uses `getTitleTrophyGroups()` and normalizes groups as:

```text
default   -> base
001       -> dlc
002       -> dlc
...
anything unexpected -> unknown
```

Only exactly three numeric digits are classified as DLC. Unexpected future provider values remain `unknown` until explicitly understood.

The database still enforces at most one `base` group per game.

## Trophy metadata

`getTrophies()` calls `getTitleTrophies()` with group `all` and paginates through every returned trophy.

Normalized metadata includes:

- title-wide trophy ID;
- trophy group ID;
- bronze/silver/gold/platinum type;
- name and description;
- hidden flag;
- icon URL.

`psn-api` documents `trophyId` as unique within the title, matching the M1 `(game_id, psn_trophy_id)` database identity.

## User trophy state

`getUserTrophies()` calls `getUserTrophiesEarnedForTitle()` with group `all` and maps:

- earned state;
- earned timestamp;
- trophy type and hidden flag for consistency checks;
- rarity;
- earned-rate percentage;
- progress target when supplied by PS5.

### Numeric progress limitation

The pinned `psn-api` `UserThinTrophy` contract exposes `trophyProgressTargetValue` for PS5 trophies that track progress, but does not expose the player's current numeric progress value.

TrophyBridge therefore follows a strict no-invention rule:

```text
progressTarget -> mapped when provided
progressValue  -> null unless a future verified provider supplies it
earned trophy progressPercent -> 100
unearned trophy progressPercent -> null
```

We do not derive a fake current value from the target. If a future provider version exposes a verified current progress field, this contract can be extended through a reviewed migration/ADR.

## Locale

All supported trophy calls propagate an `Accept-Language` header. `PsnApiProvider` accepts a configurable locale and defaults to `en-US` until M3/profile preferences provide a user-specific value.

This lets TrophyBridge later request Italian names/descriptions without coupling localization to the database schema.

## Runtime validation

Raw `psn-api` payloads are treated as untrusted external data even though the package ships TypeScript definitions.

The mapping boundary uses Zod/runtime checks for fields TrophyBridge relies on. Malformed payloads become `PsnProviderError` with code `INVALID_RESPONSE` instead of leaking partially normalized objects into persistence.

## Error normalization

Provider consumers do not depend on raw `psn-api` error strings. M2 normalizes failures into stable codes:

```text
AUTH_REQUIRED
FORBIDDEN
NOT_FOUND
RATE_LIMITED
INVALID_RESPONSE
UPSTREAM_UNAVAILABLE
```

Each provider error also carries a `retryable` flag. Later synchronization code can use this to distinguish reauthentication from temporary upstream failures without parsing strings.

## Automated testing

Continuous integration never calls PlayStation Network.

M2 stores fabricated/sanitized payloads under:

```text
tests/fixtures/psn/
```

The fixture suite verifies:

- multi-page title pagination;
- multi-page trophy pagination;
- PS5 `trophy2` and legacy `trophy` propagation;
- shared-platform normalization;
- base/DLC/unknown group classification;
- rarity and earned-rate mapping;
- conservative progress semantics;
- configurable locale headers;
- malformed-payload rejection;
- stable error normalization.

Real PSN smoke tests require user-provided authentication and therefore belong to the explicit M3 connection flow, never CI.

## Provider replacement

If `psn-api` changes or stops working, the intended migration path is to replace or update `PsnApiProvider` while preserving the domain contract, persistence layer, public API and UI.

This boundary is a core architectural constraint, not merely an implementation convenience.
