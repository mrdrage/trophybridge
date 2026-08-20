# ADR 0014: Hashed revocable bearer capability sharing

- Status: Accepted
- Date: 2026-08-20

## Context

TrophyBridge needs a URL that a fresh AI client can read without GitHub/Supabase login, JavaScript challenges or PlayStation credentials. The URL must be easy to revoke, safe for a public repository architecture, inexpensive to operate and incapable of granting write access.

A predictable account URL would expose trophy state to anyone who knows the Online ID. Storing plaintext public tokens in the database would make a database read sufficient to reconstruct every live sharing URL. Granting anonymous RLS access to factual tables would also widen the public database attack surface.

## Decision

M7 uses an opaque bearer capability generated with 256 random bits:

```text
tb1_<base64url(randomBytes(32))>
```

The application immediately hashes the complete token with SHA-256 and stores only the hexadecimal hash in `share_links`. The raw token is returned to the authenticated owner only at generation time.

Only one active link is allowed per PSN account. Regeneration atomically revokes the previous active row and inserts the new hash. Explicit revocation marks the row inactive and records `revoked_at`; factual trophy data is untouched.

Public requests carry the plaintext capability to Next.js. The server hashes it, resolves the matching row through the trusted server client and serializes an explicit allowlist of fields. Browser/anonymous roles are not granted direct table access or share-mutation RPC privileges.

Public serializers exclude hidden library games and mask name/description/icon for unearned hidden trophies. Tokenized responses are `no-store`, non-indexed and `no-referrer`.

M7 reads durable PostgreSQL state only. They do not call PlayStation. M8 will add a separately bounded freshness capability.

## Consequences

### Positive

- Database contents cannot directly reconstruct an active public URL.
- Revocation is immediate at the TrophyBridge application boundary.
- Regeneration invalidates a leaked/lost URL without touching account/trophy history.
- Public clients receive read-only allowlisted JSON rather than database credentials.
- Hidden-game and spoiler policy is centralized in serialization.
- Public traffic has no PSN fan-out in M7 and stays inside the zero-cost architecture.

### Negative

- A lost plaintext URL cannot be recovered; the owner must regenerate it.
- Anyone possessing an active URL can read its allowlisted data until revocation, so the URL itself must be treated as a bearer secret.
- URL tokens can still leak through user behavior, browser history or external tools despite response hardening.
- Server-mediated reads use the privileged Supabase client, so serializer correctness remains security-critical.

## Rejected alternatives

### Public URL based on Online ID

Rejected because it is enumerable and cannot express possession-based consent or revocation cleanly.

### Store plaintext capability tokens

Rejected because a database read would immediately reveal usable public URLs.

### Anonymous direct Supabase table/RLS reads

Rejected because it broadens database privileges and makes it harder to maintain a strict, versioned public contract.

### JWT capability signed by TrophyBridge

Deferred because M7 does not need embedded claims or offline verification. An opaque random token plus hash lookup is simpler to revoke and already requires PostgreSQL for factual state.

### Public GET automatically refreshes PSN

Rejected for M7 because an unauthenticated caller could create upstream load. M8 will introduce explicit, bounded single-game freshness with cooldown and last-good fallback.

## Follow-up

M8 adds AI Context and `fresh=1`. It must preserve the same capability boundary, single-game scope, zero-cost limits, spoiler rules and revocation semantics.
