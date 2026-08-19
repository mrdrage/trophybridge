# Changelog

All notable changes to TrophyBridge will be documented in this file.

The project follows semantic versioning once public releases begin. During the `0.x` phase, breaking changes are still possible.

## [Unreleased]

### Added

- Next.js and TypeScript foundation.
- Public health endpoint under `/api/public/v1/health`.
- Provider-neutral `PsnProvider` contract and deterministic mock implementation.
- Vitest unit testing and Playwright smoke testing.
- GitHub Actions CI for lint, typecheck, tests, build, browser smoke test, and PostgreSQL domain verification.
- Initial architecture, API, data-model, security, and PSN integration documentation.
- Architecture Decision Records for the v0.1 foundation, database invariants, and PSN adapter/versioning boundary.
- Project handoff document for continuity across development sessions.
- M1 PostgreSQL/Supabase domain migrations for accounts, games, trophy groups, trophies, player state, synchronization, progress events, share links, and sync targets.
- Database constraints and indexes for provider identity, one base trophy group per game, title-wide trophy IDs, cross-entity integrity, valid progress ranges, and event deduplication.
- Database-level monotonic earned-state protection with preservation of the earliest known valid trophy timestamp.
- PostgreSQL integration tests running against a disposable PostgreSQL 17 service in CI.
- Row Level Security enabled on every application table in the exposed `public` schema.
- M2 `PsnApiProvider` implementation over an exact pinned `psn-api` dependency.
- Runtime-validated mapping for title lists, trophy groups, trophy metadata, and user trophy state.
- Pagination handling for title and trophy endpoints, including repeated-offset protection.
- PS5 `trophy2` and legacy `trophy` service propagation.
- Base/DLC/unknown trophy-group classification and shared-platform normalization.
- Provider error normalization with stable retryability semantics.
- Configurable `Accept-Language` propagation for PSN trophy calls.
- Sanitized PSN fixture payloads and unit/contract coverage with no live PSN access in CI.
- Versioned `pnpm-lock.yaml` for reproducible dependency resolution.

### Changed

- `docs/DATA_MODEL.md` is the definitive documented representation of the executable M1 schema rather than a provisional plan.
- `docs/PSN_INTEGRATION.md` now documents the implemented M2 adapter contract, provider limitations, and test strategy.
- `PsnProvider` now carries aggregate trophy counts, group kind, rarity, earned rate, and conservative progress fields needed by later sync milestones.
- `psn-api` is pinned to `2.18.1`; future upgrades require explicit contract validation.
- CI dependency installation now uses `pnpm install --frozen-lockfile`.
- Unsupported current numeric trophy progress remains `null` rather than being inferred from a PS5 progress target.
- The next implementation milestone is M3 · Authentication.

### Security

- Environment contract excludes PSN secrets from source control.
- Public API design is read-only and token based.
- Public application tables use deny-by-default RLS until owner-scoped policies are introduced with authentication in M3.
- Critical trophy facts are protected at the persistence boundary even if an application writer later sends regressive data.
- M2 automated tests use fabricated provider identities and never require NPSSO, access tokens, refresh tokens, or live PlayStation Network calls.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
