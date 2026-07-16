# FlowDB Getting Started

This guide explains how to run FlowDB locally, how to use the Docker setup, and how to explain the project to other people in simple terms.

## What FlowDB is

FlowDB is a git-native database branching platform.

In practice, that means:

- the dashboard lets users sign in with GitHub,
- the orchestrator API creates and manages database branches,
- the CLI is meant for local and automation workflows,
- and the core engine handles the PostgreSQL fork operations.

## What you need before running it

Install these first:

- Bun 1.2 or newer
- Docker and Docker Compose
- A GitHub OAuth App if you want sign-in to work end to end

You also need a PostgreSQL database that the orchestrator can fork from. For local development, the Docker Compose file already provides one.

## Recommended local setup

This is the simplest path if you want to run the repo from your machine.

### 1. Install dependencies

From the repository root:

```bash
bun install
```

### 2. Start Postgres, orchestrator, and dashboard with Docker

The repo includes a compose file that starts all three services:

- Postgres on port `5432`
- Orchestrator on port `3000`
- Dashboard on port `3001`

Run:

```bash
docker compose up --build
```

Then open:

- Dashboard: http://localhost:3001
- Orchestrator: http://localhost:3000

### 3. Fill the dashboard auth environment

For local GitHub sign-in, copy [apps/dashboard/.env.local.example](../apps/dashboard/.env.local.example) to `apps/dashboard/.env.local` and set real values.

At minimum, these values matter:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_ORCHESTRATOR_URL`

If you are only testing the UI and not the real GitHub OAuth callback, the docker-compose values are enough to boot the app. To complete real authentication, use a real GitHub OAuth App.

### 4. Start the apps without Docker, if you prefer

If you want separate dev servers instead of Compose:

```bash
bun run --cwd apps/orchestrator dev
bun run --cwd apps/dashboard dev
```

The dashboard dev server currently listens on port `4010`, while the Docker image exposes it on port `3001`.

## Required environment variables

### Dashboard

The dashboard uses GitHub OAuth through NextAuth. The most important variables are:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_ORCHESTRATOR_URL`
- `NEXT_PUBLIC_FLOWDB_ENVIRONMENT`
- `NEXT_PUBLIC_FLOWDB_ORG_SLUG`
- `NEXT_PUBLIC_FLOWDB_PROJECT_SLUG`
- `NEXT_PUBLIC_FLOWDB_SOURCE_DATABASE_URL`

### Orchestrator

The orchestrator is stricter in production. It expects:

- `SOURCE_DATABASE_URL` or `DATABASE_URL`
- `AUTH_SECRET`
- `GITHUB_WEBHOOK_SECRET`

Optional but useful:

- `VERCEL_API_TOKEN`
- `FLOWDB_API_KEY`
- `FLOWDB_API_KEYS`
- `FLOWDB_API_KEY_OWNER`

## How authentication works right now

The current account flow is GitHub OAuth only.

That means:

- "Sign in" and "Sign up" both use GitHub OAuth.
- There is no email/password form yet.
- After login, the dashboard stores a session token and sends it to the orchestrator as a Bearer token.
- The orchestrator middleware checks that token before allowing protected branch actions.

## How to verify the app is working

You know the basics are working when:

- the dashboard loads at http://localhost:3001 or the local dev port,
- the login page opens GitHub OAuth,
- the dashboard shows a signed-in session,
- and branch creation calls `POST /branches/fork` successfully.

If the dashboard loads but auth fails, check:

- the GitHub OAuth callback URL,
- `NEXTAUTH_URL`,
- `AUTH_SECRET`,
- and the dashboard's `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

If branch creation fails after login, check:

- `NEXT_PUBLIC_ORCHESTRATOR_URL`,
- `SOURCE_DATABASE_URL` or `DATABASE_URL` on the orchestrator,
- and the session token being forwarded from the dashboard.

## How to explain FlowDB to others

Use this short explanation when talking to non-technical people:

FlowDB is a tool that lets teams create temporary database branches, so they can test features safely without touching production data.

Use this slightly more detailed explanation when talking to engineers:

FlowDB sits between a dashboard, an orchestrator API, and a PostgreSQL fork engine. A developer signs in with GitHub, chooses a source database, and FlowDB creates an isolated branch that can be used for testing, preview environments, or per-feature workflows.

Use this one-line pitch for demos:

FlowDB is GitHub-authenticated database branching for teams that want preview-safe PostgreSQL workflows.

## Suggested demo flow

1. Open the dashboard.
2. Sign in with GitHub.
3. Show the branch creation form.
4. Point out the orchestrator URL and environment settings.
5. Create a branch.
6. Show the branch list or health feed.

## If you want the project to feel production-ready

Focus next on these items:

- stable GitHub OAuth setup,
- clear onboarding screens,
- branch ownership and permissions,
- test coverage for auth and branch workflows,
- and deployment-ready secrets management.

For a fuller roadmap, see [docs/PROJECT_STATUS_AND_4_WEEK_PLAN.md](PROJECT_STATUS_AND_4_WEEK_PLAN.md).