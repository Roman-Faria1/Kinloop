# Kinloop Project Handoff

Last reviewed: 2026-10-20. This document combines repository inspection, the prior development conversation, and a live GitHub check on that date. Treat branch, PR, deployment, and account state as a dated snapshot and recheck it when resuming.

## Start Here In A New Session

Read this file and [CONTRIBUTING.md](CONTRIBUTING.md), then inspect the checkout before changing anything:

```bash
git status --short --branch
git log -8 --oneline --decorate
git diff --stat
```

Check the active PR and unresolved review threads if GitHub access is available. Local `origin/*` references can be stale; fetching updates those references but does not deploy or merge anything. Do not assume this checkout, another device, and production are on the same commit.

Suggested opening message for another model/device:

```text
Read AGENTS.md, HANDOFF.md, and CONTRIBUTING.md in this repository.
Verify the current branch, working tree, and active PR before editing.
Summarize the immediate unfinished work and continue with the task I specify.
Treat the handoff's snapshot as dated; check current files and GitHub state.
I usually handle commits, pushes, PR comments, and merges myself, so give me
exact commands and paste-ready replies unless I explicitly delegate them.
Do not read or print secret env values or authenticated callback URLs.
```

## Product And Decisions

Kinloop is a small family/friends coordination app: shared family pods, an agenda-first mobile workspace, planned events, short-notice plans, birthdays, and reminders. It is not intended to become a generic chat app.

The original name was FamPlan. The canonical repository is [Roman-Faria1/Kinloop](https://github.com/Roman-Faria1/Kinloop). Package names, UI copy, the local folder name, and Inngest identifiers still contain `famplan`/`FamPlan`; a complete rename has not happened. Older Git remote URLs can still say `Famplan`. Verify the remote before treating that as a broken repository.

Agreed scope includes in-app pod administration so normal operations do not require SQL: creating pods, invitations, and eventually member/role/settings management. A global operator console, impersonation, and unrestricted cross-family administration are deferred.

Security and a professional rollout matter to the owner. Hosting exists, but that does not mean a public launch or completed security audit. Keep existing access checks, private indexing defaults, and deployment configuration deliberate.

## Current Checkpoint

Verified locally on 2026-10-20:

| Item | State |
| --- | --- |
| Branch | `feat/reminder-scheduling-side-effects` |
| Baseline before the atomic mutation fix | `a8f9a2c` - `docs: add shared project handoff for agents and devices`; use `git log` for current HEAD |
| Previous feature commit | `390ac96` - `feat: schedule reminder deliveries from event writes` |
| Local `main` and cached `origin/main` | `3ebf36c` - merge of PR #12 |
| Transaction fix | Prepared for publication as `fix: make event and reminder updates atomic`; check Git and PR head for publication status |
| Active PR | [#13: schedule reminder deliveries from event writes](https://github.com/Roman-Faria1/Kinloop/pull/13), open and unmerged at the last live check; recheck current CI and review state |
| SQL migration `0005` | Owner reported applying it in Supabase SQL Editor; not independently checked against the database |
| SQL migration `0006` | Owner reported running it in Supabase and confirming the function exists via SQL Editor; runtime integration not independently checked |

PR #13's original six comments were addressed in `0a4072e` and are resolved on GitHub. Four concerned fake timers; the other two concerned restoring cancelled deliveries and rejecting edits to cancelled events.

**Three newer review concerns are addressed by the atomic mutation fix; check GitHub for current thread status:**

1. `updateEventForPod()` saves the event before saving its reminder rule/schedule. A later failure returns an error although the event update remains committed.
2. `cancelEventForPod()` saved cancellation before suppressing delivery rows. A suppression failure likewise returned an error after the event changed. The transaction now rolls back both writes on failure.
3. The cancelled-event edit guard tries to clean up deliveries before returning `409`. Cleanup failure can turn that expected conflict into `500`.

The fix uses `public.mutate_pod_event_with_reminders` from migration `0006_atomic_event_mutations.sql`. Update and cancel run as single database transactions, lock the target event, and recheck actor membership/permissions. Updates include the reminder rule and delivery reschedule; cancellation includes pending-delivery suppression. Failures roll back all writes. Cancelled edits reject with `409` without delivery cleanup, including the transaction's state recheck.

The RPC is `SECURITY INVOKER`, callable by `service_role` only, with an explicit empty search path. Server code supplies the user ID from the verified viewer session. Event creation still uses the prior TypeScript scheduler and compensating delete on failure; do not claim every lifecycle write is now transactional.

Next gate: confirm the atomic fix is published to PR #13, review replies are posted, and CI passes for that exact head before merging. The owner reported applying migration `0006`; a production smoke test still needs the corresponding deployed code. Database changes were not run by the agent.

## Implemented Versus Planned

| Area | Implemented in inspected checkout | Remaining |
| --- | --- | --- |
| Authentication | Supabase magic links, server session cookies/refresh, sign-out, protected routes | Further deployment/security validation as the app grows |
| Sign-in gate | Server endpoint checks normalized exact email against profiles or active invites; hashed email/IP rate tracking; honeypot | CAPTCHA and stronger abuse controls were discussed, not implemented |
| Onboarding | `/welcome` creates a pod/owner membership or accepts an invite | Broader pod settings and member administration |
| Invitations | Create/reuse, copy link, revoke, accept; tokenless join recovery for signed-in invited email | Invite email delivery/resend from app code |
| Events | Persistent create/edit/cancel, location and reminder timing, server permission checks | Assignments and richer editing |
| Profiles | Read data and derive birthday agenda entries | Profile/birthday/address editing UI |
| Reminder scheduling | PR #13 writes pending deliveries for enabled channels, suppresses obsolete pending rows, restores cancelled matching rows; local transaction fix for update/cancel | Apply/deploy transaction migration and finish PR #13 review; integrate actual delivery |
| Notifications | Delivery/channel tables and an Inngest schedule-computation placeholder | Channel enrollment/preferences, push subscriptions, send worker, retries, delivery outcomes |
| Realtime | Supabase is available in the stack | No active subscription flow found; the readiness flag alone is not evidence of realtime updates |

Only existing enabled `notification_channels` rows produce scheduled deliveries. No channel enrollment/write flow was found, so a new pod can legitimately produce zero deliveries. This scheduling feature does not itself send mail or push notifications.

## Code Map

Paths below are relative to the repository root so they work on other devices.

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Landing page; session-dependent primary action |
| `src/app/sign-in/page.tsx`, `src/components/auth/sign-in-form.tsx` | Magic-link UI and configuration gating |
| `src/app/api/auth/request-magic-link/route.ts` | Config check, rate/allowlist checks, Supabase OTP request |
| `src/app/auth/callback/route.ts` | Code exchange, token-hash verification, or browser bridge for URL fragments |
| `src/app/api/auth/complete-implicit/route.ts` | Origin/state-cookie check, session creation, home destination |
| `src/domains/auth/session.ts`, `src/domains/auth/roles.ts` | Viewer identity, redirect-path helper, shared role rules |
| `middleware.ts` | Supabase cookie refresh and security/indexing headers |
| `src/app/welcome/page.tsx`, `src/components/welcome/welcome-onboarding.tsx` | Pod creation and pending-invite acceptance |
| `src/app/join/[podId]/page.tsx` | Token link validation or signed-in email/pod token recovery |
| `src/domains/pods/service.ts` | Pod/invite writes, membership checks, profile preparation |
| `src/domains/pods/repository.ts` | Session-aware Supabase reads and dashboard mapping |
| `src/components/dashboard/pod-workspace.tsx` | Main agenda/composer/invite/delivery UI; demo mode uses local state |
| `src/domains/events/mutations.ts` | Persistent event writes and scheduling side effects |
| `supabase/migrations/0006_atomic_event_mutations.sql` | Atomic update/cancel RPC; server-only execution, permission/state rechecks, and reminder synchronization |
| `src/domains/events/atomic-mutations.test.ts` | PGlite PostgreSQL tests loading migrations and injecting failures to verify rollback and role restrictions |
| `src/domains/events/service.ts`, `src/domains/profiles/service.ts` | Upcoming agenda and derived birthday entries |
| `src/domains/reminders/service.ts`, `src/domains/reminders/scheduling.ts` | Due-time/dedupe helpers and delivery persistence |
| `src/domains/notifications/workflows.ts`, `src/app/api/inngest/route.ts` | Inngest placeholder; returns schedules rather than delivering them |
| `src/lib/supabase/{client,server,admin}.ts` | Browser, session-bound server, and privileged server clients |
| `src/lib/env.ts`, `.env.example` | Configuration parsing, feature gates, variable-name template |
| `src/lib/types.ts`, `src/lib/drizzle/schema.ts`, `supabase/migrations/` | Shared types, schema representation, applied SQL sequence |
| `src/lib/demo/data.ts` | Seeded demo dashboard |

Runtime database reads/writes use Supabase clients; update/cancel now call the transactional PostgreSQL RPC defined in migration `0006`. Drizzle describes table/enum schemas but does not track the SQL function. Admin clients bypass RLS, so every privileged write must verify the authenticated actor's membership and permissions server-side, including inside the transaction.

Roles are `owner`, `adult`, and `member`. Owners/adults create events. Owners/adults or an event's creator can edit non-birthday events; birthday edits are denied here. Owners can invite any role; adults can invite members. The shared membership-management helper does not mean role-edit/removal endpoints already exist.

## Deployment And Environment

Owner-reported infrastructure from the chat, not independently revalidated in provider dashboards during this pass:

- Domain: `kinloop.dev`, purchased through Cloudflare.
- App: `https://app.kinloop.dev`, attached to Vercel production from `main`.
- Email sending domain: `auth.kinloop.dev`; sender name Kinloop.
- Supabase Auth uses custom SMTP through Resend. Successful magic-link delivery and production sign-in to `/welcome` were reported.
- PR branches get Vercel previews. A branch push does not update production until the relevant commit reaches the production deployment.

Configure each environment separately; recover secrets through the owner's secure storage/provider dashboards, never this document or chat history.

| Variables | Use |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Explicit canonical HTTP(S) origin; no path/query/fragment. Local example: `http://localhost:3000`; production: `https://app.kinloop.dev` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public project configuration. Existing variable name can hold a publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-only credential; required by current management/auth paths |
| `AUTH_RATE_LIMIT_SALT` | Random server-only secret for identifier hashing; no public fallback |
| `DATABASE_URL` | Drizzle tooling/direct database access when needed; not used by current Supabase runtime paths |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Future durable orchestration configuration; inspect usage before declaring delivery ready |
| `RESEND_API_KEY` | App email API integration when implemented; Supabase SMTP credentials are configured separately in Supabase |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Future push configuration; private key stays server-only |

Missing Supabase configuration enables demo mode. A schema parse failure also makes the env layer use its fallback, which can unexpectedly look like demo mode; inspect configuration presence/validation without printing values. A complete auth request requires app origin, public Supabase values, admin credential, and salt.

Supabase Auth URL Configuration should use production Site URL `https://app.kinloop.dev` and allow these callback URLs:

```text
https://app.kinloop.dev/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

For preview auth, configure an intentional trusted preview origin and matching Supabase redirect entry. The current implementation uses the configured origin, even when the requesting host differs. Do not add a blanket `*.vercel.app` allowlist.

Credentials/session tokens appeared in the old chat. The owner confirmed rotating the exposed privileged Supabase key. Never carry those values into new docs or sessions; a pasted auth callback fragment can include access and refresh tokens. `.env.local` is ignored and must remain untracked.

## Database Migrations

SQL migrations have historically been applied manually in Supabase SQL Editor, in order. A path printed in chat is not executable SQL; open the file and run its contents against the intended project. Confirm application per environment; Git history is not a migration ledger.

| File | Change |
| --- | --- |
| `0000_famplan_initial.sql` | Initial enums/tables, RLS, read policies |
| `0001_profile_visibility.sql` | Pod-member profile visibility |
| `0002_auth_rate_limits.sql` | Server-side abuse tracking table/indexes and RLS |
| `0003_pod_membership_uniqueness.sql` | Unique `(pod_id, user_id)` memberships |
| `0004_event_reminder_uniqueness.sql` | Dedupe reminder rows, unique `event_id` |
| `0005_delivery_status_cancelled.sql` | `cancelled` enum value and `(event_id, status)` delivery index |
| `0006_atomic_event_mutations.sql` | Transactional event update/cancel with reminders; execution restricted to `service_role` |

The owner reported successful application through `0006` and confirmed that its function exists in Supabase SQL Editor. This is user-reported setup, not an independently verified application smoke test. Other environments must also apply `0006` before deploying code that calls the RPC. It does not alter tables/enums, so no Drizzle table/type change is needed. Keep new migrations additive and update Drizzle/types when changing tables. `0003` can fail on existing duplicates; `0004` deliberately deletes duplicate reminder rows. Do not rerun initial schema setup or invent production seed data to work around auth/invite bugs.

## Local Development And Verification

Use Node 22 to match CI and `npm ci` with the committed lockfile. Create `.env.local` from `.env.example` with credentials obtained separately when real-service testing is intended. Use demo mode for an isolated first run. `npm run dev` binds `127.0.0.1:3000`; keep the browser host, callback origin, and cookies consistent.

```bash
npm ci
npm run dev
```

Available validation commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Typecheck intentionally runs `next typegen` and uses `tsconfig.typecheck.json`; preserve that solution to previously stale generated route types. Vitest uses Node, `src/**/*.test.ts`, global test functions, and V8 coverage. Time-dependent scheduling tests now enable fake timers and restore real timers afterward.

Playwright currently has one Chromium landing/navigation smoke test. Its branch depends on demo versus configured-auth mode; it does not exercise real email login, invites, or reminder delivery. Browser/system dependencies may need installation on a fresh device. Use `npx playwright install chromium` if the browser binary is missing; Linux dependency setup is machine-specific.

CI in `.github/workflows/ci.yml` currently runs `npm ci`, lint, typecheck, and unit tests on PRs/main pushes. Build and E2E are not CI steps there; verify them separately when warranted.

Local validation on 2026-10-20 for the transaction fixes: lint, typecheck, 61 tests across 9 files, and production build passed. The suite now includes PGlite as a dev dependency to execute PostgreSQL migrations and verify transaction rollback, role restrictions, scheduling idempotency, and permission/error behavior without accessing Supabase. PGlite does not test hosted PostgREST/session behavior or simultaneous connections. E2E was not rerun for these server/database changes.

The dependency install also reported npm audit findings (66 total, including one critical). These were not triaged in this pass, and no unrelated dependency upgrades or automatic audit fixes were applied. Assess them separately before a public launch; passing tests do not resolve dependency advisories.

## Workflow And Collaboration Preferences

- Use short-lived feature/fix branches from updated `main`, Conventional Commits, and PRs. Keep the next milestone separate until the current PR is ready/merged; avoid repeating the accidental branch stacking from earlier work.
- The owner normally runs commit/push/merge commands and posts PR replies. Provide exact, scoped commands and paste-ready replies. Do not perform those external writes just because another session once discussed them.
- Inspect `git status` and history before editing. Never assert a commit exists, a test passed, or a remote branch merged without evidence. Preserve local work from other sessions/devices.
- Prefer `git pull --ff-only` when bringing a clean `main` forward. If it fails, inspect divergence before choosing a merge/rebase. Do not recommend a hard reset as a default; preserve unique commits first and obtain explicit authorization for destructive recovery.
- A GitHub branch deletion does not delete a local branch. Check existing names before creating one. The old `feat/event-reminder-side-effects` branch was actually used for auth fixes; do not infer scope from its name.
- Copilot sometimes commits remotely when asked to apply suggestions. A rejected push can indicate remote work; fetch/inspect and integrate it, never force-push by default.
- Review current inline threads with resolution/outdated state. Group duplicate comments by behavior, verify them against code, fix correctness/security problems, and track agreed deferrals as issues. A resolved thread does not prove the implementation is correct.
- Keep replies concise and accurate: what changed, what test supports it, or which issue tracks a deferral. Do not automatically run endless bot review cycles or call a PR safe solely because a bot stopped commenting.
- Use relative links in repository docs. Skill/plugin installations and local paths vary across models/devices; discover available tools rather than depending on cached skill paths from this chat.
- Update this handoff when the checkpoint, configuration contract, or next action changes. Keep stable decisions separate from the dated snapshot; do not turn the document into a transcript.

## Open Issues And Next Work

Live open issues checked on 2026-10-20:

| Issue | Scope / current note |
| --- | --- |
| [#4](https://github.com/Roman-Faria1/Kinloop/issues/4) | Environment-driven indexing before public launch. `robots.ts` and middleware currently disable indexing unconditionally; noindex is not access control |
| [#6](https://github.com/Roman-Faria1/Kinloop/issues/6) | Distinguish incomplete invite links from admin config errors. Inspected code appears to address this through PR #12; verify acceptance and close separately if satisfied |
| [#7](https://github.com/Roman-Faria1/Kinloop/issues/7) | Decide/enforce who may copy active invite links; currently any non-demo pod member can copy |
| [#8](https://github.com/Roman-Faria1/Kinloop/issues/8) | Duplicate-membership preflight/cleanup for older databases |
| [#10](https://github.com/Roman-Faria1/Kinloop/issues/10) | Replace repeated agenda event lookups with an event-id map. Issue suggests `useMemo`; follow actual React conventions rather than adding memoization automatically |

Other discussed work has not necessarily been filed: auth log retention, pod/member settings and role management, profile editing, invite email/resend, realtime, and actual reminder delivery. A global admin console and the Effection library were not adopted.

Immediate sequence: finish PR #13 publication/review/checks, have the owner merge when ready, and smoke-test event edits/cancellation after deployment. Then create a fresh branch for notification enrollment and reliable delivery. Delivery needs a worker, recipient/channel checks at send time, idempotent sends, retries/reconciliation, and observable outcomes. Pending database rows or a readiness flag do not demonstrate that a reminder was sent.

`package.json` says `0.1.0`, but that alone does not establish a released/tagged alpha. The agreed policy is meaningful `v0.x.y` milestone tags, with `v0.1.0` for a usable hosted alpha; check actual tags/releases before proposing one.

## Lessons From Prior Debugging

- Production magic links went to localhost when the app URL was absent/wrong or the fix only existed on an unmerged branch. Final behavior requires an explicit trusted configured origin and validates it before classifying the email. Recheck Vercel env scope/deployment, Supabase Site URL/redirects, and email template behavior; use a fresh link after changes.
- Implicit auth puts tokens in the URL fragment, which the server cannot read. The callback's browser bridge and completion endpoint exist for this reason; supporting only `code`/`token_hash` was insufficient. Existing origin/state-cookie checks should be preserved and reviewed, not treated as a blanket security guarantee.
- Public env references in the browser Supabase client must remain direct `process.env.NEXT_PUBLIC_*` reads for Next's client bundling. Reusing the shared server-style env parser previously produced a false "not configured" state.
- Supabase email rate limits returned `429` with `over_email_send_rate_limit`. That proved an upstream mail limit, not a missing auth identity; do not infer a missing user from a generic app `500`. Custom SMTP was set up afterward. App invites and Supabase auth identities remain distinct concepts.
- Tokenless join recovery verifies signed-in email and pod, requires an active invite, and picks the latest expiry. It does not grant arbitrary users membership. An old seeded "Test Family" invite existed during testing; current presence/expiry is not guaranteed.
- Earlier hydration warnings showed HTML `lang`/style differences consistent with browser modifications. They were separate from the auth failures; do not suppress hydration warnings globally without establishing their cause.
- Event delivery dedupe is based on event, membership, channel, and scheduled timestamp. Preserve sent/acknowledged records, restore cancelled desired rows when moving back to a prior slot, and do not schedule edits to an already-cancelled event.
