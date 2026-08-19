# TrophyBridge Project Handoff

Last updated: 2026-08-19

## Mission

TrophyBridge is a privacy-first bridge between a PlayStation account and AI-assisted platinum tracking. It synchronizes factual trophy state, keeps base-game trophies separate from DLC, and exposes a stable read-only public API that a fresh AI conversation can inspect without screenshots or manual trophy lists.

Initial pilot account: `mrdrage2`.
Initial pilot game: Final Fantasy XVI on PS5.
Repository: `mrdrage/trophybridge`.

## Product boundary

TrophyBridge Core owns factual state: games, trophy groups, trophies, earned state, timestamps, sync status, and share links.

Trophy Intelligence is a later layer. It may add strategy metadata such as missable, story-related, NG+, online, estimated effort, and recommended order. Those facts must not be fabricated from PSN data.

## v0.1 Definition of Done

The MVP is complete when the following real flow works end to end:

1. Sign in to TrophyBridge.
2. Connect the PSN account.
3. TrophyBridge identifies `mrdrage2`.
4. Library sync discovers Final Fantasy XVI.
5. Game sync imports trophy groups, metadata, and earned state.
6. Base-game platinum progress is correct and DLC trophies are excluded from the platinum denominator.
7. A revocable public share link is generated.
8. A brand-new ChatGPT conversation can open the shared API and understand current platinum progress.
9. A newly earned PS5 trophy is detected on the next sync.
10. The new state is visible to the AI client.

## Technology decisions

- TypeScript
- Next.js App Router
- Node.js 22.13+; Node 24 is the pinned CI/development target
- pnpm 11.20.0
- PostgreSQL through Supabase
- Supabase Auth, initially GitHub OAuth
- Zod for runtime validation
- Vitest for unit/integration tests
- Playwright for end-to-end tests
- GitHub Actions for CI
- Vercel planned for deployment
- Community `psn-api` library only behind an internal adapter

## Architecture

```text
PlayStation Network
        |
        v
    PsnProvider
        |
        v
 TrophyBridge Core
        |
        v
   PostgreSQL
    /       \
Dashboard  Public API
               |
               v
              AI
```

Application code must depend on `PsnProvider`, never directly on `psn-api` outside the adapter implementation.

## Planned domain model

Main tables for M1:

- `psn_accounts`
- `games`
- `account_games`
- `trophy_groups`
- `trophies`
- `player_trophies`
- `progress_events`
- `sync_runs`
- `share_links`
- `sync_targets`

Important invariants:

- Sync is idempotent.
- Earned trophy state is monotonic.
- Known valid `earned_at` values are preserved.
- Provider failures never delete previously verified trophy facts.
- One trophy group is the base game; unexpected group types become `unknown` rather than being guessed.
- DLC never contributes to the platinum denominator.
- Public sharing never exposes PSN credentials or server secrets.

## Synchronization design

Library sync is lightweight and imports title-level information only.

Game sync is lazy and imports trophy groups, trophy metadata, and user-earned state for a selected title.

Public reads use persisted data. A future `fresh=1` mechanism may request a bounded refresh while respecting a per-game cooldown and synchronization lock.

`progress_events` records meaningful changes instead of storing full duplicate snapshots. Initial events include `game_discovered`, `trophy_earned`, and `platinum_earned`.

## Authentication and secrets

The planned PSN bootstrap uses NPSSO only transiently. NPSSO is password-equivalent and must never be persisted or logged. Refresh credentials are server-only and encrypted before persistence. The planned encryption primitive is AES-256-GCM with a server-side environment key.

Public share links use high-entropy opaque tokens, are read-only and revocable, and should be non-indexed. The database should retain a one-way token hash where practical.

## Public API contract

Version prefix: `/api/public/v1`.

Planned resources:

- `/share/{token}`
- `/share/{token}/games`
- `/share/{token}/games/{gameId}`
- `/share/{token}/games/{gameId}/trophies`
- `/share/{token}/games/{gameId}/ai-context`

The `ai-context` response is intentionally compact and should include player/game identity, base-game platinum progress, missing base trophies, recent activity, DLC summary, and sync freshness.

A basic foundation health endpoint already exists at `/api/public/v1/health`.

## Privacy rules

Public output is whitelist-based. Allowed categories are limited to the PSN online ID, game/title metadata, trophy metadata, earned state, optional earned dates, progress, and TrophyBridge sync timestamps.

Never expose email addresses, NPSSO, access or refresh tokens, service-role keys, encryption keys, friends lists, device information, or unrelated PSN profile data.

Hidden unearned trophy descriptions should be spoiler-safe by default in the future sharing layer.

## Milestones

- M0 Foundation: skeleton, CI, tests, documentation.
- M1 Domain Model: PostgreSQL schema and migrations.
- M2 PSN Provider: mock adapter and real provider adapter.
- M3 Authentication: PSN connection and encrypted credential lifecycle.
- M4 Library Sync: import PlayStation titles.
- M5 Trophy Sync: trophy groups, earned state, base/DLC separation.
- M6 Progress Events: detect newly earned trophies.
- M7 Public Share: stable revocable read-only links.
- M8 AI Context: compact AI-oriented API.
- M9 Dashboard: production MVP UX.
- M10 Hardening: security, observability, release preparation.

## Current implementation state

M0 contains a Next.js/TypeScript application shell, a public health route, `PsnProvider` domain types, `MockPsnProvider`, Vitest unit coverage, Playwright smoke coverage, ESLint/typecheck/build scripts, GitHub Actions CI, `.env.example`, architecture/API/data-model/security/PSN documentation, and ADRs.

CI is configured to run lint, TypeScript checks, Vitest, a production build, and a Chromium Playwright smoke test. An initial validation run exposed the Node/pnpm compatibility boundary, so M0 now pins Node 24 while allowing Node 22.13+ in the package engine contract.

No real PSN credentials are connected yet. No Supabase production project or database migration is part of M0. No real `psn-api` network calls belong in CI.

## Next milestone

M1 Domain Model.

The next development session should start by translating `docs/DATA_MODEL.md` into Supabase/PostgreSQL migrations, adding constraints and indexes, and writing integration tests for idempotent upserts and monotonic earned state. Do not start real PSN authentication before the domain schema is stable enough to receive normalized provider data.

## Documentation map

- `README.md`: project overview and roadmap
- `docs/ARCHITECTURE.md`: system boundaries and flow
- `docs/API.md`: public API contract
- `docs/DATA_MODEL.md`: planned persistence model
- `docs/SECURITY.md`: security and privacy model
- `docs/PSN_INTEGRATION.md`: provider/auth/sync boundary
- `docs/decisions/`: Architecture Decision Records
- `CHANGELOG.md`: notable changes
- `PROJECT_HANDOFF.md`: continuity document for a fresh development chat
