# Working On Kinloop

Read [HANDOFF.md](HANDOFF.md) for product decisions, architecture, configuration, the dated checkpoint, open work, and lessons from prior sessions. Read [CONTRIBUTING.md](CONTRIBUTING.md) for branching and releases.

- Verify the actual branch, working tree, commit history, and active PR before changing files. The handoff is context, not live deployment state.
- Preserve other work. Use scoped edits and new feature/fix branches when appropriate; do not silently switch, reset, or force-push branches.
- The owner normally handles commits, pushes, PR comments, and merges. Supply exact commands/replies unless those actions are explicitly delegated.
- Never print or commit `.env.local`, privileged keys, salts, or auth/session tokens. Document variable names and configuration contracts only.
- Runtime writes use privileged Supabase clients: verify viewer membership/permissions server-side. Keep SQL migrations, Drizzle schema, and shared types aligned.
- Run checks appropriate to changes and report what actually ran. Available commands: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`.
- Update `HANDOFF.md` when meaningful work changes the checkpoint or next action, clearly separating verified facts from historical/user-reported state.
