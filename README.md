# TrophyBridge

A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.

TrophyBridge synchronizes factual PlayStation trophy state, separates base-game progress from additional trophy groups, and is being built to expose a stable read-only API that an AI assistant can use to guide a player toward a platinum.

> Status: **M3 · Authentication complete**. The production Supabase schema is applied. Live activation still requires GitHub OAuth provider credentials and deployment secrets. The next implementation milestone is **M4 · Library Sync**.

## MVP goal

The first release is complete when a user can sign in, connect a PSN account, synchronize a game such as Final Fantasy XVI, expose a revocable public share link, and let a fresh AI conversation understand current platinum progress without screenshots or manual trophy lists.

## Architecture

```text
GitHub OAuth -> Supabase Auth
                    |
                    v
User -> private TrophyBridge dashboard -> transient NPSSO bootstrap
                                      |
                                      v
                              PSN authorization
                                      |
                              encrypted refresh token
                                      |
                                      v
PlayStation Network -> PsnApiProvider -> PsnProvider -> TrophyBridge Core
                                                        |
                                                        v
                                                   PostgreSQL
                                                    /      \
                                             Dashboard    Public API
                                                            |
                                                            v
                                                           AI
```

## Core principles

- Secrets never enter the public API or repository.
- NPSSO is bootstrap-only and is never persisted.
- PSN access tokens are short-lived runtime values and are never persisted.
- The durable PSN refresh token is encrypted server-side with AES-256-GCM, account-bound authenticated data, and key versioning.
- Application code depends on `PsnProvider`, not raw `psn-api` payloads.
- External provider payloads are runtime-validated.
- Base-game and additional trophy groups are structurally separated.
- Unsupported provider data stays `null`/unknown rather than being invented.
- Trophy state is monotonic at the persistence layer.
- Public sharing will be read-only, revocable, non-indexed, and token based.

## Stack

- TypeScript
- Next.js App Router and `proxy.ts`
- pnpm 11.20.0
- PostgreSQL via Supabase
- Supabase Auth + `@supabase/ssr`
- GitHub OAuth for TrophyBridge sign-in
- `psn-api` 2.18.1 behind `PsnApiProvider`
- AES-256-GCM through Node.js `crypto`
- Zod
- Vitest
- Playwright
- GitHub Actions
- Vercel planned for deployment

## Local development

Requirements: Node.js 22.13+ (Node 24 recommended and pinned by `.node-version`) and pnpm 11.20.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Application gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Database invariant suite:

```bash
DATABASE_URL=postgresql://... pnpm test:db
```

## M3 environment contract

Required for live authentication:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TOKEN_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY_VERSION
APP_URL
```

Optional during encryption-key rotation:

```text
TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON
```

Trophy metadata locale defaults to:

```text
PSN_TROPHY_LOCALE=it-IT
```

The encryption key must decode from base64 to exactly 32 bytes. Real values belong only in local/deployment secret stores, never in Git.

## Authentication flow

1. The TrophyBridge user signs in through GitHub OAuth backed by Supabase Auth.
2. An authenticated private dashboard accepts the PSN Online ID and NPSSO.
3. The server exchanges NPSSO for PlayStation tokens.
4. TrophyBridge resolves the exact Online ID and verifies the returned PSN profile is the authenticated account (`isMe=true`).
5. NPSSO is discarded.
6. The refresh token is encrypted and persisted server-side; the access token remains in memory only.
7. Later operations decrypt the refresh token, obtain a new short-lived access token, re-encrypt any rotated refresh token, and construct `PsnApiProvider` with the saved locale.
8. Disconnect removes the credential without deleting already normalized trophy data.

Private routes:

```text
POST /api/private/v1/psn/connect
GET  /api/private/v1/psn/status
POST /api/private/v1/psn/refresh
POST /api/private/v1/psn/disconnect
```

All private authentication responses are non-cacheable.

## Supabase state

The real Supabase project now has the M1 domain model, M1 integrity refinements, M3 authentication schema, and M3 database hardening applied. Browser access remains deny-by-default except for the owner-scoped non-secret `psn_accounts` read policy. Credential ciphertext remains server-only.

Supabase advisors were checked after migration. Security reports only the intentional RLS-without-policy informational notices on server-only/deny-by-default tables. Performance warnings for missing foreign-key indexes and per-row `auth.uid()` evaluation were fixed; remaining notices are unused-index informational messages expected on a new empty database.

Live activation still needs GitHub OAuth to be enabled in the Supabase Auth provider settings and the deployment environment values above. No OAuth client secret, service-role key, PSN credential, or encryption key belongs in this repository.

## Development roadmap

- ✅ **M0 Foundation**: project skeleton, CI, tests, documentation.
- ✅ **M1 Domain Model**: PostgreSQL schema, migrations, constraints, RLS, and database invariant tests.
- ✅ **M2 PSN Provider**: mapping, pagination, validation, fixtures, error normalization, and real adapter.
- ✅ **M3 Authentication**: Supabase SSR auth, PSN connection lifecycle, encrypted durable refresh credentials, private routes, tests, and production Supabase schema.
- **M4 Library Sync**: import PlayStation games into the M1 persistence model.
- **M5 Trophy Sync**: groups, trophies, earned state, and base/additional separation.
- **M6 Progress Events**: detect newly earned trophies.
- **M7 Public Share**: stable revocable read-only URLs.
- **M8 AI Context**: compact API for AI-assisted platinum guidance.
- **M9 Dashboard**: production MVP UX.
- **M10 Hardening**: security review, observability, release documentation.

## Persistence

M1 creates the factual trophy model. M3 adds `psn_credentials`, a server-only one-to-one credential record for each connected `psn_accounts` row, plus `preferred_locale` on the account. Browser roles can read only their own non-secret connection metadata; browser roles have no privilege on credential ciphertext.

See [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md), [`docs/SECURITY.md`](./docs/SECURITY.md), and [`docs/PSN_INTEGRATION.md`](./docs/PSN_INTEGRATION.md).

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/API.md`](./docs/API.md)
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/PSN_INTEGRATION.md`](./docs/PSN_INTEGRATION.md)
- [`docs/decisions/`](./docs/decisions)
- [`CHANGELOG.md`](./CHANGELOG.md)
- [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md)

## Disclaimer

TrophyBridge is an independent project and is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment or PlayStation. The PSN integration is isolated because community-documented interfaces can change.
