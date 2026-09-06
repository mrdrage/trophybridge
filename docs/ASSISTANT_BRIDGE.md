# Assistant bridge

TrophyBridge keeps the public `tb1_...` capability one-way persisted: PostgreSQL stores only SHA-256, so an assistant must never recover the public share token from the database.

The assistant bridge provides the same factual `ai-context` response with bounded `fresh=1` semantics without introducing a second long-lived bearer secret.

## Internal endpoint

```text
GET /api/internal/v1/assistant/accounts/{psnAccountId}/games/{gameId}/ai-context?fresh=0|1
Authorization: Bearer <one-time tba1_... capability>
```

`fresh` defaults to `1`. Both path identifiers are TrophyBridge UUIDs, not public PSN numeric account IDs.

The endpoint accepts only a short-lived capability bound to the exact account, game and `fresh` value. The application stores only the capability SHA-256 hash in the public bridge-request row and consumes that row atomically before serving context.

## Operator flow

The zero-cost operator path is intentionally two-step because an HTTP request made from the same PostgreSQL transaction that creates a capability cannot be observed by Vercel until that transaction commits.

1. `private.prepare_trophybridge_ai_context(account, game, fresh)` verifies an active AI share and a visible game, generates 32 random bytes with `pgcrypto`, stores only the hash in `public.assistant_bridge_requests`, stores the plaintext capability in a locked `private` table, and returns only an opaque request UUID. The capability expires after 60 seconds.
2. After that transaction commits, `private.invoke_trophybridge_ai_context(request_uuid)` reads the private capability server-side and calls the production TrophyBridge internal endpoint through PostgreSQL `http`. The capability is placed only in the server-to-server Authorization header and is never returned to the model or user.
3. Vercel hashes the supplied capability and atomically marks the matching request consumed only when account, game, `fresh`, expiry and unused state all match. Replays fail closed.
4. The database deletes the private plaintext after the completed invocation. Expired public request rows are garbage-collected during later prepare calls.

The `private` schema and both operator functions are revoked from `PUBLIC`; browser roles and `service_role` cannot read the plaintext capability or invoke the operator functions. The Vercel backend receives only the one-time bearer and uses its existing service-role connection to consume the hash-only request row.

## Authorization and owner control

A valid one-time capability is not enough by itself. TrophyBridge also requires an active, non-revoked AI share for the target PSN account and verifies that the requested game is visible. Revoking the normal AI share therefore disables both public capability access and trusted assistant refresh for that account.

The internal path uses the same `share_links.id` to claim the M8 refresh budget. It does not create an unlimited second budget.

## Refresh behavior

The bridge delegates to the same AI-context implementation used by the public M8 endpoint:

- 600-second freshness by default;
- 12 stale refresh claims/hour/share by default;
- 300-second per-game sync cooldown;
- one-game-only `TrophySyncService` execution;
- complete-snapshot validation and monotonic earned state;
- last-good cached response on temporary PSN failure when a usable snapshot exists;
- base-game missing trophies only in the Platinum-oriented embedded list.

There is no cron, polling loop or full-library hydration.

## Secret boundaries

The following values must never enter chat, browser storage, source control or logs:

- NPSSO;
- encrypted/decrypted PSN durable refresh credential;
- plaintext public `tb1_...` share capability;
- plaintext one-time `tba1_...` operator capability.

The public share token remains intentionally non-recoverable. The one-time operator capability exists only long enough to bridge one explicit assistant request and is never exposed as a database API result.

## PSN credential resilience

This milestone also hardens durable PSN refresh behavior. The design requirement is:

- only authoritative provider rejection should become `REAUTH_REQUIRED`;
- malformed responses, network failures, 429 and 5xx responses remain retryable;
- `REAUTH_REQUIRED` must not destroy the encrypted durable credential;
- once the account is known to require reauthentication, later refresh attempts must short-circuit until a successful NPSSO reconnect changes that state;
- explicit disconnect still clears the credential.

The implementation includes a TrophyBridge-level adapter because `psn-api` 2.18.1 discards the OAuth `error` field from Sony token responses. Do not regress to classifying every malformed token-shaped response as reauthentication.
