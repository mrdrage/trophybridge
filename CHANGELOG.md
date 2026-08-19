# Changelog

All notable changes to TrophyBridge will be documented in this file.

The project follows semantic versioning once public releases begin. During the `0.x` phase, breaking changes are still possible.

## [Unreleased]

### Added

- Next.js and TypeScript foundation.
- Public health endpoint under `/api/public/v1/health`.
- Provider-neutral `PsnProvider` contract and deterministic mock implementation.
- Vitest unit testing and Playwright smoke testing.
- GitHub Actions CI for lint, typecheck, tests, build, and browser smoke test.
- Initial architecture, API, data-model, security, and PSN integration documentation.
- Architecture Decision Records for the v0.1 foundation.
- Project handoff document for continuity across development sessions.

### Security

- Environment contract excludes PSN secrets from source control.
- Public API design is read-only and token based.

## [0.1.0] - Unreleased

Target milestone for the first end-to-end TrophyBridge MVP.
