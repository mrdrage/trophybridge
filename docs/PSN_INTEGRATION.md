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

## Authentication lifecycle through M7

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

Normal synchronization uses the encrypted refresh credential to obtain a short-lived access token. When PlayStation returns a rotated refresh token/lifetime, TrophyBridge persists the new encrypted value and expiry. If the durable credential becomes invalid or expires, current code enters `reauth_required`.

The provider-reported refresh lifetime is external behavior, not a TrophyBridge constant.

## Important authentication research after M6

The current implementation couples two concepts that do not necessarily need to be the same:

1. **target identity**: the PlayStation account whose trophies TrophyBridge tracks;
2. **data-access identity**: the authenticated PlayStation account whose token is used to call trophy endpoints.

The PlayStation trophy APIs exposed through the community-documented clients accept a target numeric `accountId`. Their documented behavior allows an authenticated account to retrieve another account's trophy data when that target's privacy settings permit it.

That means the long-term TrophyBridge design does not have to assume `mrdrage2` must provide a new NPSSO every time its own refresh credential expires. A future design can keep the target stable account ID while using a separately managed TrophyBridge data-access credential for public/readable trophy data.

This is an architectural finding, not proof of how PSNProfiles is implemented. TrophyBridge will not claim access to PSNProfiles' private authentication design.

Before adopting the separated-credential model we must validate:

- the pilot account's privacy permits all required library/trophy calls;
- every endpoint needed by TrophyBridge works with target != authenticating account;
- private/hidden-account behavior remains safe;
- ownership verification remains independent and cannot be bypassed;
- service-credential lifecycle and PlayStation terms/security are acceptable;
- zero-cost operation is preserved.

Persisting the owner's NPSSO as a long-term shortcut is rejected. NPSSO remains password-equivalent bootstrap material.

## Trophy earned-rate provenance

The percentage shown beside a TrophyBridge trophy originates from PlayStation's `trophyEarnedRate` field returned in user-trophy data.

```text
PSN trophyEarnedRate
 -> PsnUserTrophy.earnedRate
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

## Sync and future no-click freshness

Through M7, PSN requests happen only after private manual synchronization. M7 public GETs are database-only.

M8 will add an AI-optimized `ai-context` route and bounded `fresh=1`. A fresh AI request will be able to invoke the existing one-game sync boundary only when stale and allowed by cooldown/single-flight guards. This lets the assistant refresh trophy state on demand instead of requiring the owner to press `Sincronizza trofei`.

Continuous background polling is not required for this behavior and remains outside the accepted zero-cost design unless later justified.

## Testing

CI never contacts PSN. Provider/auth tests use fabricated data. Live validation is performed only with the private pilot environment. No NPSSO, refresh token, access token or service credential belongs in chat, GitHub, logs or screenshots.
