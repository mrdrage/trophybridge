# TrophyBridge Zero-Cost Guardrails

Last verified: 2026-08-20.

## Requirement

TrophyBridge has a hard personal v0.1 operating-cost target of **€0/month**. Under quota or upstream pressure the application must reduce optional work, throttle, serve last-good state or temporarily refuse work rather than require a paid upgrade.

## Hosted envelope

- Supabase Free: PostgreSQL + Auth + server Data API.
- Public GitHub repository + standard GitHub-hosted Actions runners.
- Vercel Hobby planned for deployment.
- PlayStation integration through pinned open-source `psn-api`, with no paid data broker.

No VPS, Redis, queue, image mirror, always-on worker or paid observability dependency is required through M8.

## Library and game bounds

```text
library sync: >=3600s, <=2000 titles, one running/account
game trophy sync: >=300s, <=100 groups, <=1000 trophies, one running/account/game
stale-run recovery: 600s default
```

M6 event detection piggybacks on the same game snapshot and does not add a second provider call path.

## M7 public-share bounds

Normal public reads use durable PostgreSQL state only.

```text
one active share/account
256-bit bearer token, SHA-256 stored
library pagination: default 100, max 200 rows/request
hidden library games excluded
```

## M8 AI-triggered freshness

M8 removes the owner's normal need to press `Sincronizza trofei` by making freshness demand-driven rather than scheduled.

```text
AI_CONTEXT_FRESHNESS_SECONDS=600
AI_CONTEXT_MAX_REFRESHES_PER_HOUR=12
AI_CONTEXT_MAX_MISSING_TROPHIES=200
```

`ai-context?fresh=1` can refresh **one requested game only**. TrophyBridge first reads PostgreSQL. If the snapshot is younger than the freshness threshold, it returns immediately without touching PSN.

If stale, the request must atomically claim from a per-share hourly budget. An allowed claim still passes through the existing game-level 300-second cooldown, database single-flight protection, stale-run recovery and snapshot-size ceilings. A revoked share cannot claim work.

Provider/reauth failure serves durable last-good trophy state whenever it exists. The endpoint never fans out across the 196-title library from one request.

This architecture deliberately trades continuous background freshness for work proportional to actual assistant use. No cron, queue or always-on Mac is required.

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

## Production checkpoint after M8

```text
games/account_games: 196 / 196
FF16 groups/trophies/player rows/earned: 3 / 69 / 69 / 18
progress_events: 1
share_links: 1
active share_links: 1
active share ai_refresh_count immediately after migration: 0
claim_share_ai_refresh: service_role only
```

The M8 schema added only three small refresh-budget fields to `share_links` and one server-only function. It created no recurring job and did not alter factual game/trophy state.

Supabase security advisors remain the expected deny-by-default RLS informational notices plus the pre-existing leaked-password-protection warning; current TrophyBridge login uses GitHub OAuth. Performance findings are unused-index informational notices on the tiny/new dataset.

## Review cadence

Re-check current free-tier terms before first Vercel deployment, before adding any hosted dependency or scheduler, after provider-plan changes, and during M10 hardening.
