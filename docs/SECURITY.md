# TrophyBridge Security Model

Security is part of the product contract because TrophyBridge handles PlayStation authorization and exposes revocable bearer capabilities that may request bounded freshness.

## Trust boundaries

Assume the repository is public, logs may be inspected, public capability URLs may leak, the database can become an attack target, and PSN/community interfaces can change. An AI client is an untrusted public consumer, never a holder of TrophyBridge server credentials.

## Secret classification

Never expose or log:

- PSN NPSSO values;
- PSN access or refresh tokens;
- authorization headers;
- Supabase service-role/secret keys;
- `TOKEN_ENCRYPTION_KEY` or previous encryption keys;
- plaintext share capability tokens outside the owner response/browser that requested them.

A public share URL is a bearer capability. It is less privileged than PSN authorization but possession grants read access to the allowlisted shared trophy state and, in M8, the ability to request strictly bounded single-game freshness.

## PSN credential lifecycle

NPSSO is accepted only through a private Node route for bootstrap, exchanged for PlayStation authorization and discarded. Access tokens are runtime-only. The durable refresh token is encrypted with AES-256-GCM using a fresh IV, authenticated data bound to account identity, and key versioning.

`psn_credentials` remains server-only. `anon` and `authenticated` receive no read access.

## TrophyBridge owner and PSN identity

Supabase Auth + GitHub OAuth identifies the TrophyBridge owner. A claimed PSN Online ID does not establish ownership. Initial connection resolves a stable account ID and verifies the authenticated profile with `isMe=true` and exact Online ID matching.

A future data-access architecture may separate the verified target PSN identity from the PSN identity authenticating read requests. Ownership proof and later data-access authorization must remain distinct security concepts.

## Public capability generation

M7 generates a 256-bit random token formatted as `tb1_<43 base64url characters>`. The server stores only its SHA-256 hexadecimal hash. TrophyBridge cannot recover a lost plaintext URL from PostgreSQL. Regeneration creates a fresh token and atomically revokes the prior active capability; explicit revocation preserves factual trophy history.

At most one active capability exists per account.

## Public allowlist

Public routes never expose:

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

Hidden library games are excluded. Unearned hidden trophy name, description and icon are spoiler-masked. Earned hidden trophies may expose known metadata because the owner has already unlocked them.

Tokenized responses use:

```text
Cache-Control: no-store, max-age=0
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

Optional `last_used_at` telemetry is best-effort and cannot make an otherwise valid read fail.

## M8 bounded freshness security

`ai-context?fresh=1` does not grant a public consumer unrestricted PSN access.

Before contacting PSN, TrophyBridge:

1. validates the capability and confirms it is active;
2. validates that the requested game belongs to the visible shared library;
3. reads the current durable trophy snapshot;
4. skips PSN entirely when the snapshot is within the configured freshness window;
5. for stale state, atomically claims from the share's refresh budget;
6. reuses `TrophySyncService` for exactly one game, including the existing per-game cooldown, database single-flight and snapshot bounds.

The default public freshness budget is 12 stale refresh claims/hour/share. The claim function locks the share row during quota accounting. Revoked capabilities cannot claim. Execution is revoked from `public`, `anon` and `authenticated` and granted only to `service_role`.

One public request cannot trigger a full-library crawl.

If refresh fails but durable trophy state exists, M8 returns that last-good state with an explicit non-success refresh outcome. Provider failure never authorizes rollback or deletion of factual earned state.

## Database privileges

Share rotation/revocation and M8 refresh-budget claims are performed by server-only PostgreSQL functions. Public reads do not grant anonymous direct table access. Next.js resolves token hashes with the trusted server client and returns allowlisted DTOs.

## Error behavior

Unknown/malformed tokens return `INVALID_SHARE_TOKEN`; known revoked capabilities return `SHARE_LINK_REVOKED`. M8 may also return safe `PSN_UNAVAILABLE`, `PSN_REAUTH_REQUIRED` or `SYNC_FAILED` errors when no usable cached trophy snapshot exists. Stable messages include a request ID; raw database/provider errors are never returned.

## Synchronization safety

M5-M8 require complete bounded game snapshots and preserve last-good state. Earned trophy state remains monotonic. Public freshness reuses the same synchronization boundary instead of implementing a second weaker writer.

## CI and repository hygiene

`.env*` secrets stay untracked, fixtures use fabricated identities, CI never contacts PSN, crypto tests use fake values, PostgreSQL tests verify privilege boundaries, and dependency resolution is frozen by the committed lockfile.

## Incident response

If a public capability leaks, revoke or regenerate it immediately. If PSN/Supabase authorization leaks, revoke/replace upstream credentials and rotate TrophyBridge encryption keys if necessary. Inspect logs/history without reproducing secret values.

M10 performs the explicit pre-release security review and hosted deployment validation.
