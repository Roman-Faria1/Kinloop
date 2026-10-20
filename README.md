# Kinloop

Kinloop (originally FamPlan) is a family coordination web app built for one clear job: help a small family remember plans, handle short-notice activities, and keep shared household context in one place without becoming a generic chat app.

## Continuing Work

Start with [HANDOFF.md](HANDOFF.md) when resuming on another device, with another model, or in a new chat. It records the architecture, decisions, deployment setup, active work, open issues, and a reusable session-start prompt. [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) point coding agents to the same shared context.

## Stack

- `Next.js` App Router + `TypeScript`
- `Tailwind CSS` + lightweight shadcn-style UI primitives
- `Supabase` for auth, Postgres, realtime, and row-level security
- `Drizzle ORM` + SQL migrations
- `Inngest` for reminders and notification fan-out
- `Resend` for email fallback notifications

## Current State

The app supports real Supabase auth, pod creation/invites, and persisted event create/edit/cancel flows. Without Supabase configuration, it falls back to seeded `demo mode`.

- the app boots and renders a realistic family workspace immediately
- real mode reads/writes pods and events through Supabase with server-side permission checks
- the reminder scheduling branch persists delivery work; actual notification sending remains unfinished

See the dated checkpoint in [HANDOFF.md](HANDOFF.md) for which work is merged versus still in review. Deployed infrastructure is not proof that every integration is complete.

## Scripts

- `npm run dev` - start the app
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript checks
- `npm run test` - run Vitest with coverage
- `npm run test:e2e` - run Playwright tests
- `npm run db:generate` - generate Drizzle migrations
- `npm run db:studio` - open Drizzle Studio
- `npm run inngest:dev` - run Inngest locally against the app

## Team Process

The repo uses:

- trunk-based development with short-lived feature branches
- Conventional Commits for commit messages
- milestone-oriented `0.x` semantic version tags once the app is deployable

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching and release workflow.

## Environment

Copy `.env.example` to `.env.local` when you are ready to connect real services.

Important variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_RATE_LIMIT_SALT`
- `DATABASE_URL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `RESEND_API_KEY`

If Supabase env vars are missing, the UI falls back to seeded demo data.

For Supabase auth to work locally:

- add `http://127.0.0.1:3000/auth/callback` to the project's redirect URLs
- add `http://localhost:3000/auth/callback` too if you use that host in development
- add `https://app.kinloop.dev/auth/callback` for production
- set `NEXT_PUBLIC_APP_URL` to the canonical app origin for each environment, such as `http://localhost:3000` locally and `https://app.kinloop.dev` in production
- Supabase's built-in mailer is heavily rate limited for development, so configure custom SMTP before relying on repeated magic-link tests
- use the sign-in page to request a magic link once env vars are configured and SMTP is ready

Security defaults in the current build:

- invite-only magic-link requests
- rate limiting for magic-link requests by email and IP hash
- noindex headers and `robots.txt` disallow while the product is still private
- security headers for framing, MIME sniffing, and browser permissions

## Domain Model

- `pods`
- `pod_memberships`
- `profiles`
- `invites`
- `events`
- `event_assignments`
- `event_reminders`
- `notification_channels`
- `notification_deliveries`

The initial SQL lives in [supabase/migrations/0000_famplan_initial.sql](supabase/migrations/0000_famplan_initial.sql), and the Drizzle schema lives in [src/lib/drizzle/schema.ts](src/lib/drizzle/schema.ts). Apply subsequent SQL migrations in order for each environment; see the migration inventory in [HANDOFF.md](HANDOFF.md).

## Next Steps

1. Finish the reminder scheduling PR's remaining write-consistency review items.
2. Add notification enrollment/preferences and reliable reminder delivery.
3. Continue pod/member management and profile editing in focused branches.

Check [HANDOFF.md](HANDOFF.md) and current GitHub issues/PRs before selecting the next task.
