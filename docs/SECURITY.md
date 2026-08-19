# TrophyBridge Security Model

TrophyBridge handles credentials that can provide access to PlayStation account data. Security requirements are therefore part of the product contract from the first milestone.

## Threat model summary

The system must assume that:

- the source repository is public;
- public share URLs may be copied or leaked;
- application logs may be viewed by developers or hosting operators;
- the database may eventually contain enough information to be attractive to an attacker;
- upstream PSN behavior and community tooling may change;
- an AI client should be treated as an untrusted public API consumer, never as a holder of secrets.

## Secret classification

The following values are secret and must never appear in source code, public APIs, browser bundles, screenshots committed to the repository, analytics payloads, or application logs:

- PSN NPSSO values;
- PlayStation access tokens;
- PlayStation refresh tokens;
- Supabase service-role/secret keys;
- `TOKEN_ENCRYPTION_KEY`;
- authorization headers;
- any future private signing keys.

## PSN authentication

The planned connection flow is:

```text
User enters NPSSO in authenticated dashboard
        |
        v
Server receives value over HTTPS
        |
        v
PSN adapter exchanges it for usable authorization
        |
        v
NPSSO is discarded
```

The NPSSO is bootstrap material only. It is not intended to be durable application state.

A refresh token may need durable storage. When implemented, it must be encrypted server-side before persistence.

## Token encryption

Planned application-level encryption:

```text
AES-256-GCM
```

The master encryption key is supplied via the deployment environment and never stored in PostgreSQL.

A future server-only credential record is expected to include:

```text
psn_account_id
encrypted_refresh_token
iv
auth_tag
key_version
updated_at
```

Key versioning is included from the start so credentials can be rotated without redesigning the schema.

## Public share links

Public links are capability URLs. Possession of the URL grants read-only access to the explicitly shared trophy data.

Requirements:

- cryptographically random token with at least 256 bits of entropy;
- raw token is shown to the user only as necessary;
- database stores a cryptographic hash rather than relying on the raw token;
- links can be revoked independently of PSN authentication;
- a new link can be issued without reconnecting PSN;
- public endpoints never permit mutation;
- responses are not indexed by search engines.

## Public-data allowlist

Public APIs are allowlist based. The following categories may be exposed when enabled by share settings:

- PSN Online ID;
- game title and platform;
- public game/trophy artwork URLs;
- trophy metadata;
- earned/missing state;
- trophy earned timestamps;
- progress values provided by PSN;
- TrophyBridge synchronization timestamps.

Everything else is denied by default.

Specifically excluded:

- email addresses;
- PSN authentication identifiers not needed for display;
- friend lists;
- device information;
- account-management data;
- authentication material.

## Hidden trophy handling

Unearned hidden trophies can contain story spoilers. The default public behavior must conceal spoiler-bearing fields unless the share owner explicitly opts in.

Default unearned hidden representation:

```json
{
  "name": "Hidden Trophy",
  "description": null,
  "hidden": true,
  "earned": false
}
```

## Supabase and database access

Application tables exposed through Supabase must use Row Level Security. Administrative/service-role credentials are server-only and must never be instantiated in client-side code.

The public TrophyBridge API should access data through controlled server routes rather than handing database-wide privileges to a browser client.

## Logging

Logs are structured and minimal.

Allowed examples:

```text
sync_started
sync_completed
sync_failed
psn_refresh_failed
share_link_created
share_link_revoked
```

Useful correlation fields may include:

```text
request_id
sync_run_id
internal game id
duration
status
non-sensitive error code
```

Never log:

```text
NPSSO
access token
refresh token
Authorization header
TOKEN_ENCRYPTION_KEY
complete sensitive upstream payloads
```

## Synchronization safety

A transient upstream failure must not corrupt durable player state. In particular:

- existing trophies are not deleted on partial responses;
- `earned=true` does not silently regress to false;
- known earned timestamps are preserved;
- stale-but-valid data remains available when PSN is unavailable;
- concurrent refreshes are coalesced or locked.

## Repository hygiene

The repository is designed to be public.

Required controls:

- real `.env` files ignored;
- `.env.example` contains names only, never values;
- PSN test fixtures are anonymized;
- CI never requires a real PSN account;
- security-sensitive failures are documented without publishing credentials.

## Incident response principles

If a credential is suspected to have leaked:

1. revoke or rotate it at the upstream provider;
2. rotate TrophyBridge encryption material if affected;
3. invalidate relevant share links if public exposure is possible;
4. inspect logs and repository history;
5. document the incident and corrective action without reproducing the secret.

## Security review milestone

M10 includes an explicit security review before the first release tag. Security-sensitive implementation decisions made earlier should receive ADRs when they materially alter this model.
