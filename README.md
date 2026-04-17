# FamPlan

FamPlan is a family coordination web app built for one clear job: help a small family remember plans, handle short-notice activities, and keep shared household context in one place without becoming a generic chat app.

## Stack

- `Next.js` App Router + `TypeScript`
- `Tailwind CSS` + lightweight shadcn-style UI primitives
- `Supabase` for auth, Postgres, realtime, and row-level security
- `Drizzle ORM` + SQL migrations
- `Inngest` for reminders and notification fan-out
- `Resend` for email fallback notifications

## Current State

This repo is production-shaped and runs in a safe local `demo mode` by default. That means:

- the app boots and renders a realistic family workspace immediately
- domain services, schema, migrations, env handling, and notification plumbing are in place
- real Supabase, Inngest, and Resend credentials can be added later without rewriting the app structure

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

See [CONTRIBUTING.md](/home/roman/dev-env/famplan/CONTRIBUTING.md:1) for the branching and release workflow.

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

The initial SQL lives in [supabase/migrations/0000_famplan_initial.sql](/home/roman/dev-env/famplan/supabase/migrations/0000_famplan_initial.sql:1), and the Drizzle schema lives in [src/lib/drizzle/schema.ts](/home/roman/dev-env/famplan/src/lib/drizzle/schema.ts:1).

## Next Steps

1. Provision Supabase, Resend, and Inngest.
2. Apply the SQL migrations, including the profile visibility policy.
3. Add pod creation and invite acceptance for authenticated users with no membership yet.
4. Add authenticated event mutations so the live pod composer writes through to Postgres.
