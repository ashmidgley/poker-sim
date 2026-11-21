# Progress

**Current phase:** Phase 3 verified (next: Phase 4, Persistence)

Tick a task as soon as it is done. Tick "Verified" only after the phase's acceptance checks in `PLAN.md` section 10 pass.

## Phase 1: Engine

- [x] 1.1 Scaffold (Next.js, TypeScript strict, Tailwind, pnpm, Vitest, ESLint purity rule, `.env.example`)
- [x] 1.2 `cards.ts`, `rng.ts`, `deck.ts`
- [x] 1.3 `evaluator.ts`, `describe.ts` and evaluator tests
- [x] 1.4 `types.ts`
- [x] 1.5 `createHand`: seating, blinds, dealing, first to act
- [x] 1.6 `legal.ts` and `applyAction` betting, street progression, all-in runout
- [x] 1.7 `pots.ts`: uncalled return, side pots, odd chip
- [x] 1.8 `rake.ts`, showdown, awarding, `hand_completed`
- [x] 1.9 `table.ts` and `replay.ts`
- [x] 1.10 `equity.ts`, `outs.ts` and tests
- [x] 1.11 All required engine tests (PLAN section 4.11) exist and pass
- [x] Verified: standard checks pass, engine has no outside imports

## Phase 2: Table UI

- [x] 2.1 `useTable` controller: in-memory session, hand loop, bot turns
- [x] 2.2 Lobby setup form (opponents 1 to 8 default 3, stakes, buy-in)
- [x] 2.3 Table components (seats, cards, board, pots, markers, stacks, action log)
- [x] 2.4 Action controls (slider, quick sizes, keyboard shortcuts)
- [x] 2.5 Hand end display, next hand, rebuy prompt
- [x] 2.6 Responsive layout
- [x] Verified: standard checks pass, manual play-through done

## Phase 3: Bots

- [x] 3.1 `chen.ts` with tests
- [x] 3.2 `view.ts` (`BotView`) with the no-hidden-information test
- [x] 3.3 `profiles.ts`
- [x] 3.4 `decide.ts` preflop
- [x] 3.5 `decide.ts` postflop
- [x] 3.6 Bots wired into the controller, bot mix on the setup form
- [x] 3.7 Sanity simulation test (5,000 bot-only hands)
- [x] Verified: standard checks pass, archetypes behave like their names

## Phase 4: Persistence

- [ ] 4.1 Drizzle schema, config, first migration generated, `db:` scripts
- [ ] 4.2 `db/client.ts`, `server/auth.ts`, `server/validate.ts`, auth tests
- [ ] 4.3 Routes: health, unlock, lock
- [ ] 4.4 Routes: settings, sessions, bankroll
- [ ] 4.5 Routes: hands
- [ ] 4.6 `summarize.ts` with tests
- [ ] 4.7 `Repository`, `LocalRepository`, `HttpRepository`, retry queue, tests
- [ ] 4.8 Unlock screen, gating, controller saves hands and resumes sessions
- [ ] 4.9 History list and hand replayer
- [ ] Verified: standard checks pass, localStorage mode and passphrase checked by hand

## Phase 5: Learning mode

- [ ] 5.1 Equity Web Worker and client
- [ ] 5.2 `explain.ts` with tests
- [ ] 5.3 Learning mode on the setup form, session and hand flag, banner
- [ ] 5.4 Learning UI: face-up cards, win percentages, leader, made hands, outs
- [ ] 5.5 Pot odds against equity panel and explanation panel
- [ ] 5.6 Learning overlay in the replayer
- [ ] Verified: standard checks pass, worker bundles, learning session checked by hand

## Phase 6: Bankroll

- [ ] 6.1 Presets; rake, custom stakes and buy-in limits on the setup form
- [ ] 6.2 Starting bankroll on first run; ledger page
- [ ] 6.3 Buy-in, rebuy, cash-out wired to the ledger
- [ ] 6.4 `stats.ts` with tests
- [ ] 6.5 Dashboard tiles and charts, stake filter, learning toggle
- [ ] 6.6 `guidance.ts` with tests; banner in three places
- [ ] 6.7 Stop-loss setting and modal
- [ ] 6.8 Settings page
- [ ] Verified: standard checks pass, bankroll flow checked by hand

## Phase 7: Extras and deploy prep

- [ ] 7.1 Variance simulator (`variance.ts`, tests, page)
- [ ] 7.2 Decision review (`review.ts`, tests, panel, replayer flags)
- [ ] 7.3 Fast-forward and auto-skip
- [ ] 7.4 `README.md` with the user's setup and deploy steps
- [ ] 7.5 Final pass: empty and error states, sync indicator, navigation
- [ ] Verified: standard checks pass, extras checked by hand

## User steps (not for the builder)

- [x] Vercel project created and repository connected (pushes to `main` deploy to production)
- [ ] Neon Postgres added from the Vercel Marketplace (`DATABASE_URL` set)
- [x] `APP_PASSPHRASE` set in Vercel
- [ ] Migrations run (`pnpm db:migrate`)
- [ ] Deployed and smoke-tested

## Notes / deviations

Record here anything built differently from `PLAN.md`, and why. One line each.

- Scaffolded with `create-next-app --disable-git` so no initial commit was created. Next.js 16.4.6, React 19.3, Tailwind 4; `create-next-app` also added `AGENTS.md` (Next.js agent rules), kept as is.
- `typecheck` script runs `next typegen` before `tsc --noEmit`, because the scaffold's layout uses Next's generated `LayoutProps` type.
- Evaluator is a direct 5-to-7-card evaluator rather than best-of-21 subsets; a test checks it against a naive best-of-subsets reference on 20,000 random hands. 9-way preflop `equityKnown` takes about 24 ms in Node, well under the 200 ms threshold.
- A street also closes when exactly one seat is active and it has nothing to call (it has no one to bet against), so a lone big blind behind all-in blinds is not asked to check.
- `rng.ts` has an extra `"button"` stream for choosing the first hand's button.
- ESLint purity rule also bans `Math.random`, `Date.now`, `new Date` and `crypto` in the pure directories, and bars the engine from importing bots, analysis or bankroll.
- Phase 2: `src/bankroll/presets.ts` (stakes and rake presets) created early because the setup form needs stakes; Phase 6 adds custom stakes and rake to the form. Sessions use the live rake preset until then.
- Phase 2: session configs are kept in localStorage (`src/game/session.ts`) so a refresh finds the table; a refresh mid-session still restarts at hand 0 until Phase 4 adds resume.
- Phase 2: the table reducer lives in `src/game/tableReducer.ts` (pure, unit-tested) and `useTable` in `controller.ts` wraps it. Bot randomness is seeded per decision from session seed, hand number and action count.
- Phase 2: live pots during a hand split only at all-in amounts (`livePots` in `src/game/tableView.ts`); final pots still come from the engine.
- Phase 2: on phones the table height is capped at 56% of the viewport so the controls stay on screen.
- Phase 2 browser note: the Claude in Chrome `key "r"` action reloads the page in this setup; a real R keypress (and a dispatched keydown) raises correctly.
- Phase 3: `BotView` recovers each action's street by replaying the public actions (the engine's `HandState.actions` has no street); it still contains no other hole cards and no deck (tested).
- Phase 3: a bot never folds when it can check for free; the plan's call/check/fold fallback only covered illegal intents.
- Phase 3: facing two or more raises without having raised uses the same rule as facing a re-raise (all-in with Chen >= 16, call with Chen >= the re-raise threshold).
- Phase 3: `SessionConfig` gained `botProfiles` (archetype per bot seat). Random mixes are seeded from the session seed and use every archetype once before repeating. Older stored configs get a seeded mix on load.
- Phase 3: 5,000-hand simulation rates: VPIP TAG 11%, loose-passive 33%, calling station 57%, maniac 39%; PFR maniac 34% (next highest TAG 7.5%). Slowest bot decision 5 ms. TAG plays tighter than a typical human TAG; thresholds left as the plan's starting values.
- Phase 3: the Phase 2 placeholder bot was removed; the table reducer tests now drive the real bots.
- Added at the user's request (not in the plan): Vercel Web Analytics via `@vercel/analytics` (`src/components/AppAnalytics.tsx`, rendered in the root layout). Page views only; UUIDs in URLs are collapsed to `[id]`. Needs Web Analytics enabled in the Vercel project.
