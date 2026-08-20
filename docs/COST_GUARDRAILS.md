# TrophyBridge Zero-Cost Guardrails

Last verified: 2026-08-20.

## Requirement

TrophyBridge has a hard personal v0.1 operating-cost target of **€0/month**. Under quota or upstream pressure the application must reduce optional work, throttle, serve last-good state or temporarily refuse work rather than require a paid upgrade.

## Hosted envelope

- Supabase Free: PostgreSQL + Auth + server Data API.
- Public GitHub repository + standard GitHub-hosted Actions runners.
- Vercel Hobby hosting at `https://trophybridge.vercel.app`.
- PlayStation integration through pinned open-source `psn-api`, with no paid data broker.

The hosted production path has been activated and GitHub OAuth has been validated without localhost. The Mac is now a development machine only, not a runtime dependency.

No VPS, Redis, queue, image mirror, always-on worker, paid rate-limit store, paid observability service, paid database, premium GitHub runner or custom-domain purchase is required for v0.1.

## Library and game bounds

```text
library sync: >=3600s, <=2000 titles, one running/account
game trophy sync: >=300s, <=100 groups, <=1000 trophies, one running/account/game
stale-run recovery: 600s default
```

M6 event detection piggybacks on the same game snapshot and does not add a second provider call path.

## Public-share bounds

Normal public reads use durable PostgreSQL state only.

```text
one active share/account
256-bit bearer token, SHA-256 stored
library pagination: default 100, max 200 rows/request
hidden library games excluded
```

## AI-triggered freshness

Demand-driven freshness removes the owner's normal need to press the private trophy-sync button while avoiding a scheduled background worker.

```text
AI_CONTEXT_FRESHNESS_SECONDS=600
AI_CONTEXT_MAX_REFRESHES_PER_HOUR=12
AI_CONTEXT_MAX_MISSING_TROPHIES=200
```

`ai-context?fresh=1` can refresh **one requested game only**. TrophyBridge first reads PostgreSQL. If the snapshot is younger than the freshness threshold, it returns immediately without touching PSN.

If stale, the request must atomically claim from a per-share hourly budget. An allowed claim still passes through the existing game-level cooldown, database single-flight protection, stale-run recovery and snapshot-size ceilings. A revoked share cannot claim work.

Provider/reauth failure serves durable last-good trophy state whenever it exists. One public request never fans out across the 196-title pilot library.

## M9/M10 hosted cost posture

The visual dashboard, hosted OAuth fix, PSN refresh-rotation correction and M10 hardening add no recurring compute job. Browser security headers, origin validation, narrower PostgreSQL privileges, robots controls and Dependabot are code/repository controls rather than paid runtime infrastructure.

M10 deliberately does not add distributed Redis/IP rate limiting. High-entropy revocable capabilities, a database-backed per-share refresh budget, one-game cooldown/single-flight controls and Vercel's normal edge protections are sufficient for the small personal v0.1 workload. If abuse ever makes those controls inadequate, the first response is to reduce or disable public freshness rather than buy infrastructure automatically.

## Storage discipline

Persist compact factual text/numeric state and upstream artwork URLs. Do not mirror PlayStation images into Supabase Storage. Public sharing stores only token hashes, not plaintext capability URLs.

## Quota-pressure response order

```text
reduce refresh frequency
-> tighten per-request bounds
-> disable optional freshness
-> serve durable last-good state
-> temporarily refuse sync work
-> redesign feature
```

Automatic paid upgrade is never the fallback.

## Production checkpoint

The pilot remains compact: 196 known library games, only the explicitly hydrated game's trophy rows, one progress event and one active share capability at the M10 review. M10 changes privileges and request security but does not duplicate factual game/trophy data or create a new storage stream.

Supabase performance advisors currently report informational unused-index findings on the small dataset. Security advisors include expected no-policy notices on intentionally server-only RLS tables and a leaked-password-protection warning; TrophyBridge v0.1 owner login uses GitHub OAuth.

## Review cadence

Re-check current free-tier terms before adding any new hosted dependency or scheduler, after provider-plan changes, before enabling a new background behavior, and at each public release. Any change that can create a mandatory monthly bill requires an explicit architecture decision first.
