# PSN Integration

## Boundary

TrophyBridge treats PlayStation Network as an external provider. Application code consumes TrophyBridge-owned `PsnProvider` types rather than raw `psn-api` responses.

M2 implements `PsnApiProvider`. M3 implements the authentication lifecycle that safely creates it.

## Locale

The pilot configuration is **Italian**:

```text
it-IT
```

`preferred_locale` is persisted on the connected PSN account and passed into `PsnApiProvider`, which propagates it as `Accept-Language` on supported trophy calls. This keeps trophy names/descriptions aligned with the language used in-game when PSN supplies localized metadata.

## M2 provider operations

```text
getAccount()
getGames()
getTrophyGroups(game)
getTrophies(game)
getUserTrophies(game)
```

The adapter handles pagination, PS5 `trophy2` versus legacy `trophy`, runtime validation, base/additional/unknown group normalization, rarity/earned rate, hidden trophies, and stable provider errors.

## Implemented M3 authentication lifecycle

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
  +--> refresh token
  |
  v
makeUniversalSearch(exact Online ID)
  |
  v
stable PSN accountId
  |
  v
getProfileFromAccountId
  |
  v
require isMe=true + matching Online ID
```

NPSSO is never stored. The access token is not persisted. Only the refresh token is durable, and only after AES-256-GCM encryption.

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
  v
re-encrypt under active key version
  |
  v
PsnApiProvider({ accessToken, account, locale: "it-IT" })
```

An expired or rejected durable credential transitions to `reauth_required`. Temporary upstream failures use stable error codes and do not expose raw token material.

## Provider construction

`PsnConnectionService.createProviderForOwner(ownerUserId)` is the M3-to-M4 boundary. It obtains a fresh short-lived authorization, loads the verified stable PSN identity, applies the saved locale, and returns a ready `PsnApiProvider`.

M4 must use this factory rather than loading/decrypting credentials itself.

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

Disconnect deletes the credential while leaving the normalized account and trophy history intact.

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

## Testing

CI does not contact PSN. M2 uses sanitized provider fixtures. M3 injects fake PSN auth calls and verifies identity matching, token rotation, encrypted persistence, credential expiry, disconnection, and key rotation without live credentials.

A true live smoke requires external Supabase configuration plus a user-entered NPSSO in the private dashboard. That activation is deliberately outside CI and no NPSSO should ever be pasted into an issue, commit, or AI chat.
