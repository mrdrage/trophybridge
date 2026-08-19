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
- Architecture Decision Records for the v0.1 foundation and database invariants.
- Project handoff document for continuity across development sessions.
- M1 PostgreSQL/Supabase domain migrations for accounts, games, trophy groups, trophies, player state, synchronization, progress events, share links, and sync targets.
- Database constraints and indexes for provider identity, one base trophy group per game, title-wide trophy IDs, cross-entity integrity, valid progress ranges, and event deduplication.
- Database-level monotonic earned-state protection with preservation of the earliest known valid trophy timestamp.
- PostgreSQL integration tests running against a disposable PostgreSQL 17 service in CI.
- Row Level Security enabled on every application table in the exposed `public` schema.

### Changed

- `docs/DATA_MODEL.md` is now the definitive documented representation of the executable M1 schema rather than a provisional plan.
- The next implementation milestone is M2 · PSN Provider.

### Security

- Environment contract excludes PSN secrets from source control.
- Public API design is read-only and token based.
- Public application tables use deny-by-default RLS until owner-scoped policies are introduced with authentication in M3.
- Critical trophy facts are protected at the persistence boundary even if an application writer later sends regressive data.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
