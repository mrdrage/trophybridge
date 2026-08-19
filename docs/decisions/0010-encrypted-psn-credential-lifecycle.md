# ADR 0010: Encrypted PSN credential lifecycle

## Status

Accepted

## Context

TrophyBridge needs repeatable PSN access for synchronization, but NPSSO is password-equivalent bootstrap material and PSN access tokens are short lived. Durable authorization therefore requires storing a refresh credential without exposing it to the browser, database readers, logs, repository, or public API.

M2 deliberately left authentication outside `PsnApiProvider` so the provider could receive short-lived authorization rather than own secrets.

## Decision

M3 adopts the following lifecycle:

1. TrophyBridge users authenticate through Supabase Auth, initially GitHub OAuth, with SSR cookies.
2. NPSSO is accepted only by an authenticated private server route and is never persisted.
3. NPSSO is exchanged for PSN authorization.
4. The claimed Online ID is resolved to a stable `accountId`, then the fresh PSN authorization must return that profile with `isMe=true` and a matching Online ID.
5. PSN access tokens are never persisted.
6. The refresh token is encrypted with AES-256-GCM before database persistence.
7. Each encryption uses a fresh 12-byte IV and account-bound Additional Authenticated Data.
8. The database stores ciphertext, IV, GCM tag, expiry, and key version, but never the master key.
9. The active key is supplied by the server environment; older versioned keys may temporarily be supplied during rotation.
10. A successful refresh re-encrypts the durable credential under the active key version.
11. Missing/expired/rejected credentials transition to `reauth_required`.
12. Disconnect deletes authorization material without deleting normalized trophy history.
13. `PsnConnectionService` is the only application boundary that constructs an authenticated `PsnApiProvider` for later sync milestones.
14. Trophy metadata locale is persisted per account; the pilot/default locale is `it-IT`.

## Consequences

Positive:

- database theft alone does not reveal plaintext refresh tokens without the separate application key;
- moving ciphertext between account records fails GCM authentication because of AAD;
- NPSSO and access tokens do not become durable liabilities;
- key rotation is possible without a schema redesign;
- M4/M5 synchronization does not need to understand authentication internals;
- PSN identity is verified rather than trusting a username supplied by the browser.

Trade-offs:

- the application encryption key becomes critical deployment infrastructure;
- lost encryption keys make stored credentials unrecoverable and require reauthentication;
- `psn-api` authentication behavior is community-backed and may require future adapter changes;
- a live smoke test cannot run safely in public CI and requires owner interaction.

These trade-offs are accepted because minimizing durable plaintext secrets is more important than operational convenience.
