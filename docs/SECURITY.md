# TrophyBridge Security Model

Security is part of the product contract because TrophyBridge handles PlayStation authorization and exposes revocable bearer capabilities that may request bounded freshness.

## Trust boundaries

Assume the repository is public, logs may be inspected, public capability URLs may leak, the database can become an attack target, and PSN/community interfaces can change. An AI client is an untrusted public consumer, never a holder of TrophyBridge server credentials.

The canonical hosted application is `https://trophybridge.vercel.app`. Localhost is development-only and is not required for normal TrophyBridge use.

## Secret classification

Never expose or log:

- PSN NPSSO values;
- PSN access or refresh tokens;
- authorization headers;
- Supabase service-role/secret keys;
- `TOKEN_ENCRYPTION_KEY` or previous encryption keys;
- plaintext share capability tokens outside the owner response/browser that requested them.

A public share URL is a bearer capability. It is less privileged than PSN authorization but possession grants read access to the allowlisted shared trophy state and the ability to request strictly bounded single-game freshness.

## PSN credential lifecycle

NPSSO is accepted only through a private Node route for bootstrap, exchanged for PlayStation authorization and discarded. Access tokens are runtime-only. The durable refresh token is encrypted with AES-256-GCM using a fresh IV, authenticated data bound to account identity, and key versioning.

M9 corrected refresh-token rotation semantics: when PSN actually returns a different refresh token without a new lifetime, TrophyBridge does not attach the previous token's absolute expiry to the replacement.

M10 also stops treating a provider-reported refresh expiry as a local kill switch. The stored timestamp is advisory metadata. TrophyBridge attempts the encrypted durable refresh credential with PlayStation even when that recorded date has passed. If PSN accepts it, normal operation continues; if that accepted response supplies no new lifetime and the old timestamp is already stale, the local expiry is cleared. Reauthentication is requested only after an actual PSN rejection, a missing credential, or a credential that cannot be decrypted.

This removes TrophyBridge's own periodic-expiry behavior without persisting a more powerful secret. It is not a claim of perpetual PlayStation authorization. Sony remains the authority that can expire, revoke or reject a credential. TrophyBridge will not persist an owner NPSSO or password to bypass that boundary. A separate data-access identity remains an optional future experiment only if real production observation shows recurring Sony-side rejection.

## TrophyBridge owner and PSN identity

Supabase Auth + GitHub OAuth identifies the TrophyBridge owner. A claimed PSN Online ID does not establish ownership. Initial connection resolves a stable account ID and verifies the authenticated profile with `isMe=true` and exact Online ID matching.

Production GitHub OAuth has been validated on the hosted Vercel origin. Supabase currently serves the owner through the GitHub provider rather than a TrophyBridge password flow.

## Public capability generation

M7 generates a 256-bit random token formatted as `tb1_<43 base64url characters>`. The server stores only its SHA-256 hexadecimal hash. TrophyBridge cannot recover a lost plaintext URL from PostgreSQL. Regeneration creates a fresh token and atomically revokes the prior active capability; explicit revocation preserves factual trophy history.

At most one active capability exists per account.

## Public allowlist

Public routes never expose PSN credential material, Supabase identities/email, stable numeric PSN account IDs, service-role credentials, encryption metadata, share token hashes, internal credential rows or raw provider/storage errors.

Hidden library games are excluded. Unearned hidden trophy name, description and icon are spoiler-masked. Earned hidden trophies may expose known metadata because the owner has already unlocked them.

Public tokenized responses remain non-cacheable and non-indexable. M10 also opts the whole application out of indexing with robots metadata plus `robots.txt`.

## Bounded AI freshness

`ai-context?fresh=1` does not grant unrestricted PSN access. TrophyBridge validates the capability and requested visible game, skips PSN when the durable snapshot is fresh, atomically claims a bounded share refresh budget only for stale state, and reuses the same one-game `TrophySyncService` boundary with cooldown, single-flight and snapshot ceilings.

The default public freshness budget is 12 stale refresh claims/hour/share. A single request cannot crawl the library. When provider refresh fails but durable data exists, the endpoint returns last-good state with an explicit refresh outcome instead of deleting or rolling back factual progress.

## M10 database hardening

M10 narrows the database grants instead of relying only on RLS:

- `anon` has no direct privileges on TrophyBridge application tables;
- `authenticated` keeps only `SELECT` on `psn_accounts`, still restricted by the owner RLS policy using `auth.uid()`;
- credential, game, trophy, event, sync and sharing tables remain server-only;
- public/browser roles cannot execute public-schema helper functions or server RPCs;
- snapshot, share mutation and AI refresh-budget RPCs remain explicitly executable by `service_role`;
- restrictive default privileges cover future migration-created public tables/functions.

PostgreSQL integration tests assert this boundary on every pull request.

## M10 hosted request hardening

State-changing requests to `/api/private/*` must be same-origin. TrophyBridge compares the browser `Origin` header with the actual request origin derived from forwarded/host headers and rejects missing, malformed or cross-origin mutations with HTTP 403 before private application logic runs.

This is defense in depth for the cookie-authenticated dashboard. Safe `GET`, `HEAD` and `OPTIONS` requests do not require an Origin header.

Global response hardening includes CSP framing/object/base restrictions, `Cross-Origin-Opener-Policy: same-origin`, `Referrer-Policy: no-referrer`, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a restrictive Permissions Policy. Public API routes keep their existing stricter no-store/noindex response contract.

## Supply-chain and CI security

`.env*` secrets stay untracked, fixtures use fabricated identities, CI never contacts PSN, crypto tests use fake values, PostgreSQL tests verify privileges, and dependency resolution is frozen by the committed lockfile.

M10 adds weekly Dependabot checks for npm and GitHub Actions. Updates still require review and the normal lint, typecheck, test, build, PostgreSQL and Playwright gates. `psn-api` remains deliberately pinned until a version is explicitly validated.

## Known platform advisories

Supabase may report `rls_enabled_no_policy` information notices for intentionally server-only tables. Those tables have RLS enabled and M10 also removes browser table grants.

Supabase also reports leaked-password protection disabled. TrophyBridge v0.1 authenticates its owner through GitHub OAuth rather than an application password; this warning is tracked as hosted Auth configuration hygiene rather than a trophy-data privilege regression.

Unused-index performance notices can remain while the pilot dataset is small. Indexes supporting domain invariants and future query paths are not removed solely because the current pilot has not exercised them enough to register usage.

## Incident response

If a public capability leaks, revoke or regenerate it immediately. If PSN/Supabase authorization leaks, revoke/replace upstream credentials and rotate TrophyBridge encryption keys if necessary. Inspect logs/history without reproducing secret values.

No paid security service, Redis, queue, worker, VPS or third-party telemetry dependency is required for the v0.1 security model.
