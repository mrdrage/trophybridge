# PSN Integration

## Boundary

TrophyBridge treats PlayStation Network as the factual external provider. Application code consumes TrophyBridge-owned `PsnProvider` types rather than raw `psn-api` responses.

M2 implements `PsnApiProvider`. M3 implements the authentication lifecycle that safely creates it. M4-M6 reuse this boundary for library, detailed trophy, and progress-event synchronization.

TrophyBridge does **not** use PSNProfiles or another trophy community site as the source for personal earned state, trophy rarity, or earned-rate percentages.

## Locale

The pilot configuration is **Italian**:

```text
it-IT
```

`preferred_locale` is persisted on the connected PSN account and passed into `PsnApiProvider`, which propagates it as `Accept-Language` on supported trophy calls. This keeps trophy names/descriptions aligned with the language used in-game when PSN supplies localized metadata.

## Provider operations

```text
getAccount()
getGames()
getTrophyGroups(game)
getTrophies(game)
getUserTrophies(game)
```

The adapter handles pagination, PS5 `trophy2` versus legacy `trophy`, runtime validation, base/additional/unknown group normalization, rarity/earned rate, hidden trophies, and stable provider errors.

## Authentication lifecycle

### Initial connection

```text
NPSSO
  |
  v
exchangeNpssoForAccessCode
  |
  v
exchangeAccessCodeForAuthTokens
  |
  +--> short-lived access token
  |
  +--> refresh token + provider-reported refresh expiry
  |
  v
resolve stable PSN accountId
  |
  v
getProfileFromAccountId
  |
  v
require isMe=true + matching Online ID
```

NPSSO is bootstrap-only and is never stored. The access token is not persisted. Only the refresh token is durable, and only after AES-256-GCM encryption.

### Refresh

```text
encrypted refresh credential
  |
  v
decrypt server-side
  |
  v
exchangeRefreshTokenForAuthTokens
  |
  +--> access token returned to runtime only
  |
  +--> rotated refresh token, if provided
  |
  +--> new refresh-token lifetime, if provided
  |
  v
re-encrypt under active key version
  |
  v
persist next refresh expiry
  |
  v
PsnApiProvider({ accessToken, account, locale: "it-IT" })
```

`psn-api` exposes `refreshTokenExpiresIn` in the PlayStation token response. TrophyBridge converts that duration into `refresh_token_expires_at`. When a refresh response supplies a new lifetime, TrophyBridge moves the stored expiry forward from the refresh time; when it does not, the previously known expiry is retained.

This is why NPSSO is **not** required for normal library/game synchronization. The encrypted refresh credential is used instead. A fresh NPSSO is needed only when the durable refresh credential has actually expired, has been rejected/revoked by PlayStation, or otherwise cannot be refreshed. TrophyBridge then moves the connection to `reauth_required`.

Provider token lifetimes are external behavior rather than a TrophyBridge constant. The application trusts the lifetime returned by PlayStation instead of hard-coding a promised number of days.

## Provider construction

`PsnConnectionService.createProviderForOwner(ownerUserId)` is the authentication-to-sync boundary. It obtains fresh short-lived authorization from the encrypted refresh credential, loads the verified stable PSN identity, applies the saved locale, and returns a ready `PsnApiProvider`.

Library/trophy/event synchronization must use this factory rather than loading or decrypting credentials directly.

## Connection routes

Authenticated, non-cacheable server routes:

```text
POST /api/private/v1/psn/connect
GET  /api/private/v1/psn/status
POST /api/private/v1/psn/refresh
POST /api/private/v1/psn/disconnect
```

The connect request contains `onlineId` and `npsso`. The response never echoes NPSSO or tokens.

## Credential storage

`psn_credentials` is server-only and stores ciphertext, IV, GCM authentication tag, key version, refresh expiry, and refresh timestamp. Browser roles receive no privileges on the table.

Disconnect deletes the credential while leaving normalized factual account/trophy history intact.

## Trophy earned-rate provenance

The percentage shown beside a TrophyBridge trophy comes from PlayStation's user-trophy payload through the `trophyEarnedRate` field exposed by `psn-api`.

TrophyBridge maps:

```text
PSN trophyEarnedRate -> PsnUserTrophy.earnedRate -> trophies.earned_rate -> private UI "% giocatori"
```

The companion PSN field `trophyRare` is normalized into `ultra_rare`, `very_rare`, `rare`, `common`, or `unknown`.

No PSNProfiles scrape, community database, or independently calculated sample is involved in this factual percentage. A community site's displayed rate can therefore differ from TrophyBridge because that site may use a different member population or its own update model, while TrophyBridge preserves the rate returned through the PlayStation-facing provider.

## Trophy groups

Provider normalization remains conservative:

```text
default -> base
001/002/... exactly three digits -> dlc/additional group
anything else -> unknown
```

The term `dlc` is the current TrophyBridge persistence enum for additional groups. It does not assert that every numbered PlayStation group is commercially sold DLC.

## Numeric trophy-progress limitation

`psn-api` 2.18.1 exposes a PS5 progress target on some trophies but does not expose a verified current numeric value through its user-trophy model. TrophyBridge therefore uses:

```text
progressTarget -> provider value when present
progressValue -> null
progressPercent -> 100 for earned trophies, otherwise null
```

No missing progress is fabricated.

## Testing and live validation

CI does not contact PSN. Provider/auth tests use sanitized/fabricated data and verify identity matching, token rotation, encrypted persistence, credential expiry, snapshot validation, and event behavior without live credentials.

Real validation uses the private dashboard. NPSSO must be entered only there when reauthentication is required and must never be pasted into an issue, commit, log, screenshot, or AI chat.
