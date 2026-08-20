# PSN Integration

## Boundary

TrophyBridge treats PlayStation Network as the factual external provider and consumes TrophyBridge-owned `PsnProvider` types instead of raw `psn-api` payloads. The pinned adapter is `psn-api` 2.18.1.

TrophyBridge does not use PSNProfiles or another community trophy site as the source for personal earned state, rarity or earned-rate percentages.

## Locale

The pilot locale is `it-IT`. It is persisted on the connected account and sent through supported trophy requests so names/descriptions match the language used in-game when PSN supplies localization.

## Provider operations

```text
getAccount()
getGames()
getTrophyGroups(game)
getTrophies(game)
getUserTrophies(game)
```

The adapter handles pagination, PS5 `trophy2` versus legacy `trophy`, runtime validation, platform normalization, group classification, hidden trophies, rarity/earned rate and stable provider errors.

## Authentication lifecycle in v0.1

Initial owner connection:

```text
NPSSO
 -> access code
 -> access + refresh authorization
 -> resolve stable target accountId
 -> getProfileFromAccountId
 -> require isMe=true + exact Online ID
 -> discard NPSSO
 -> encrypt durable refresh credential
```

Normal synchronization obtains a short-lived access token from the encrypted durable refresh credential. NPSSO is not stored and PSN access tokens are runtime-only.

A provider-reported `refresh_token_expires_in` is recorded as metadata, not as an application-enforced death date. TrophyBridge does not clear a durable credential merely because that stored timestamp has passed. It attempts the refresh with PSN and lets PlayStation decide whether the credential is accepted.

If PSN accepts a refresh after the recorded local expiry, TrophyBridge continues normally. When no replacement lifetime is returned, an already-stale local expiry is cleared. If PSN returns a genuinely rotated refresh token without a new lifetime, the replacement is also persisted with unknown local expiry rather than inheriting the previous token's deadline.

Only an actual PSN rejection, a missing durable credential, or an unreadable encrypted credential requires owner intervention. This removes TrophyBridge's own periodic ten-day reauthentication behavior, but it does not promise perpetual Sony authorization.

## Target identity versus data-access identity

The current v0.1 authorization still uses the verified target owner's PSN credential. Two concepts can be separated later if necessary:

1. **target identity**: the PlayStation account whose trophies TrophyBridge tracks;
2. **data-access identity**: the authenticated PlayStation account whose token is used to call trophy endpoints.

Community-documented PlayStation trophy APIs accept a target numeric `accountId`, and supported calls can read another account when privacy permissions allow it. Therefore a dedicated TrophyBridge data-access identity remains a plausible experiment if real production observation shows recurring Sony-side rejection of the target owner's durable credential.

That experiment is not required merely to work around a local expiry timestamp anymore. It must validate every required library/trophy call, privacy behavior, ownership separation, PlayStation terms/security and the €0/month requirement before adoption.

This is an architectural option, not proof of how PSNProfiles is implemented. TrophyBridge does not claim knowledge of PSNProfiles' private authentication design.

Persisting the owner's NPSSO or password as a long-term shortcut is rejected.

## Trophy earned-rate provenance

The percentage shown beside a TrophyBridge trophy originates from PlayStation's `trophyEarnedRate` field returned by the PSN trophy data.

```text
PSN trophyEarnedRate
 -> normalized earnedRate
 -> trophies.earned_rate
 -> private/public TrophyBridge output
```

`trophyRare` is normalized into rarity categories. A community site's percentage may differ because it can use a different user population or update model.

## Trophy groups

```text
default -> base
001/002/... -> additional (`dlc` internal enum)
anything else -> unknown
```

The internal word `dlc` does not prove commercial DLC ownership or purchase.

## Numeric trophy-progress limitation

`psn-api` exposes a progress target on some PS5 trophies but not a verified current numeric value through the user-trophy model. TrophyBridge therefore keeps:

```text
progressTarget -> provider value when present
progressValue -> null when unavailable
progressPercent -> 100 when earned, otherwise null unless verified
```

No missing numeric progress is fabricated.

## Synchronization and no-click freshness

Library synchronization remains bounded and owner-controlled. Deep trophy synchronization is lazy per game.

M8 `ai-context?fresh=1` makes normal AI use no-click: the public capability first reads durable state and contacts PSN only for the requested game when its trophy snapshot is stale and the share/game cooldown budgets allow it. It reuses the same `TrophySyncService` path rather than creating a weaker public writer.

Continuous background polling is not required. There is no cron, queue or always-on Mac in v0.1.

## Testing

CI never contacts PSN. Provider/auth tests use fabricated data. The refresh lifecycle specifically tests token rotation, missing replacement expiry, successful provider refresh after a stale local expiry, and genuine PSN rejection.

Live validation is performed only through the private hosted owner environment. No NPSSO, refresh token, access token or service credential belongs in chat, GitHub, logs or screenshots.
