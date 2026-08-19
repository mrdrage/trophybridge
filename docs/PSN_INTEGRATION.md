# PSN Integration

## Purpose

TrophyBridge treats PlayStation Network as an external provider behind a narrow adapter. Application code must depend on the internal `PsnProvider` contract, not directly on a community library or raw PSN payloads.

## Provider boundary

The v0.1 domain contract exposes five operations:

- `getAccount()`
- `getGames()`
- `getTrophyGroups(game)`
- `getTrophies(game)`
- `getUserTrophies(game)`

`MockPsnProvider` is the deterministic implementation used by automated tests. A future `PsnApiProvider` will translate the community `psn-api` library into TrophyBridge domain types.

## Authentication model

The planned real provider flow is:

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

1. NPSSO is treated as a password-equivalent secret.
2. NPSSO is used only for bootstrap and is not persisted by TrophyBridge.
3. Refresh credentials are server-only and encrypted at rest before persistence.
4. Tokens, authorization headers, and raw credential payloads must never be logged.
5. Authentication state is represented explicitly as connected, refreshing, reauthentication required, or error.

## Synchronization strategy

TrophyBridge deliberately separates two synchronization operations.

### Library sync

Imports lightweight title-level information such as games, platforms, identifiers, and aggregate trophy progress. It does not eagerly import every trophy for every historical title.

### Game sync

Runs when detailed data for a title is required. It retrieves trophy groups, trophy metadata, and the player's earned state, then normalizes them before persistence.

This lazy strategy avoids turning the first account connection into thousands of trophy requests.

## Base game and DLC

Trophy groups are normalized using the provider value where `default` represents the base trophy group. Additional numbered groups are treated as DLC when the provider contract confirms that mapping. Unexpected values must be stored as `unknown` rather than silently misclassified.

The platinum-progress calculation uses the base group only.

## Data integrity rules

- Syncs are idempotent.
- `earned=true` is monotonic and cannot be reverted by an incomplete provider response.
- A known valid `earned_at` value is not replaced by a worse or missing value.
- Provider failures never delete previously verified trophy state.
- Every synchronization attempt is recorded through `sync_runs`.

## Automated testing

Continuous integration never calls PlayStation Network. Tests use sanitized fixtures and `MockPsnProvider`. Real PSN access is reserved for explicit manual smoke tests during later milestones.

## Provider replacement

If `psn-api` changes or stops working, the intended migration path is to replace `PsnApiProvider` while preserving the rest of TrophyBridge. This boundary is a core architectural constraint, not merely an implementation convenience.
