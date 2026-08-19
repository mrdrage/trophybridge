# TrophyBridge Zero-Cost Guardrails

Last verified: 2026-08-19.

## Product requirement

TrophyBridge has a hard operating-cost target of **€0/month** for the personal v0.1 deployment.

This means more than choosing free plans. Application behavior must be designed so that normal use is bounded and, if a quota approaches exhaustion, TrophyBridge can throttle, refuse optional work, serve the last valid state, or temporarily stop rather than require a paid upgrade.

Free-tier quotas can change over time, so this document is re-verified before production deployment and whenever a new hosted dependency is introduced.

## Current services

### Supabase

The connected TrophyBridge organization is on the Supabase **Free** plan. On 2026-08-19 the TrophyBridge database was healthy and approximately 11 MB before the first real PSN import.

TrophyBridge currently uses Supabase for:

- PostgreSQL;
- Supabase Auth;
- the Data API through server-side clients.

M4 does not use Supabase Storage for PlayStation artwork, does not use Edge Functions, and does not use paid database add-ons.

### GitHub

The TrophyBridge repository is public. CI uses standard GitHub-hosted runners only. Larger runners are prohibited for the zero-cost deployment unless the product requirement is explicitly changed.

### Vercel

Production deployment is planned for Vercel **Hobby** only. No Pro plan, paid team features, paid add-ons, or paid observability products are part of the architecture.

M4 does not require Vercel Cron. Library synchronization is an authenticated manual action.

### PlayStation integration

TrophyBridge uses the pinned open-source `psn-api` adapter and does not depend on a paid PSN data broker.

## M4 application guardrails

Library synchronization is deliberately bounded:

```text
Default minimum interval per account: 3600 seconds
Maximum titles accepted per sync: 2000
Stale-running-run recovery: 600 seconds
Dashboard library rows per read: 12 by default, hard bounded to 50
Concurrent running library syncs per account: 1
```

The 2,000-title ceiling exists at both the TypeScript service layer and PostgreSQL persistence layer. An oversized response is rejected before library state is written.

A successful library snapshot does not delete titles omitted by a later PSN response. This lets TrophyBridge serve last-good factual data instead of repeatedly performing expensive recovery imports.

No automatic retry loop exists. A provider error records a bounded failed sync run and returns control to the user.

## Storage discipline

M4 stores only compact factual metadata and counters needed by the product:

- provider game identity;
- title and platform metadata;
- upstream icon URL;
- aggregate progress and trophy counts;
- hidden state;
- provider/update synchronization timestamps.

Images are **not copied into Supabase Storage**. This avoids unnecessary storage and bandwidth multiplication.

M5 and later milestones must continue to prefer normalized text/numeric state over duplicating upstream binary assets.

## Network discipline

Normal reads come from PostgreSQL. They must not call PSN merely because a dashboard or future public endpoint is opened.

Refreshes must be explicit or bounded by server-side freshness/cooldown rules. Public clients must never be able to trigger unbounded upstream synchronization.

Scheduled polling is not allowed unless a later design proves it can remain inside the zero-cost envelope with a hard application-level cap.

## Paid-service rule

Before adding a new external service, the implementation must answer all of the following:

1. Is there a genuinely usable free tier, not only a temporary trial?
2. Can TrophyBridge function without enabling automatic paid overages?
3. What application-level hard limit protects the quota?
4. What happens when the limit is reached?
5. Can the system continue serving last-good factual data or degrade safely?

If these conditions cannot be met, the service is not accepted for v0.1.

## Quota pressure behavior

If usage grows unexpectedly, the preferred response order is:

```text
reduce refresh frequency
-> bound/paginate reads more aggressively
-> disable optional background work
-> serve cached/last-good factual state
-> temporarily refuse new sync work
-> redesign the feature
```

Upgrading to a paid tier is **not** an automatic fallback.

## Verification cadence

Re-check the operating envelope:

- before the first Vercel production deployment;
- before adding a new hosted service;
- before enabling cron/background jobs;
- after material changes to Supabase/Vercel/GitHub free-plan rules;
- during M10 hardening.

The repository documentation must record any change that could create a recurring cost.
