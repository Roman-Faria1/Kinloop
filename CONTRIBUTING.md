# Contributing

## Workflow

FamPlan should use a simple trunk-based workflow:

- `main` is always the stable branch.
- Create short-lived branches from `main` for all feature work.
- Merge back through pull requests once checks are green.

Recommended branch names:

- `feat/pod-invites`
- `fix/reminder-dedupe`
- `chore/ci-hardening`
- `docs/release-process`

## Commits

Use Conventional Commits:

- `feat: add agenda-first pod workspace`
- `fix: make demo pod link navigate correctly`
- `chore: add ci workflow`
- `docs: document release strategy`
- `test: cover reminder scheduling`

Commit guidance:

- keep each commit focused on one change set
- prefer small, reviewable commits over one large dump
- use the imperative mood

## Pull Requests

For a project of this scope:

- open PRs from feature branches into `main`
- keep PRs draft until lint, typecheck, unit tests, and E2E pass
- prefer one feature or fix per PR
- include what changed, why, and how it was validated

## Release Strategy

Use lightweight semantic versioning once the app is meaningfully deployable.

Recommended approach:

- stay in `0.x` while the product is still evolving quickly
- tag meaningful milestones, not every merge
- start with `v0.1.0` for the first real hosted alpha
- use patch bumps for fixes, minor bumps for visible feature increments, and major bumps only after a stable `1.0.0`

Examples:

- `v0.1.0` first usable alpha
- `v0.2.0` auth + persistent pods
- `v0.2.1` reminder bugfixes

## Branch Protection

When GitHub is configured, protect `main` with:

- required pull request before merge
- required status checks
- no force pushes
- no direct pushes except for rare bootstrap/admin cases
