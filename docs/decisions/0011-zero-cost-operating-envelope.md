# ADR 0011: Zero-Cost Operating Envelope

- Status: Accepted
- Date: 2026-08-19

## Context

TrophyBridge is a personal service whose operating-cost requirement is €0/month. Selecting free plans alone is insufficient because an application can still waste quota through unbounded synchronization, storage duplication, background polling, or accidentally enabling paid infrastructure.

The current hosted architecture is Supabase Free for persistence/authentication, a public GitHub repository with standard Actions runners, and a future Vercel Hobby deployment.

## Decision

TrophyBridge treats zero recurring cost as an architectural invariant for v0.1.

Hosted dependencies must have a usable free tier and a safe behavior when free capacity is exhausted. Application code must add hard bounds where user actions or upstream responses could amplify resource usage.

For M4 specifically:

- library synchronization is manual;
- successful library syncs are rate-limited to once per hour per account by default;
- one account may have only one running library sync;
- a provider response larger than 2,000 titles is rejected in both application and database layers;
- dashboard library reads are bounded;
- PSN artwork remains referenced by upstream URL rather than copied into object storage;
- there is no cron or automatic polling;
- partial/upstream failures preserve last-good library data and do not trigger automatic retry loops.

A paid plan or paid add-on is never an automatic recovery mechanism. Quota pressure should first reduce optional work, throttle synchronization, serve last-good state, or stop new synchronization.

## Consequences

The service can be less fresh during quota pressure, and some future convenience features may be intentionally delayed or constrained. This is acceptable because factual correctness, privacy, and zero recurring cost have priority over aggressive refresh frequency.

Free-plan terms can change. Therefore the cost envelope must be re-verified before production deployment, before adding hosted dependencies, before enabling background schedules, and during M10 hardening.

## Rejected alternatives

### Aggressive scheduled synchronization

Rejected because continuous polling consumes hosting/database/network quota even when the owner is not using TrophyBridge.

### Mirroring PSN images into TrophyBridge storage

Rejected for v0.1 because it duplicates binary storage and bandwidth without improving the factual trophy model.

### Automatically upgrade when quotas are reached

Rejected because it violates the product's €0/month requirement.
