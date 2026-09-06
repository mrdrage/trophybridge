# ADR 0018 — Assistant-native bounded fresh sync

Status: Accepted for implementation on `fix/psn-resilience-ai-sync`.

## Context

The M8 public AI context endpoint already supports a bounded `fresh=1` refresh for exactly one game. It enforces the existing per-game cooldown, the per-share hourly refresh budget, complete-snapshot validation and last-good fallback.

Real Platinum use exposed one remaining UX gap: an AI assistant can read cached TrophyBridge state, but cannot safely recover the plaintext `tb1_...` share capability because PostgreSQL stores only its SHA-256 hash. Asking the owner to open TrophyBridge and press `Aggiorna ora` defeats the purpose of the bridge.

The same field test exposed a PSN authentication flaw: `psn-api` 2.18.1 maps Sony token JSON into its token DTO and discards the OAuth `error` field. TrophyBridge therefore could not distinguish an authoritative `invalid_grant` from a malformed or temporary upstream response.

The solution must not make the public share token reversible, expose NPSSO/PSN credentials, add polling/cron, hydrate the full library, add paid infrastructure or introduce a reusable bearer that must be manually copied between services.

## Decision

Add a narrow server-to-server assistant bridge that reuses the existing AI-context refresh path and authenticates each invocation with a database-issued, short-lived, one-time capability.

The target flow is:

```text
Assistant operator
  -> prepare request in private PostgreSQL function
  -> committed hash-only bridge request + private one-time capability
  -> invoke request in a second PostgreSQL call
  -> HTTP to TrophyBridge with one-time capability
  -> atomic capability consumption
  -> active owner share / visibility check
  -> existing AI refresh claim budget
  -> existing TrophySyncService for one game
  -> factual AI context response
```

The two PostgreSQL calls are deliberate. The row containing the capability hash must commit before the HTTP request reaches Vercel; otherwise the application cannot observe and consume it.

The plaintext `tba1_...` capability is generated from 32 random bytes, expires after 60 seconds, is scoped to one account/game/fresh tuple and lives only in an operator-private table until invocation. The public bridge table stores only its SHA-256 hash. The model receives only the request UUID and final factual JSON, never the capability.

An active public AI share remains the owner's opt-in switch. The internal assistant path resolves the active share by PSN account, uses the same `share_links.id` for refresh-budget accounting, respects hidden-game visibility, and stops working when the share is revoked.

The internal route must:

- default to bounded freshness, never full-library synchronization;
- consume a capability only once and only for its bound account/game/fresh values;
- reject expired or replayed capabilities;
- reuse `ShareService` AI-context serialization and refresh classification;
- preserve the 300-second game cooldown and configured freshness/budget limits;
- return last-good factual state when the upstream refresh is temporarily unavailable;
- never return PSN credential material, share hashes or one-time capability material;
- emit no-store responses.

## Security boundary

`public.assistant_bridge_requests` is RLS-protected and exposes only hash/scoping/lifecycle data to the Vercel server through `service_role`. The plaintext capability is in `private.assistant_bridge_request_secrets`, inaccessible to `anon`, `authenticated` and `service_role`.

The prepare/invoke functions are `SECURITY DEFINER` only because they are operator-only infrastructure functions in an unexposed private schema. `EXECUTE` and schema access are revoked from `PUBLIC`; they are not Data API endpoints.

## PSN refresh adapter

Keep `psn-api` pinned at 2.18.1 and apply a narrow root-postinstall patch to both published CJS and ESM bundles. The patch preserves the provider's `error` field in the existing token response object and changes nothing about the Sony request itself.

The patch script validates the exact pinned mapper shape and fails installation if the dependency changes unexpectedly. A unit test calls the real installed refresh function with mocked HTTP responses to prove that `invalid_grant` is observable, temporary provider errors remain distinguishable, successful token mapping is unchanged and network failures still throw.

Once TrophyBridge has received a confirmed `invalid_grant`, it retains the encrypted durable refresh credential but sets `reauth_required`. Later refresh attempts short-circuit without decrypting or resending that rejected credential until a successful NPSSO reconnect restores `connected`.

## Why not recover or persist the public share token?

The `tb1_...` capability is intentionally one-way persisted. Reversing that decision would turn a database read into the ability to impersonate the public share bearer and would weaken M7/M8's revocation boundary.

## Why not a static bridge bearer?

A static Vercel/Supabase bearer would add a second long-lived secret, require cross-service provisioning and rotation, and give any holder broad bridge access. The one-time capability design has a much smaller blast radius and requires no new Vercel environment secret.

## Why not cron/polling?

TrophyBridge is deliberately request-driven and zero-cost. The assistant should request freshness only when the user asks for current trophy state. Existing cooldowns and budgets already bound the cost and PSN traffic.

## Consequences

Positive:

- the intended UX becomes “ask the assistant, get fresh trophy state”;
- public capability hashing remains intact;
- no new long-lived shared secret is introduced;
- no background worker is introduced;
- the same factual DTO and sync guardrails are reused;
- capability replay and cross-game substitution fail closed;
- PSN reauthentication is based on an explicit provider signal rather than malformed-response guesswork.

Trade-offs:

- production Supabase must have the synchronous `http` extension available;
- invocation is intentionally two database operations rather than one transaction;
- the pinned `psn-api` patch must be re-reviewed if the dependency version changes;
- Supabase Free project suspension can still delay the first request after inactivity; this is an infrastructure cold-start condition, not a reason to poll continuously.
