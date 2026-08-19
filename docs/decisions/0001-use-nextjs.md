# ADR 0001: Use Next.js for the application shell

**Status:** Accepted

## Context

TrophyBridge needs a small dashboard and versioned server-side HTTP endpoints in one deployable application.

## Decision

Use Next.js App Router with TypeScript. Route Handlers host the API and React server/client components host the dashboard.

## Consequences

- UI and API share one codebase and deployment.
- Server-only boundaries remain available for secrets.
- TrophyBridge is coupled to Next.js conventions, so domain and provider logic must remain outside framework-specific UI code.
