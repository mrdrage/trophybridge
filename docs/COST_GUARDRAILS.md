# TrophyBridge Zero-Cost Guardrails

Last verified: 2026-08-19.

## Product requirement

TrophyBridge has a hard operating-cost target of **€0/month** for the personal v0.1 deployment.

This means more than choosing free plans. Application behavior must stay bounded and, if quota pressure appears, TrophyBridge must throttle, refuse optional work, serve last-good state, or temporarily stop rather than require a paid upgrade.

Free-tier quotas can change, so hosted-service limits are re-verified before production deployment and whenever a new dependency is introduced.

## Current services

### Supabase

The connected TrophyBridge organization is on the Supabase **Free** plan. TrophyBridge uses PostgreSQL, Supabase Auth, and the Data API through server-side clients.

M4/M5 do not require Supabase Storage for PlayStation artwork, Edge Functions, paid database add-ons, or background workers.

### GitHub

The repository is public. CI uses standard GitHub-hosted runners only. Larger paid runners are outside the accepted v0.1 architecture.

### Vercel

Deployment is planned for Vercel **Hobby** only. No Pro plan, paid add-on, or paid observability product is required by M0-M5.

### PlayStation integration

TrophyBridge uses pinned open-source `psn-api` and does not depend on a paid PSN data broker.

## M4 library guardrails

```text
Default minimum interval per account: 3600 seconds
Maximum titles accepted per sync: 2000
Stale-running-run recovery: 600 seconds
Dashboard library rows: 12 by default, hard bounded to 50
Concurrent running library syncs per account: 1
Trigger: authenticated manual action only
```

The 2,000-title ceiling exists in both TypeScript and PostgreSQL. An oversized response is rejected before library persistence.

A successful snapshot does not delete titles omitted by a later response. This preserves last-good state and avoids costly recovery imports.

## M5 game-trophy guardrails

```text
Default minimum interval per account/game: 300 seconds
Maximum trophy groups accepted per sync: 100
Maximum title trophies accepted per sync: 1000
Maximum user trophy states accepted per sync: 1000
Stale-running-run recovery: 600 seconds
Concurrent running game syncs per account/game: 1
Trigger: authenticated manual action only
```

M5 is lazy by design. Synchronizing one title never deep-hydrates the other 195+ library titles.

The TypeScript service validates exact group/trophy completeness before persistence. PostgreSQL repeats structural/size checks. Failed or inconsistent responses leave last-good rows intact instead of starting repair loops.

No automatic retry loop exists. Errors produce one bounded failed `sync_run` and return control to the owner.

## Storage discipline

TrophyBridge stores compact factual state needed for the product:

- provider IDs;
- localized title/group/trophy text when available;
- platform and upstream image URLs;
- aggregate counters;
- earned state/timestamps;
- rarity/rate and honest numeric progress fields;
- synchronization metadata.

PSN images are referenced by upstream URL and are **not mirrored** into Supabase Storage.

M5 adds text/numeric trophy rows only for games the owner explicitly selects. It does not bulk-fill the entire collection.

## Network discipline

Normal dashboard reads come from PostgreSQL. Opening the library or a game page does not contact PSN.

Current upstream calls happen only after an explicit authenticated sync action and are constrained by server-side cooldown/concurrency/size limits.

Scheduled polling is not allowed unless a later design proves it can remain inside the zero-cost envelope with hard application caps.

## Paid-service rule

Before adding any new external service, the design must answer:

1. Is there a genuinely usable free tier rather than a temporary trial?
2. Can TrophyBridge function without automatic paid overages?
3. What hard application limit protects the quota?
4. What happens when the limit is reached?
5. Can last-good factual state continue to be served?

If these conditions cannot be met, the dependency is not accepted for v0.1.

## Quota pressure behavior

Preferred response order:

```text
reduce refresh frequency
-> tighten per-request bounds
-> disable optional work
-> serve durable last-good state
-> temporarily refuse new sync work
-> redesign the feature
```

Upgrading to a paid tier is **not** an automatic fallback.

## Production checkpoint

The first live M4 sync imported 196 games successfully while remaining well inside the current database envelope.

The M5 production schema adds no paid dependency or binary storage. Before the first live deep trophy import, the detailed tables are intentionally empty because M5 only hydrates selected games.

Supabase post-M5 performance advisories contain only unused-index informational notices. Security advisories include expected RLS-without-policy informational notices on intentionally server-only tables and a separate Auth warning about leaked-password protection; the current TrophyBridge login path uses GitHub OAuth, so that warning is not caused by M5.

## Verification cadence

Re-check the operating envelope:

- before the first Vercel deployment;
- before adding a hosted service;
- before enabling cron/background jobs;
- after material free-plan changes;
- when public refresh behavior is designed;
- during M10 hardening.

The repository documentation must record any change that could create recurring cost.
