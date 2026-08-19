# TrophyBridge Security Model

Security is part of the TrophyBridge product contract because the application handles authorization capable of reading PlayStation account data.

## Trust boundaries

Assume the repository is public, application logs may be inspected by operators, public share URLs may leak, the database may become an attack target, and PSN/community interfaces may change. An AI client is always treated as an untrusted public consumer, never as a secret holder.

## Secret classification

Never expose or log:

- PSN NPSSO values;
- PSN access tokens;
- PSN refresh tokens;
- authorization headers;
- Supabase service-role/secret keys;
- `TOKEN_ENCRYPTION_KEY` or previous encryption keys;
- future private signing keys.

## Implemented M3 authentication flow

```text
Authenticated TrophyBridge dashboard
        |
        v
NPSSO received by a private Node.js route
        |
        v
NPSSO -> PSN access code -> access + refresh authorization
        |
        +--> exact Online ID search
        |       |
        |       v
        |   stable accountId
        |       |
        |       v
        |   profile.isMe verification
        |
        +--> NPSSO discarded
        |
        +--> access token kept only for the request/runtime lifecycle
        |
        v
refresh token -> AES-256-GCM -> server-only PostgreSQL credential row
```

TrophyBridge does not persist NPSSO or PSN access tokens.

## Durable credential encryption

M3 implements AES-256-GCM using Node.js `crypto`.

Each encrypted refresh credential stores:

```text
encrypted_refresh_token
encryption_iv
encryption_auth_tag
key_version
refresh_token_expires_at
last_refreshed_at
```

The 256-bit master key is supplied through the server environment. A fresh 96-bit IV is generated for each encryption. Additional Authenticated Data binds the ciphertext to both the internal TrophyBridge PSN-account ID and the verified PlayStation account ID, so moving ciphertext between accounts causes authentication failure.

`TOKEN_ENCRYPTION_KEY_VERSION` identifies the active encryption key. `TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON` may temporarily provide old versions for decryption during rotation. Successful refresh writes the credential again under the active key.

The database never contains the encryption master key.

## Credential persistence and RLS

M3 creates `public.psn_credentials` as a one-to-one server-only child of `psn_accounts`.

- RLS is enabled.
- `anon` and `authenticated` receive no privilege on `psn_credentials`.
- application server code accesses it through the Supabase service-role client.
- an authenticated browser may select only its own non-secret `psn_accounts` connection metadata through `owner_user_id = auth.uid()`.
- v0.1 allows one PSN connection per TrophyBridge owner.

Ciphertext is intentionally treated as server-only even though it is encrypted.

## TrophyBridge session security

M3 uses Supabase Auth with SSR cookies and GitHub OAuth. The root Next.js `proxy.ts` handles session refresh for authenticated/private paths. Authentication responses copy Supabase's refreshed cookies and are marked `private, no-store` to prevent caching of user-specific session material.

Server routes resolve the authenticated user before PSN operations. The Supabase service-role client is created only in server modules and is never exported to client components.

## PSN identity verification

A claimed PSN Online ID is not trusted by itself. After NPSSO exchange, TrophyBridge:

1. searches the exact Online ID;
2. obtains its stable PSN `accountId`;
3. fetches that profile using the freshly issued access token;
4. requires `isMe=true`;
5. requires the returned Online ID to match the claimed ID.

This prevents connecting an arbitrary searched profile to authorization belonging to someone else.

## Connection states

`psn_accounts.auth_status` is explicit:

```text
connected
refreshing
reauth_required
error
```

An absent/expired refresh credential becomes `reauth_required`. A failed authenticated refresh does not silently delete normalized trophy state. Disconnect deletes only the durable credential and marks the account for reauthentication.

## Logging

Allowed operational events include `psn_connect_failed`, `psn_refresh_failed`, `sync_started`, `sync_completed`, and non-sensitive correlation IDs/error codes.

Never include raw provider error payloads when they can contain credentials. Public/private API errors use stable safe TrophyBridge codes and messages.

## Public sharing

M7 will implement capability URLs with high-entropy tokens, hashed persistence, revocation, read-only methods, non-indexing, and a strict public-data allowlist. Authentication material and email addresses are permanently outside that allowlist.

## Hidden trophies

Future public routes should conceal name/description of unearned hidden trophies by default to reduce spoilers.

## CI and repository hygiene

- `.env.example` contains names and documentation only.
- `.env*` secrets remain untracked.
- PSN fixtures are fabricated/sanitized.
- CI never contacts PSN.
- crypto tests use deterministic fake keys and fake tokens.
- PostgreSQL CI validates RLS and credential-table privilege boundaries.
- dependency installation is frozen through the committed lockfile.

## Incident response

If authorization material may have leaked, revoke or replace upstream credentials, rotate TrophyBridge encryption keys as needed, inspect logs/repository history without reproducing the secret, and invalidate public share links if relevant.

M10 performs the explicit pre-release security review; security-sensitive changes before then require tests and an ADR.
