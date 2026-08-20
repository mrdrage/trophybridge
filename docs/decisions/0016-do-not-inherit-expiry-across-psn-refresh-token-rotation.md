# ADR 0016: Do not inherit expiry across PSN refresh-token rotation

Status: Accepted

Date: 2026-08-20

## Context

TrophyBridge bootstraps PlayStation authorization from a transient NPSSO and persists only an encrypted refresh token. The initial token response includes `refreshTokenExpiresIn`, which produced an absolute `refresh_token_expires_at` value in PostgreSQL.

During a real refresh, PSN can return a replacement refresh token while omitting `refresh_token_expires_in`. Before M9, TrophyBridge preserved the previous absolute expiry in that case. That expiry belonged to the token that had just been replaced, so the application could locally force `reauth_required` around ten days after the original bootstrap even though it was holding a newer refresh token.

The pinned `psn-api` authentication contract explicitly describes refresh-token exchange as the mechanism used to avoid constantly retrieving a new NPSSO and exposes both the replacement refresh token and its lifetime when the provider supplies them.

## Decision

`psn_credentials.refresh_token_expires_at` is nullable.

When refreshing:

1. If PSN returns `refreshTokenExpiresIn`, store `now + lifetime` for the current token.
2. If PSN returns a different refresh token but no new lifetime, encrypt and persist the rotated token and set local expiry to `NULL`.
3. If PSN does not rotate the token and does not return a lifetime, keep the existing known expiry.
4. A known current expiry that has passed still produces `reauth_required` before attempting refresh.
5. A token with unknown local expiry is presented to PSN normally. If Sony rejects it, TrophyBridge clears the credential and enters `reauth_required`.

## Consequences

- TrophyBridge no longer manufactures a reauthentication deadline from metadata that belonged to an obsolete token.
- NPSSO remains bootstrap/recovery material and is never persisted.
- Unknown local expiry is not treated as infinite validity. Sony remains authoritative and can reject/revoke the refresh token at any time.
- Normal refresh-token rotation can continue without owner intervention for as long as PSN continues accepting the durable credential chain.
- The separate target-account/data-access-account architecture remains possible but is not required simply to work around the former local expiry bug.

## Validation

M9 unit coverage includes a rotated refresh token without a replacement lifetime, then advances time beyond the original token expiry and verifies that TrophyBridge still attempts normal PSN refresh instead of forcing local reauthentication.
