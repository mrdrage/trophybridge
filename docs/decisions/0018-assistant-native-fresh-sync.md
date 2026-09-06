# ADR 0018 — Assistant-native bounded fresh sync

Status: Accepted for implementation on `fix/psn-resilience-ai-sync`.

## Context

The M8 public AI context endpoint already supports a bounded `fresh=1` refresh for exactly one game. It enforces the existing per-game cooldown, the per-share hourly refresh budget, complete-snapshot validation and last-good fallback.

Real Platinum use exposed one remaining UX gap: an AI assistant can read cached TrophyBridge state, but cannot safely recover the plaintext `tb1_...` share capability because PostgreSQL stores only its SHA-256 hash. Asking the owner to open TrophyBridge and press `Aggiorna ora` defeats the purpose of the bridge.

The solution must not make the share token reversible, expose NPSSO/PSN credentials, add polling/cron, hydrate the full library, or add paid infrastructure.

## Decision

Add a narrow server-to-server assistant bridge that reuses the existing AI-context refresh path rather than creating a second sync system.

The target flow is:

```text
Authorized assistant
  -> TrophyBridge internal assistant endpoint
  -> active owner share / visibility check
  -> existing AI refresh claim budget
  -> existing TrophySyncService for one game
  -> factual AI context response
```

The internal endpoint is authenticated with a dedicated high-entropy server secret. The secret is never stored in the browser, public share rows, chat messages, source control or logs. Production automation may keep the matching secret in an infrastructure secret store and invoke the endpoint from a trusted server-side integration.

An active public share remains the owner's opt-in switch. The internal assistant path resolves the active share by PSN account, uses the same `share_links.id` for refresh-budget accounting, respects hidden-game visibility, and stops working when the share is revoked. This preserves the existing revocation model without making the plaintext public capability recoverable.

The internal route must:

- default to bounded freshness, never full-library synchronization;
- reuse `ShareService` AI-context serialization and refresh classification;
- preserve the 300-second game cooldown and configured freshness/budget limits;
- return last-good factual state when the upstream refresh is temporarily unavailable;
- never return PSN credential material, owner UUIDs, share hashes or bridge secrets;
- use constant-time comparison for the bridge bearer secret;
- emit `Cache-Control: no-store`;
- remain disabled unless the bridge secret is explicitly configured.

## Why not recover or persist the public share token?

The `tb1_...` capability is intentionally one-way persisted. Reversing that decision would turn a database read into the ability to impersonate the public share bearer and would weaken M7/M8's revocation boundary.

## Why not cron/polling?

TrophyBridge is deliberately request-driven and zero-cost. The assistant should request freshness only when the user asks for current trophy state. Existing cooldowns and budgets already bound the cost and PSN traffic.

## Deployment note

The application-side internal endpoint is safe to ship independently. Connecting a particular assistant runtime to it requires a trusted secret-delivery mechanism supported by that runtime. Until that final infrastructure binding is configured, the public `fresh=1` endpoint remains unchanged and no security boundary is weakened.

## Consequences

Positive:

- the intended UX becomes “ask the assistant, get fresh trophy state”;
- public capability hashing remains intact;
- no new database persistence model or background worker is introduced;
- the same factual DTO and sync guardrails are reused.

Trade-offs:

- a second server credential must be provisioned and rotated like any infrastructure secret;
- the assistant integration is only automatic in runtimes that can present that credential server-side;
- Supabase Free project suspension can still delay the first request after inactivity; this is an infrastructure cold-start condition, not a reason to poll continuously.
