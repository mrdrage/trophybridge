# Assistant bridge

TrophyBridge keeps the public `tb1_...` capability one-way persisted: PostgreSQL stores only SHA-256, so an assistant must never recover the public token from the database.

The internal assistant bridge exists for trusted server-to-server integrations that need the same factual `ai-context` response with bounded `fresh=1` semantics.

## Internal endpoint

```text
GET /api/internal/v1/assistant/accounts/{psnAccountId}/games/{gameId}/ai-context?fresh=0|1
Authorization: Bearer <TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN>
```

`fresh` defaults to `1` on this internal endpoint. Both path identifiers are TrophyBridge UUIDs, not public PSN numeric account IDs.

The route is disabled unless `TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN` is configured with at least 43 characters of high-entropy material. Authorization uses a constant-time SHA-256 comparison. The secret must live only in trusted infrastructure secret stores and must never be written to source control, browser storage, database share rows, logs or chat messages.

## Authorization and owner control

A valid bridge bearer is not enough by itself. TrophyBridge also requires an active, non-revoked share for the target PSN account and verifies that the requested game is visible. Revoking the normal AI share therefore disables both public capability access and trusted assistant refresh for that account.

The internal path uses the same `share_links.id` to claim the M8 refresh budget. It does not create an unlimited second budget.

## Refresh behavior

The bridge delegates to the same AI-context implementation used by the public M8 endpoint:

- 600-second freshness by default;
- 12 stale refresh claims/hour/share by default;
- 300-second per-game sync cooldown;
- one-game-only TrophySyncService execution;
- complete-snapshot validation and monotonic earned state;
- last-good cached response on temporary PSN failure when a usable snapshot exists;
- base-game missing trophies only in the Platinum-oriented embedded list.

There is no cron, polling loop or full-library hydration.

## Production binding

The application endpoint is only half of the trust relationship. A specific assistant runtime must be able to present the bearer entirely server-side. For the current operator workflow, the preferred zero-cost binding is a trusted Supabase-side HTTP invocation whose Authorization header is assembled from a secret store such as Supabase Vault. The model/user should see only the factual JSON response, never the bearer.

Do not weaken the public capability design by making `token_hash` usable as a bearer or by storing the plaintext `tb1_...` token recoverably.

## PSN credential resilience

The same field-test milestone also hardens durable PSN refresh behavior:

- only an explicit OAuth `invalid_grant` is classified as `REAUTH_REQUIRED`;
- malformed responses and other OAuth/upstream failures remain retryable;
- a `REAUTH_REQUIRED` state no longer deletes the encrypted refresh credential automatically;
- a fresh NPSSO connection overwrites the retained credential, while explicit disconnect still clears it.

This protects against the failure observed during the Final Fantasy XVI Platinum run, where one ambiguous refresh response previously destroyed the only durable credential and forced unnecessary manual reauthentication.
