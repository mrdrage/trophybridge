# TrophyBridge Security Model

Security is part of the product contract because TrophyBridge handles PlayStation authorization and now exposes revocable bearer capabilities.

## Trust boundaries

Assume the repository is public, logs may be inspected, public capability URLs may leak, the database can become an attack target, and PSN/community interfaces can change. An AI client is an untrusted public consumer, never a holder of TrophyBridge server credentials.

## Secret classification

Never expose or log:

- PSN NPSSO values;
- PSN access or refresh tokens;
- authorization headers;
- Supabase service-role/secret keys;
- `TOKEN_ENCRYPTION_KEY` or previous encryption keys;
- plaintext M7 share capability tokens outside the owner response/browser that requested them.

A public share URL is intentionally a **bearer capability**. It is less privileged than PSN authorization but must still be treated as a secret because possession grants read access to the allowlisted shared trophy state.

## PSN credential lifecycle

NPSSO is accepted only through a private Node route for bootstrap. It is exchanged for PlayStation authorization and discarded. Access tokens are runtime-only. The durable refresh token is encrypted with AES-256-GCM using a fresh IV, authenticated data bound to the TrophyBridge/PSN account identity, and key versioning.

`psn_credentials` remains server-only. `anon` and `authenticated` receive no read access.

## TrophyBridge session security

Supabase Auth + GitHub OAuth identifies the TrophyBridge owner. SSR cookies are refreshed only on private/auth paths. Private responses are non-cacheable. The Supabase service-role client exists only in server modules.

## PSN identity verification

A claimed Online ID does not establish ownership. Initial connection resolves a stable account ID and then verifies the authenticated profile with `isMe=true` and exact Online ID matching. The username lookup fallback cannot bypass this final verification.

A future data-access-credential architecture may separate the target account from the authenticating PSN account. If implemented, the initial ownership proof and the later read credential must remain distinct security concepts.

## M7 capability generation

M7 generates a 256-bit random token with Node.js `crypto.randomBytes(32)` and formats it as:

```text
tb1_<43 base64url characters>
```

The server computes SHA-256 over the complete token and stores only the hexadecimal hash in `share_links`. The plaintext token is returned only by the creation response and shown only in the current owner browser session.

Consequences:

- a database leak does not directly reveal active public URLs;
- TrophyBridge cannot recover a lost plaintext URL from the database;
- regeneration creates a fresh token and atomically revokes the prior active capability;
- at most one active capability exists per account;
- explicit revocation invalidates the current token without deleting factual trophy history.

## M7 public allowlist

Public routes may expose only explicitly serialized factual fields. They never expose:

```text
PSN refresh/access/NPSSO material
Supabase user IDs or email addresses
stable numeric PSN account IDs
service-role credentials
encryption metadata
share token hashes
internal credential records
raw provider/storage errors
```

Hidden library games are not returned. Unearned hidden trophy name, description and icon are masked by the public serializer. Earned hidden trophies may expose known metadata because the spoiler has already been unlocked by the owner.

## Capability transport hardening

Tokenized responses set:

```text
Cache-Control: no-store, max-age=0
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

The API does not render third-party HTML around the token URL. The bearer token must not appear in analytics, error messages or server logs.

M7 records optional coarse `last_used_at` metadata only. That telemetry is best-effort and must not alter authorization outcome.

## Database privileges

M7 share rotation/revocation is performed by server-only PostgreSQL functions. Execution is revoked from `public`, `anon` and `authenticated`, and granted only to `service_role`.

Public reads do **not** grant anonymous direct table access. Next.js resolves the token hash with the trusted server client and returns an allowlisted DTO.

## Error behavior

Unknown/malformed tokens return `INVALID_SHARE_TOKEN`. Known revoked capabilities return `SHARE_LINK_REVOKED`. Errors use stable safe messages and a generated request ID. Raw database/provider errors are never returned.

## Synchronization safety

M5/M6 still require complete, bounded snapshots and preserve last-good state. Public M7 GET requests never contact PSN and cannot create unbounded upstream work.

M8 `fresh=1`, when implemented, must reuse per-game cooldown/single-flight/size controls and serve last-good data on provider failure.

## CI and repository hygiene

`.env*` secrets stay untracked, fixtures use fabricated identities, CI never contacts PSN, crypto tests use fake values, PostgreSQL tests verify privilege boundaries, and dependency resolution is frozen by the committed lockfile.

## Incident response

If a public capability leaks, revoke or regenerate it immediately. If PSN/Supabase authorization leaks, revoke/replace upstream credentials and rotate TrophyBridge encryption keys if necessary. Inspect logs/history without reproducing secret values.

M10 performs the explicit pre-release security review and hosted deployment validation.
