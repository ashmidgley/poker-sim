# Poker Sim

A No-Limit Texas Hold'em cash game simulator for learning two things:

1. **Hand reading.** A learning mode shows every hand face up and explains, street by street, who is winning, with what, and what the players behind need to catch up.
2. **Bankroll management.** Set a bankroll, pick stakes and a rake structure, and see how results, variance and rake decide which stake you should be playing.

You play one seat against 1 to 8 bots (default 3). Every hand is stored as an event log, so it can be replayed and analysed later.

## Status

Phase 3 of 7 is complete. The game is playable in the browser against bots; nothing is saved between page loads yet.

| Phase | What it delivers | Status |
|---|---|---|
| 1. Engine | Rules, betting, side pots, rake, hand evaluator, equity | ✅ Done |
| 2. Table UI | Lobby, table, action controls, rebuys, phone layout | ✅ Done |
| 3. Bots | Four opponent styles, bot mix on the setup form | ✅ Done |
| 4. Persistence | Hands saved and replayable, resume after refresh, passphrase-protected API, Neon Postgres | Next |
| 5. Learning mode | Face-up cards, win % per player, outs, plain-English explanations | Planned |
| 6. Bankroll | Ledger, buy-ins and cash-outs, win rate before and after rake, stake guidance | Planned |
| 7. Extras | Variance simulator, decision review, fast-forward after folding | Planned |

Task-level progress and every deviation from the plan are in [`PROGRESS.md`](PROGRESS.md). The full design is in [`PLAN.md`](PLAN.md).

## What works today

- **Setup.** Choose 1 to 8 opponents, $1/$2, $2/$5 or $5/$10 stakes, a buy-in of 40 to 200 big blinds, and either a random mix of opponent styles or a style for each seat.
- **Play.** Full No-Limit Hold'em: blinds and button rotation, heads-up rules, minimum raises, all-ins with side pots, split pots, and live-style rake (10% capped at $6, no flop no drop).
- **Controls.** Fold, check/call and bet/raise with a slider, a dollar box and quick sizes (half pot, two-thirds pot, pot, all-in). Keyboard shortcuts F, C and R.
- **Between hands.** The hand result and rake, top-ups, and a rebuy prompt if you bust.
- **Opponents.**

  | Style | Plays like |
  |---|---|
  | Tight-aggressive | Plays few hands and bets them hard |
  | Loose-passive | Limps and calls a lot, rarely raises |
  | Calling station | Calls almost anything, hates folding |
  | Maniac | Raises and bluffs relentlessly |

  Bots see only what a real player in their seat could see.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Tests | Vitest |
| Hosting | Vercel (pushes to `main` deploy to production) |
| Analytics | Vercel Web Analytics (`@vercel/analytics`), page views only; session ids in URLs are collapsed to `[id]` |
| Database (Phase 4) | Neon Postgres from the Vercel Marketplace, Drizzle ORM, Neon HTTP driver |
| Charts (Phase 6) | Recharts |
| Equity in the UI (Phase 5) | Web Worker |

The game engine is plain TypeScript with no React, network or randomness of its own. It is a reducer, `(state, action) -> { state, events }`, driven by a seeded random number generator. The same session seed always deals the same cards, and any hand can be rebuilt exactly from its starting state and the actions taken. An ESLint rule stops the engine and the other pure modules from importing UI code or calling `Math.random` or `Date.now`.

All money is integer cents everywhere and is only formatted as dollars in the UI.

## Running locally

Needs Node 20+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm test` | Unit and simulation tests (Vitest) |
| `pnpm typecheck` | Generates Next.js route types, then `tsc --noEmit` |
| `pnpm lint` | ESLint, including the purity rule for the engine and bots |
| `pnpm build` | Production build |

No environment variables are needed to run locally today. Analytics sends nothing in development.

## Environment variables

Both arrive in Phase 4 and are listed in [`.env.example`](.env.example). Local values go in `.env.local`, which is git-ignored.

| Variable | Purpose | If unset |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | The app stores everything in the browser's localStorage |
| `APP_PASSPHRASE` | Passphrase for the unlock screen that protects the API | Skipped in development; API routes refuse to run in production |

Set `APP_PASSPHRASE` in the Vercel project before Phase 4 reaches `main`.

## Project layout

```
src/
  engine/      Pure poker engine: cards, RNG, evaluator, betting reducer, pots, rake, equity, outs
  bots/        Pure bot logic: Chen formula, player view, style profiles, decisions
  bankroll/    Stakes and rake presets (stats, guidance and variance arrive in Phases 6 and 7)
  game/        Table session reducer, useTable hook, view model, action log text
  components/  Lobby, table, seats, cards, action controls, action log
  lib/         Money formatting
  app/         Next.js routes: lobby (/) and table (/play/[sessionId])
```

## Tests

59 tests across the engine, bots and table session, including:

- **Chip conservation** over 2,000 random hands of 2 to 9 players.
- **Exact pot outcomes** for side pots with three all-ins of different sizes, and for split pots with an odd chip.
- **Rule enforcement.** Minimum raises, incomplete all-in raises, the big blind option, uncalled bets, and the rake cap with "no flop, no drop".
- **Evaluator accuracy.** The fast hand evaluator agrees with a naive reference on 20,000 random hands.
- **Deterministic replay.** Any hand rebuilds identically from its seed and actions.
- **Bot behaviour.** A 5,000-hand bot simulation confirms the four styles play differently, with every action legal.
