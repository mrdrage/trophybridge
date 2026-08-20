# TrophyBridge Zero-Cost Guardrails

Last verified: 2026-08-20.

## Requirement

TrophyBridge has a hard personal v0.1 operating-cost target of **€0/month**. If quota pressure appears, application behavior must reduce optional work, throttle, serve last-good state or temporarily refuse work rather than require a paid upgrade.

## Hosted envelope

- Supabase Free: PostgreSQL + Auth + server Data API.
- Public GitHub repository + standard GitHub-hosted Actions runners.
- Vercel Hobby planned for deployment.
- PlayStation integration through pinned open-source `psn-api`, with no paid data broker.

No paid add-on, VPS, Redis, queue, object-image mirror, background worker or external observability product is required through M7.

## M4 library bounds

```text
manual trigger
minimum successful-sync interval: 3600 s
maximum titles: 2000
stale-run recovery: 600 s
one running library sync/account
dashboard overview bounded
```

## M5/M6 game-trophy bounds

```text
manual/private trigger through M7
minimum interval per account/game: 300 s
maximum groups: 100
maximum title trophies: 1000
maximum player trophy states: 1000
stale-run recovery: 600 s
one running sync/account/game
```

M6 event detection piggybacks on the same game snapshot. It adds no second PSN call path, scheduler or queue.

## M7 public-share bounds

M7 public GETs read durable PostgreSQL state only and **never contact PSN**.

```text
one active share/account
256-bit bearer token, SHA-256 stored
library pagination: default 100, max 200 rows/request
o public refresh in M7
no ai-context refresh in M7
last_used_at telemetry: best-effort, coarse interval
```

A public client therefore cannot turn one HTTP request into a full-library PSN crawl. Hidden games are excluded before serialization.

M7 does not automatically create a share link during migration. The owner must explicitly generate one.

## M8 accepted direction

The owner does not want to press `Sincronizza trofei` forever. The preferred zero-cost design is **on-demand AI-triggered freshness**, not continuous polling.

`ai-context?fresh=1` will be allowed to refresh at most one requested game, only when stale and when the existing 300-second cooldown/single-flight gates allow it. A fresh-enough request will return cached durable state without touching PSN. Provider failure serves last-good state when available.

This aligns work with actual assistant usage and avoids an always-on worker or Mac.

Optional background automation can be evaluated later, but it is not accepted if it creates uncontrolled quota usage.

## Storage discipline

Persist compact factual text/numeric state and upstream artwork URLs. Do not mirror PlayStation images into Supabase Storage. Public sharing stores only token hashes, not plaintext URLs.

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

## Production checkpoint after M7

```text
games/account_games: 196 / 196
FF16 groups/trophies/player rows/earned: 3 / 69 / 69 / 18
progress_events: 1
share_links immediately after M7 migration: 0
active share links: 0
```

The M7 schema therefore introduced negligible persistent data and no recurring job.

Supabase security advisors remain the expected deny-by-default RLS informational notices plus the pre-existing leaked-password-protection warning; current TrophyBridge login uses GitHub OAuth. Performance advisor findings remain unused-index informational notices on a very small/new dataset.

## Review cadence

Re-check current free-tier terms before first Vercel deployment, before adding any hosted dependency or scheduler, when M8 public freshness is implemented, after material provider-plan changes, and during M10 hardening.
