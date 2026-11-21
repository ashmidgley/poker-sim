# Poker simulator: builder instructions

Read `PLAN.md` in full before doing anything. It holds every design decision; do not reopen the ones it marks as locked.

## How to work

- Work phase by phase, in order (1 to 7), and task by task within a phase.
- After each task, tick it in `PROGRESS.md` and keep the "Current phase" line accurate.
- At the end of a phase, run its verification from `PLAN.md` section 10 (`pnpm test`, `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, plus the manual checks). Fix failures before starting the next phase, then tick the phase's "Verified" box.
- At the start and at the end of each phase, print one status line in this form:
  `Phase N/7: <name>, X of Y tasks done`
- If you have to deviate from the plan, make the smallest change that works and add a line under "Notes / deviations" in `PROGRESS.md`.

## Hard limits

- **No git history changes.** Never run `git commit`, `git push`, `git merge`, `git rebase` or `git tag`. Stop at a working local state and tell the user it is ready.
- **No deploys.** Never run `vercel`, and never deploy anything.
- **No infrastructure.** Never create the Neon database or the Vercel project. The user does that and supplies the env vars.
- **No commands against a real database.** Do not run migrations or queries against `DATABASE_URL`, even if it is set in `.env.local`. Prepare the command and ask the user. Develop and test against the localStorage fallback (`DATABASE_URL` unset).
- Never print or log the values of `DATABASE_URL` or `APP_PASSPHRASE`.

## Conventions

- All money is integer cents.
- `src/engine`, `src/bots`, `src/analysis` and `src/bankroll` are pure TypeScript: no React, Next, DOM, network, `Math.random` or `Date.now`.
- Every API route handler except health and unlock calls `requireAuth` first.
