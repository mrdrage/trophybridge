# ADR 0017: M10 release hardening

Status: accepted

Date: 2026-08-20

## Context

TrophyBridge has reached a hosted Vercel deployment and the owner can authenticate through GitHub on the production origin. M10 is the final v0.1 hardening pass before considering the MVP release-ready.

The main remaining risks are configuration drift at the hosted boundary, unnecessarily broad database grants hidden behind RLS, cross-site mutation attempts against cookie-authenticated private routes, missing browser hardening headers, dependency drift, and unclear release/incident procedures.

## Decision

M10 hardens the existing architecture without adding a paid service or a second factual source.

1. PostgreSQL remains deny-by-default. `anon` receives no direct table privileges. `authenticated` receives only `SELECT` on `psn_accounts`, where the existing owner RLS policy still restricts rows to `auth.uid()`. All other application tables stay server-only through the service-role boundary.
2. Trigger/helper functions are not directly executable by public browser roles. Server-only snapshot/share RPCs remain executable only by `service_role`.
3. Future PostgreSQL tables/functions created by the migration owner inherit restrictive default privileges for `anon` and `authenticated`.
4. Cookie-authenticated private mutation routes reject cross-origin requests before application logic. Same-origin localhost and Vercel requests remain valid.
5. The Next.js application emits baseline browser hardening headers globally and opts the whole product out of search-engine indexing. Public API routes keep their stricter `no-store`/`no-referrer` response contract.
6. GitHub Dependabot checks npm and GitHub Actions dependencies weekly. Upgrades still require CI and review; `psn-api` remains intentionally pinned until explicitly validated.
7. No cron, queue, paid rate-limit store, paid observability service, image mirror, VPS or background worker is introduced.

## Hosted validation

The canonical hosted origin is `https://trophybridge.vercel.app`. The production login path is considered validated only when the owner successfully completes GitHub OAuth and reaches the M9 dashboard without localhost. Public AI capability validation remains token-based and must never require committing or logging the plaintext bearer token.

## PSN authorization note

M10 does not claim that Sony offers an indefinitely renewable public refresh-token flow. TrophyBridge keeps the M9 fix that avoids manufacturing a false expiry after token rotation, but a genuinely rejected/revoked credential can still require reauthentication. Separating target identity from a dedicated PSN data-access identity remains the safe follow-up if recurring owner reauthentication proves necessary in real use. Persisting the owner NPSSO is still rejected.

## Consequences

The release has a smaller browser/database attack surface and a clearer operational boundary while preserving the €0/month requirement. Some defense-in-depth controls, such as distributed IP rate limiting, are deliberately not added because they would require new stateful infrastructure; high-entropy capability tokens, bounded refresh claims, revocation, Vercel edge protections and last-good behavior remain the v0.1 controls.
