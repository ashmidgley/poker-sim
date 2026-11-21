# Poker Simulator: Build Plan

This plan is self-contained. Follow it in order. Where it states a rule, implement that rule; do not substitute a different design. If something here turns out to be impossible or wrong, pick the smallest deviation, record it under "Notes / deviations" in `PROGRESS.md`, and carry on.

## 1. Overview

A single-player No-Limit Texas Hold'em cash game simulator. One human plays against 1 to 8 rule-based bots. It has two purposes:

1. **Learn hand reading.** A learning mode shows every hand face up and explains who is winning and why on each street.
2. **Learn bankroll management.** The user sets a bankroll, picks stakes and a rake structure, and watches how results, variance and rake affect which stake they should play.

Every hand is stored as an event log so it can be replayed and analysed.

It is one Next.js app: UI and API routes deploy together to Vercel, with Neon Postgres as the database.

## 2. Locked decisions

Do not reopen these.

| Area | Decision |
|---|---|
| Game | No-Limit Texas Hold'em, cash games only, one human against bots |
| Users | Single user. A passphrase env var protects every API route |
| Rake | Pot rake: percentage, cap, "no flop, no drop". Presets plus custom. No time rake |
| Framework | Next.js App Router (latest stable), TypeScript strict, Tailwind, pnpm |
| Tests | Vitest |
| Database | Neon Postgres (Vercel Marketplace), Drizzle ORM, drizzle-kit migrations, Neon HTTP driver (`@neondatabase/serverless` + `drizzle-orm/neon-http`) |
| Validation | zod on every API request body |
| Charts | Recharts |
| Engine | Pure TypeScript reducer `(state, action) -> { state, events }`, seeded RNG, event-sourced |
| Equity in the UI | Runs in a Web Worker |
| Saving | One POST per completed hand (event log plus summary). localStorage retry queue on failure |
| Opponents | 1 to 8, default 3 |
| Bots | Four rule-based archetypes: tight-aggressive, loose-passive, calling station, maniac |
| Money | All amounts are integer cents everywhere (engine, database, API). Format as dollars only in the UI |
| Out of scope | Tournaments, multiplayer, user accounts, an AI coach, real money |

### Learning mode and the bankroll

Learning mode is chosen when a session is created and is fixed for that session. A learning session uses play money: it creates no bankroll transactions, and its hands are stored with `learning_mode = true`. Stats exclude learning hands by default; the dashboard has an "include learning hands" toggle that affects win-rate stats only, never the ledger.

## 3. Repo layout

```
poker-sim/
  PLAN.md  PROGRESS.md  CLAUDE.md  README.md
  .env.example
  drizzle.config.ts
  drizzle/                     generated SQL migrations
  src/
    engine/                    PURE: no React, DOM, Next or network imports
      cards.ts                 Card type, parsing, formatting
      rng.ts                   seeded PRNG (mulberry32) and seed derivation
      deck.ts                  52-card deck, seeded Fisher-Yates shuffle
      evaluator.ts             5/6/7-card hand evaluation
      describe.ts              human-readable hand names
      types.ts                 state, action, event and config types
      hand.ts                  createHand, applyAction (the reducer)
      legal.ts                 legalActions
      pots.ts                  uncalled bet return, side pots, odd chips
      rake.ts                  rake calculation
      table.ts                 between-hand logic: button advance, rebuys
      replay.ts                rebuild a hand from input + actions
      equity.ts                exact and Monte Carlo equity
      outs.ts                  next-card outs
      index.ts                 public exports
      __tests__/
    bots/                      PURE
      chen.ts  profiles.ts  view.ts  decide.ts  __tests__/
    analysis/                  PURE
      explain.ts               learning-mode explanations
      review.ts                post-hand decision review
      __tests__/
    bankroll/                  PURE
      presets.ts               stakes and rake presets
      stats.ts                 win rate, std dev, downswing, series
      guidance.ts              stake guidance
      variance.ts              variance simulator and risk of ruin
      __tests__/
    data/
      repository.ts            Repository interface
      httpRepository.ts        talks to /api
      localRepository.ts       localStorage implementation
      retryQueue.ts            failed hand POSTs
      summarize.ts             PURE: event log -> hand summary
    db/
      schema.ts  client.ts
    server/
      auth.ts  validate.ts
    workers/
      equity.worker.ts  equityClient.ts
    game/
      controller.ts            useTable hook: runs hands, drives bots, timing
    components/                table, cards, controls, panels, charts
    app/
      page.tsx                 lobby and new-session setup
      unlock/page.tsx
      play/[sessionId]/page.tsx
      history/page.tsx
      history/[handId]/page.tsx
      bankroll/page.tsx
      variance/page.tsx
      settings/page.tsx
      api/...                  route handlers (section 7)
```

"PURE" directories must not import from `react`, `next`, `src/components`, `src/app`, `src/game`, `src/data` (except `summarize.ts` importing engine types), `src/db` or `src/server`. Enforce this with an ESLint `no-restricted-imports` override for those directories.

## 4. Engine spec

### 4.1 Cards and RNG

- A `Card` is a two-character string: rank `23456789TJQKA` then suit `cdhs`, e.g. `"As"`, `"Td"`.
- `rng.ts`: `mulberry32(seed: number)` returning `() => number` in `[0, 1)`. `hashSeed(text: string): number` (FNV-1a) so seeds can be strings. `deriveSeed(sessionSeed, handNumber, stream)` returns `hashSeed(`${sessionSeed}:${handNumber}:${stream}`)`. Streams: `"deck"`, `"bots"`, `"equity"`.
- `deck.ts`: build the 52 cards in a fixed order, Fisher-Yates shuffle with the `"deck"` stream. Deal from the front: two hole cards per seat (one at a time, starting left of the button), then flop, turn, river. No burn cards.

### 4.2 Types

```ts
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type Phase = Street | 'complete';
export type SeatStatus = 'active' | 'folded' | 'allIn';

export interface RakeConfig {
  percentBps: number;      // 500 = 5%
  cap: number;             // cents; 0 means no cap
  roundTo: number;         // cents; rake is floored to a multiple of this (>= 1)
  noFlopNoDrop: boolean;
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  rake: RakeConfig;
}

export interface SeatInput {
  seat: number;            // 0..8, stable for the session; the human is seat 0
  playerId: string;
  name: string;
  isHuman: boolean;
  stack: number;           // > 0
}

export interface NewHandInput {
  handId: string;          // uuid, generated by the caller
  handNumber: number;      // 1-based within the session
  sessionSeed: string;
  config: TableConfig;
  buttonSeat: number;
  seats: SeatInput[];      // 2..9 seats, only players being dealt in
}

export interface SeatState extends SeatInput {
  startingStack: number;
  holeCards: [Card, Card];
  status: SeatStatus;
  committedStreet: number; // chips put in on the current street
  committedHand: number;   // chips put in this hand
  actedThisStreet: boolean;
  raiseRightsOpen: boolean;
}

export interface Pot { amount: number; eligible: number[]; } // seat numbers

export interface HandState {
  input: NewHandInput;
  seats: SeatState[];      // ordered clockwise by seat number
  deck: Card[];            // undealt cards
  board: Card[];
  phase: Phase;
  currentBet: number;      // highest committedStreet this street
  lastFullRaiseSize: number;
  toAct: number | null;    // seat number
  lastAggressor: number | null; // last bet/raise on the current street
  flopDealt: boolean;
  rake: number;
  actions: Action[];       // every player action so far, for replay
}

export type Action =
  | { type: 'fold'; seat: number }
  | { type: 'check'; seat: number }
  | { type: 'call'; seat: number }
  | { type: 'bet'; seat: number; to: number }    // to = total committedStreet after
  | { type: 'raise'; seat: number; to: number };

export type HandEvent =
  | { type: 'hand_started'; handId: string; handNumber: number; sessionSeed: string;
      config: TableConfig; buttonSeat: number;
      seats: { seat: number; playerId: string; name: string; isHuman: boolean; stack: number }[] }
  | { type: 'blind_posted'; seat: number; kind: 'sb' | 'bb'; amount: number; allIn: boolean }
  | { type: 'hole_cards_dealt'; seat: number; cards: [Card, Card] }
  | { type: 'action'; street: Street; seat: number; action: Action['type'];
      added: number; to: number; allIn: boolean; potAfter: number }
  | { type: 'uncalled_returned'; seat: number; amount: number }
  | { type: 'street_dealt'; street: 'flop' | 'turn' | 'river'; cards: Card[]; board: Card[] }
  | { type: 'all_in_runout'; seats: { seat: number; cards: [Card, Card] }[] }
  | { type: 'showdown'; seat: number; cards: [Card, Card]; description: string }
  | { type: 'rake_taken'; amount: number; fromPots: number[] } // per pot index
  | { type: 'pot_awarded'; potIndex: number; amount: number;   // amount after rake
      winners: { seat: number; amount: number }[]; description: string | null }
  | { type: 'hand_completed'; stacks: { seat: number; stack: number; net: number }[]; rake: number };

export interface LegalActions {
  seat: number;
  canFold: boolean;        // always true when it is this seat's turn
  canCheck: boolean;
  callAmount: number;      // chips to add; 0 when checking is available
  raise: { kind: 'bet' | 'raise'; minTo: number; maxTo: number } | null;
}
```

Public API (`engine/index.ts`):

```ts
createHand(input: NewHandInput): { state: HandState; events: HandEvent[] }
applyAction(state: HandState, action: Action): { state: HandState; events: HandEvent[] }
legalActions(state: HandState): LegalActions | null   // null when phase is 'complete'
replay(input: NewHandInput, actions: Action[]): { state: HandState; events: HandEvent[] }
```

`applyAction` never mutates its input. It throws `IllegalActionError` for anything `legalActions` would not allow. It advances streets, runs out the board and completes the hand on its own, so the caller only ever supplies player actions.

### 4.3 Positions and blinds

- Seats are ordered clockwise by seat number; "left of X" means the next higher seat number that is in the hand, wrapping around.
- **Three or more players:** small blind is the first seat left of the button, big blind the next.
- **Heads-up:** the button posts the small blind; the other seat posts the big blind.
- **First to act preflop:** the first `active` seat left of the big blind. Heads-up this is the button.
- **First to act on later streets:** the first `active` seat left of the button. Heads-up this is the big blind.
- A seat that cannot cover its blind posts its whole stack and is `allIn`. Preflop `currentBet` is still the full big blind.
- Posting a blind does not count as acting: the big blind keeps its option.
- **Button movement (kept simple, no dead button or dead blinds):** `table.ts` moves the button to the next seat clockwise that is being dealt into the next hand. Blinds then follow from the rules above. A player can therefore occasionally skip or repeat a blind when someone busts; that is accepted.

### 4.4 Betting rules

At the start of each street: `committedStreet = 0` for all, `actedThisStreet = false`, `raiseRightsOpen = true`, `lastAggressor = null`, `lastFullRaiseSize = bigBlind`, and `currentBet = 0` (preflop: `currentBet = bigBlind`, with blinds already in `committedStreet`).

For the seat to act, let `toCall = currentBet - committedStreet`.

- **Check:** legal only when `toCall == 0`.
- **Call:** adds `min(toCall, stack)`. Calling for less than `toCall` puts the seat all-in.
- **Bet / raise:** called `bet` when `currentBet == 0`, otherwise `raise`. Legal only when all of these hold: `raiseRightsOpen` is true for the seat, `stack > toCall`, and at least one other seat is `active`. Bounds:
  - `maxTo = committedStreet + stack`
  - `minTo = min(currentBet + lastFullRaiseSize, maxTo)`
  - A `to` below `currentBet + lastFullRaiseSize` is legal only when `to == maxTo` (all-in for less).
- **Full raise** (`to - currentBet >= lastFullRaiseSize`): set `lastFullRaiseSize = to - currentBet`, `currentBet = to`, `lastAggressor = seat`, and set `raiseRightsOpen = true` and `actedThisStreet = false` for every other `active` seat.
- **Incomplete all-in raise** (`to - currentBet < lastFullRaiseSize`): set `currentBet = to` only. `lastFullRaiseSize` and everyone's `raiseRightsOpen` are unchanged. Seats that already acted must still call the difference or fold, but may not raise. Several incomplete raises never add up to reopen the action (a stated simplification).
- After any action the acting seat gets `actedThisStreet = true` and `raiseRightsOpen = false`. A seat with `stack == 0` becomes `allIn`.
- **Next to act:** the next `active` seat clockwise that has `actedThisStreet == false` or `committedStreet < currentBet`.

After every action, check in this order:

1. **One contender left** (all others folded): return any uncalled bet, then complete the hand without a showdown (section 4.7).
2. **Street closed** (every `active` seat has `actedThisStreet` and `committedStreet == currentBet`):
   - Return any uncalled bet (section 4.5).
   - If the street is the river, go to showdown.
   - Else if at most one seat is `active`, emit `all_in_runout` with every contender's hole cards, deal the remaining streets with no betting, then go to showdown.
   - Else deal the next street and reset per the top of this section.
3. Otherwise set `toAct` to the next seat.

### 4.5 Uncalled bets and side pots

- **Uncalled bet:** when a street closes or the hand ends by folds, find the highest `committedStreet` and the second highest across all seats (folded seats included). If one seat alone holds the highest, return the difference to that seat's stack, reduce its `committedStreet` and `committedHand`, and emit `uncalled_returned`. If the seat's status was `allIn` it stays `allIn` only if its stack is still 0.
- **Pots** are built once, at hand end, from `committedHand`:
  1. Take the distinct `committedHand` values of non-folded seats, ascending: `L1 < L2 < ...`.
  2. For each level `Lk`, the pot amount is the sum over all seats (folded included) of `min(committedHand, Lk) - min(committedHand, Lk-1)`, with `L0 = 0`. Eligible seats are the non-folded seats with `committedHand >= Lk`.
  3. Any chips above the top level (should not occur after the uncalled return) go into the last pot.
  4. Merge adjacent pots that have identical eligible sets.
- Pot index 0 is the main pot.

### 4.6 Rake

Computed once at hand end, after the uncalled return, on the total of all pots:

```
if rake.noFlopNoDrop and not flopDealt: rake = 0
else:
  raw  = floor(total * percentBps / 10000)
  raw  = floor(raw / roundTo) * roundTo
  rake = cap > 0 ? min(raw, cap) : raw
```

The rake is deducted from the main pot first, then from the next side pot if the main pot is too small, and so on. Emit `rake_taken` (omit the event when rake is 0). Pots are awarded after rake.

### 4.7 Showdown and awarding

- **Showdown order:** the last aggressor on the river shows first; if nobody bet the river, the first contender left of the button. Then clockwise. Every contender's hand is shown (no mucking), one `showdown` event each, with a description such as "Two pair, kings and sevens".
- **Each pot** goes to the eligible seat(s) with the best 7-card hand. A tie splits the pot evenly in cents.
- **Odd chip:** a remainder that cannot be split is handed out one cent at a time to the tied winners in clockwise order starting with the first seat left of the button.
- **Hand won by folds:** the single contender takes all pots, no cards are shown, `description` is `null`.
- Finish with `hand_completed`, where `net = stack - startingStack`, and set `phase = 'complete'`.
- **Invariant:** the sum of all stacks plus the rake equals the sum of all starting stacks.

### 4.8 Hand evaluator

- `evaluate5(cards: Card[5]): number` returns a comparable score: `category << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5`, with ranks 2 to 14 ordered by significance for that category (e.g. for a full house, the trips rank then the pair rank).
- Categories: 0 high card, 1 pair, 2 two pair, 3 three of a kind, 4 straight, 5 flush, 6 full house, 7 four of a kind, 8 straight flush.
- The wheel (A-2-3-4-5) is a straight with high card 5 and ranks below a six-high straight.
- `evaluate(cards: Card[5..7]): number` returns the best `evaluate5` over all 5-card subsets (21 for seven cards).
- `describe.ts` turns a score into text.
- Only optimise (for example with a direct 7-card evaluator) if the equity benchmarks in section 4.9 take longer than about 200 ms.

### 4.9 Equity and outs

`equity.ts`:

```ts
interface EquityResult { win: number; tie: number; equity: number } // fractions 0..1; equity = win + tie share

// All hands known (learning mode, decision review).
equityKnown(hands: [Card, Card][], board: Card[], rng: () => number): EquityResult[]

// One hand against unknown random hands (bots, play-mode pot odds panel).
equityVsRandom(hand: [Card, Card], board: Card[], opponents: number,
               iterations: number, rng: () => number): EquityResult
```

- `equityKnown` uses **exact enumeration** of every remaining board on the flop (all 2-card combinations), turn (all single cards) and river (one evaluation). **Preflop** it uses Monte Carlo with a fixed **20,000** iterations.
- `equityVsRandom` is always Monte Carlo. Bots use 500 iterations; the UI uses 5,000.
- Both take the RNG as a parameter (the `"equity"` or `"bots"` stream) so results are reproducible.

`outs.ts`: `nextCardOuts(hands, board)`: for flop or turn boards, for each player who is not currently ahead, list the unseen cards that would put that player in the lead or in a tie for it if dealt next. Returns `{ seatIndex, outs: Card[] }[]`.

### 4.10 Between hands (`table.ts`)

- `nextButton(previousButton, seatsInNextHand)`: section 4.3. The first hand's button is chosen with the session seed.
- **Bots** with a stack of 0 are rebought to 100 big blinds before the next hand. Bots never leave.
- **The human** with a stack of 0 must rebuy (40 to 200 big blinds, limited by the bankroll in non-learning sessions) or end the session. The human may also top up between hands to at most 200 big blinds.
- Rebuys happen between hands, so the per-hand chip invariant is unaffected.

### 4.11 Required engine tests

All in `src/engine/__tests__/`, each a named `describe` block:

| Test | What it proves |
|---|---|
| Chip conservation (property) | 2,000 seeded random hands, 2 to 9 players, random stacks from 1 big blind to 300, random legal actions. After each: stacks + rake equals starting stacks, no negative stack, the hand finishes in under 500 actions, pot amounts sum to total commitments |
| Three all-ins of different sizes | Stacks 50/150/400/400 big blinds all in: exactly three pots with the right amounts and eligibility, each awarded to the right seat |
| Split pot with an odd chip | A tied pot with an odd number of cents: the extra cent goes to the first tied seat left of the button |
| Heads-up blinds | Button posts the small blind and acts first preflop; big blind acts first on the flop |
| Min-raise enforcement | Raise below the minimum is rejected; all-in below the minimum is accepted; an incomplete all-in raise does not reopen raising for a seat that already acted, but that seat can still call or fold |
| Big blind option | Preflop limped to the big blind: it can check or raise |
| Uncalled bet | A bet nobody calls is returned and not raked |
| Rake cap and no flop, no drop | Rake hits the cap on a large pot; rounds down to `roundTo`; is 0 when the hand ends preflop with `noFlopNoDrop`; is charged preflop when `noFlopNoDrop` is false; is deducted from the main pot first |
| Evaluator ranking | One example of each of the nine categories ranks in order; the wheel loses to a six-high straight; a wheel straight flush is recognised; kickers decide between equal pairs, two pairs and flushes; best five of seven is chosen; identical ranks in different suits tie |
| Deterministic replay | `replay(input, state.actions)` reproduces an identical event log; the same seed gives the same deck |
| Equity | AA vs KK preflop is about 81 to 82% (within 1.5 points); a made flush vs a drawing-dead hand on the turn is exactly 100%; equities sum to 1 |

## 5. Bots

Bots see only what a player at that seat would see. `view.ts` builds a `BotView` from `HandState`: own hole cards, board, pot, stacks, bets, positions, action history, legal actions. It never includes other seats' hole cards or the deck. `decide(view, profile, rng): Action` is pure and uses the `"bots"` RNG stream.

### 5.1 Preflop strength: Chen formula (`chen.ts`)

1. Score the higher card: A 10, K 8, Q 7, J 6, T down to 2 is half the pip value (T is 5, 9 is 4.5, ... 2 is 1).
2. Pair: double that score, minimum 5.
3. Suited: add 2.
4. Gap between ranks (non-pairs): connected 0, one-gap minus 1, two-gap minus 2, three-gap minus 4, four or more minus 5.
5. Add 1 if connected or one-gap and both cards are below a queen (non-pairs).
6. Round half up.

Test values: AA 20, AKs 12, AKo 10, JTs 9, 72o -1, 22 5.

### 5.2 Profiles (`profiles.ts`)

Position is "late" for the button and the seat before it, "early" otherwise.

| Parameter | Tight-aggressive | Loose-passive | Calling station | Maniac |
|---|---|---|---|---|
| Open-raise when unopened: Chen at least (early / late) | 9 / 7 | 12 / 11 | 13 / 12 | 5 / 4 |
| Limp when unopened: Chen at least | never | 5 | 3 | never |
| Call a raise: Chen at least | 8 | 6 | 4 | 6 |
| Re-raise: Chen at least | 12 | 14 | 15 | 9 |
| Open size (big blinds, plus 1 per limper) | 3 | 3 | 3 | 4 |
| Postflop value-bet when equity at least | 0.60 | 0.70 | 0.75 | 0.50 |
| Chance to bet when over that threshold | 0.80 | 0.40 | 0.30 | 0.90 |
| Bluff chance when checked to and under it | 0.15 | 0.05 | 0.02 | 0.40 |
| Raise a bet when equity at least | 0.80 | 0.90 | 0.92 | 0.65 |
| Call margin (call when equity >= pot odds + margin) | +0.05 | -0.03 | -0.12 | 0.00 |

### 5.3 Decision rules (`decide.ts`)

- **Preflop:** apply the thresholds above. A re-raise is 3 times the current bet. Facing a re-raise after already raising: continue only with Chen at least the re-raise threshold; go all-in with Chen at least 16.
- **Postflop:** `equity = equityVsRandom(hole, board, contenders - 1, 500, rng).equity`.
  - Checked to: bet with the stated chance when over the value threshold; otherwise bluff with the bluff chance; otherwise check.
  - Facing a bet: `potOdds = toCall / (pot + toCall)`. Raise if over the raise threshold (with the "chance to bet" probability); else call if `equity >= potOdds + margin`; else fold.
  - Bet size: pick 33%, 66% or 100% of the pot with weights 30/50/20 (maniac 10/40/50). Raises are 3 times the bet faced.
- Clamp every size into `[minTo, maxTo]` from `legalActions`. If the chosen action is not legal, fall back in this order: call, check, fold.
- Thresholds are starting values. Tune them only if the sanity test in phase 3 shows an archetype not behaving like its name.

## 6. Database schema

`src/db/schema.ts`. All money columns are integer cents.

```ts
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),            // single row
  buyInRule: integer('buy_in_rule').notNull().default(25),
  defaultOpponents: integer('default_opponents').notNull().default(3),
  defaultSmallBlind: integer('default_small_blind').notNull().default(100),
  defaultBigBlind: integer('default_big_blind').notNull().default(200),
  defaultBuyInBb: integer('default_buy_in_bb').notNull().default(100),
  rakePreset: text('rake_preset').notNull().default('live'),
  rakeBps: integer('rake_bps').notNull().default(1000),
  rakeCap: integer('rake_cap').notNull().default(600),
  rakeRoundTo: integer('rake_round_to').notNull().default(100),
  noFlopNoDrop: boolean('no_flop_no_drop').notNull().default(true),
  stopLossBuyIns: integer('stop_loss_buy_ins'),          // null = off
  autoSkipWhenFolded: boolean('auto_skip_when_folded').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),                           // client-generated
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  seed: text('seed').notNull(),
  learningMode: boolean('learning_mode').notNull(),
  smallBlind: integer('small_blind').notNull(),
  bigBlind: integer('big_blind').notNull(),
  rakeBps: integer('rake_bps').notNull(),
  rakeCap: integer('rake_cap').notNull(),
  rakeRoundTo: integer('rake_round_to').notNull(),
  noFlopNoDrop: boolean('no_flop_no_drop').notNull(),
  opponents: integer('opponents').notNull(),
  botProfiles: jsonb('bot_profiles').notNull(),          // string[] of archetype ids by seat
  stopLoss: integer('stop_loss'),                        // cents, null = off
  totalBoughtIn: integer('total_bought_in').notNull(),
  cashedOut: integer('cashed_out'),                      // null until ended
  handsPlayed: integer('hands_played').notNull().default(0),
});

export const hands = pgTable('hands', {
  id: uuid('id').primaryKey(),                           // client-generated; makes POST idempotent
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  handNumber: integer('hand_number').notNull(),
  playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
  learningMode: boolean('learning_mode').notNull(),
  smallBlind: integer('small_blind').notNull(),
  bigBlind: integer('big_blind').notNull(),
  numPlayers: integer('num_players').notNull(),
  heroSeat: integer('hero_seat').notNull(),
  buttonSeat: integer('button_seat').notNull(),
  heroPosition: text('hero_position').notNull(),         // BTN, SB, BB, UTG, MP, CO
  heroHoleCards: text('hero_hole_cards').notNull(),      // e.g. "AsKd"
  board: text('board').notNull(),                        // "" to 10 chars
  potTotal: integer('pot_total').notNull(),              // before rake
  rake: integer('rake').notNull(),
  heroNet: integer('hero_net').notNull(),                // after rake
  heroRakePaid: integer('hero_rake_paid').notNull(),
  heroVpip: boolean('hero_vpip').notNull(),
  heroPfr: boolean('hero_pfr').notNull(),
  heroSawFlop: boolean('hero_saw_flop').notNull(),
  wentToShowdown: boolean('went_to_showdown').notNull(),
  heroWon: boolean('hero_won').notNull(),
  engineVersion: integer('engine_version').notNull().default(1),
  events: jsonb('events').notNull(),                     // HandEvent[]
}, (t) => [
  uniqueIndex('hands_session_number').on(t.sessionId, t.handNumber),
  index('hands_played_at').on(t.playedAt),
]);

export const bankrollTransactions = pgTable('bankroll_transactions', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  type: text('type').notNull(),                          // deposit | withdrawal | buy_in | cash_out
  amount: integer('amount').notNull(),                   // signed: buy_in and withdrawal negative
  sessionId: uuid('session_id').references(() => sessions.id),
  note: text('note'),
});
```

- Bankroll balance is the sum of `bankroll_transactions.amount`. The starting bankroll is a `deposit` with the note "Starting bankroll".
- `heroRakePaid`: for each pot, the rake taken from that pot multiplied by the hero's share of that pot's award, summed and rounded to cents. "Before rake" net is `heroNet + heroRakePaid`.
- `summarize.ts` derives every summary column from the event log; the server recomputes nothing but validates shapes with zod.
- Multi-statement writes (session plus buy-in transaction) use `db.batch([...])`, since the Neon HTTP driver has no interactive transactions.

## 7. API routes

All bodies are JSON. Every route except `GET /api/health` and `POST /api/unlock` calls `requireAuth` first and returns `401 { error: 'unauthorized' }` on failure. When `DATABASE_URL` is unset, every database-backed route returns `503 { error: 'no_database' }`.

| Route | Request | Response |
|---|---|---|
| `GET /api/health` | none | `{ db: boolean, authRequired: boolean, unlocked: boolean }` |
| `POST /api/unlock` | header `x-passphrase` | `200 { ok: true }` and sets the cookie; `401` otherwise |
| `POST /api/lock` | none | `200 { ok: true }`, clears the cookie |
| `GET /api/settings` | none | the settings row (created with defaults if missing) |
| `PUT /api/settings` | partial settings | the updated row |
| `GET /api/sessions` | `?limit=50` | `{ sessions: Session[] }`, newest first |
| `POST /api/sessions` | `{ id, seed, learningMode, smallBlind, bigBlind, rake: RakeConfig, opponents, botProfiles, stopLoss, buyIn }` | `201 { session }`. Non-learning: also inserts a `buy_in` transaction; `409 { error: 'insufficient_bankroll' }` if `buyIn` exceeds the balance |
| `GET /api/sessions/[id]` | none | `{ session }` |
| `POST /api/sessions/[id]/rebuy` | `{ amount }` | `{ session }`. Non-learning: inserts a `buy_in` transaction, same 409 rule |
| `POST /api/sessions/[id]/end` | `{ cashOut }` | `{ session }`. Sets `endedAt`, `cashedOut`. Non-learning: inserts a `cash_out` transaction. Idempotent |
| `POST /api/hands` | `{ hand: HandSummary & { events: HandEvent[] } }` | `201 { ok: true }`. `ON CONFLICT (id) DO NOTHING`, then increments `sessions.handsPlayed` only when a row was inserted |
| `GET /api/hands` | `?sessionId=&limit=100&before=<playedAt ISO>` | `{ hands: HandSummary[] }` without `events`, newest first |
| `GET /api/hands/summaries` | `?includeLearning=false` | `{ hands: HandSummary[] }`, all hands, oldest first, without `events` (feeds stats) |
| `GET /api/hands/[id]` | none | `{ hand }` with `events` |
| `GET /api/bankroll` | none | `{ balance, transactions: Transaction[] }` |
| `POST /api/bankroll/transactions` | `{ id, type: 'deposit' \| 'withdrawal', amount, note? }` | `201 { balance, transaction }`; `409` if a withdrawal exceeds the balance |

### 7.1 Auth (`server/auth.ts`)

- `APP_PASSPHRASE` is the secret. The session token is `HMAC-SHA256(key = APP_PASSPHRASE, message = "poker-sim-session")` as hex.
- `POST /api/unlock` compares the `x-passphrase` header with `APP_PASSPHRASE`. On success it sets cookie `ps_auth = <token>`: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, max age 30 days.
- `requireAuth(request)` passes when the `ps_auth` cookie equals the token, or when an `x-passphrase` header equals the passphrase.
- All comparisons hash both sides with SHA-256 and use `crypto.timingSafeEqual` on the digests.
- If `APP_PASSPHRASE` is unset: in production every protected route returns `500 { error: 'passphrase_not_configured' }`; in development auth is skipped and `/api/health` reports `authRequired: false`.
- The check lives in the route handlers. Client-side redirects to `/unlock` are convenience only.

### 7.2 Client data layer

`Repository` (in `data/repository.ts`) has one method per route above. Two implementations:

- `HttpRepository`: calls the API.
- `LocalRepository`: stores the same shapes in localStorage (keys prefixed `poker-sim:`) and applies the same rules (balance checks, idempotent hand saves).

On startup the client calls `GET /api/health`. `db: false` selects `LocalRepository` and shows a small "local storage only" badge. `db: true` selects `HttpRepository`, redirecting to `/unlock` when `authRequired && !unlocked`.

**Local development needs no database.** With `DATABASE_URL` unset, phases 1 to 3 and nearly all the UI in later phases run on `LocalRepository`.

`retryQueue.ts`: when `saveHand` fails over HTTP, the payload is appended to `poker-sim:retry-queue`. The queue is flushed in order before the next save, on page load and on the `online` event. Hand ids make retries safe. The table shows "N hands waiting to sync" while the queue is non-empty.

Stats are computed client-side by the pure functions in `src/bankroll/` from hand summaries and transactions, so both repositories share one code path.

## 8. Environment variables

`.env.example`:

```
# Neon Postgres connection string (pooled). Leave unset to run on localStorage only.
DATABASE_URL=
# Passphrase for the unlock screen. Required in production.
APP_PASSPHRASE=
```

Local values go in `.env.local`, which must be git-ignored.

## 9. Feature specs

### 9.1 Presets (`bankroll/presets.ts`)

Stakes (small blind / big blind, cents): `1/2` = 100/200, `2/5` = 200/500, `5/10` = 500/1000, plus custom. Buy-in: default 100 big blinds, allowed 40 to 200.

Rake presets (illustrative, the user can edit them):

| Preset | Percent | Cap | Round to | No flop, no drop |
|---|---|---|---|---|
| `live` (default) | 10% | $6 | $1 | yes |
| `online` | 5% | $3 | 1 cent | yes |
| `none` | 0% | none | 1 cent | yes |
| `custom` | user | user | user | user |

### 9.2 Table and controller

- The human is always seat 0, drawn at the bottom of the table. Bots fill seats clockwise.
- `useTable` (in `game/controller.ts`) owns the session: stacks, button, hand number, the current `HandState`, the event log so far. It asks bots for actions with a 400 to 900 ms delay (0 when fast-forwarding), and saves each completed hand through the repository.
- Controls: Fold, Check/Call, Bet/Raise with a slider and number input, quick sizes (half pot, two-thirds pot, pot, all-in), keyboard shortcuts F, C, R. Controls are disabled when it is not the human's turn.
- The session's live state (stacks, button, hand number) is saved to localStorage after every hand so a refresh resumes at the next hand. A hand in progress during a refresh is void: stacks return to their pre-hand values and nothing is saved.
- Bot archetype labels are shown in learning mode and hidden in play mode.

### 9.3 Learning mode

On every street, for a learning session:

- All hole cards are face up.
- Each seat shows its win percentage (from `equityKnown` via the worker) and its current made hand.
- The current leader is badged, with the hand it leads with.
- Players behind show their next-card outs (count, and the cards on hover or tap).
- A panel shows the human's pot odds against equity when facing a bet, e.g. "Calling $40 into $120 needs 25%. You have 35%."
- An explanation from `analysis/explain.ts`, built from templates, e.g. "Seat 3 leads with top pair, kings. You have 9 outs to a flush: 35% to win. Seat 2 is drawing to two outs."
- Folded hands stay visible but dimmed, with a note of what they would hold now.

`explain.ts` is a pure function of `(hands, board, equities, outs, pot, toCall)` returning strings, with unit tests on fixed boards.

The hand replayer can show the same overlay for any stored hand.

### 9.4 Bankroll

- **First run:** ask for a starting bankroll and record it as a deposit.
- **Ledger page:** balance, transaction list, deposit and withdraw forms.
- **Sessions:** creating a non-learning session deducts the buy-in; rebuys deduct more; ending a session credits the cash-out (the human's final stack). An unfinished session is listed on the lobby with "Resume" and "End and cash out".
- **Stats (`stats.ts`),** over non-learning hands by default, with a stake filter:
  - Win rate after rake: `sum(heroNet / bigBlind) / hands * 100` in bb/100.
  - Win rate before rake: the same with `heroNet + heroRakePaid`.
  - Total rake paid (`sum(heroRakePaid)`), and rake per 100 hands in big blinds.
  - Standard deviation in bb/100: sample standard deviation of per-hand results in big blinds, times 10.
  - Biggest downswing: the largest peak-to-trough drop of cumulative `heroNet`, in dollars and in buy-ins.
  - VPIP, PFR, went-to-showdown percentages.
- **Dashboard charts:** bankroll over time (cumulative ledger); cumulative winnings by hand with two lines, after rake and before rake, so the cost of rake is visible; results per session.
- **Stake guidance (`guidance.ts`),** with rule `R` (default 25 buy-ins) and `buyIns(stake) = balance / (100 * bigBlind)`:

  | Condition | Banner |
  |---|---|
  | `buyIns(next stake up) >= R` | "You are rolled for {next}. You can take a shot." |
  | `buyIns(current) >= R` | "Properly rolled for {current}: {n} buy-ins." |
  | `buyIns(current) >= 0.75 * R` | "Under-rolled for {current}: {n} buy-ins against a rule of {R}. Be careful." |
  | otherwise | "Move down to {largest preset with buyIns >= R}", or "Below the requirement for the smallest stake" |

  The banner appears on the lobby, the setup form (reacting to the selected stake) and the dashboard.
- **Stop-loss:** optional per session, entered in buy-ins and stored in cents. After any hand where `totalBoughtIn - currentStack >= stopLoss`, show a modal: "Stop-loss reached" with "End session" (primary) and "Keep playing".

### 9.5 Extras

- **Variance simulator (`variance.ts`, `/variance`):** inputs are win rate (bb/100), standard deviation (bb/100), bankroll (big blinds) and hands (default 50,000); defaults are prefilled from the user's own stats when at least 500 hands exist. It simulates 100 paths in steps of 100 hands, each step drawn from a normal distribution (Box-Muller on a seeded RNG). Output: a chart of the paths, the share of paths that hit zero, and the analytical risk of ruin `exp(-2 * WR * BR / SD^2)` (1 when `WR <= 0`).
- **Decision review (`review.ts`):** after a hand, for each human decision facing a bet, compute the human's equity against the opponents' actual hole cards (`equityKnown`). Flag "Called without the odds" when calling with `equity < potOdds - 0.05`, and "Folded with the odds" when folding with `equity > potOdds + 0.05`. Show the flags in a post-hand panel and in the replayer, labelled as measured against the actual hands.
- **Fast-forward:** once the human has folded, a "Skip to next hand" button finishes the hand with no delays. The `autoSkipWhenFolded` setting does it automatically. The hand is still saved.

## 10. Phases

Run the listed verification at the end of every phase and fix failures before moving on. "Standard checks" means:

```bash
pnpm test
pnpm tsc --noEmit
pnpm lint
pnpm build
```

### Phase 1: Engine

**Goal:** a correct, fully tested poker engine with no UI.

Tasks:

1. **1.1 Scaffold.** Next.js (App Router, TypeScript strict, Tailwind, ESLint, `src/` directory, `@/*` alias), pnpm, Vitest. Scripts: `dev`, `build`, `lint` (runs ESLint directly if the installed Next.js has no `next lint`), `test` (`vitest run`). Add the `no-restricted-imports` override for the pure directories. Add `.env.example` and make sure `.env.local` is git-ignored.
2. **1.2** `cards.ts`, `rng.ts`, `deck.ts`.
3. **1.3** `evaluator.ts`, `describe.ts` and the evaluator tests.
4. **1.4** `types.ts`.
5. **1.5** `hand.ts` `createHand`: seating, blinds, dealing, first to act.
6. **1.6** `legal.ts` and `applyAction` betting: rounds, street progression, all-in runout.
7. **1.7** `pots.ts`: uncalled return, side pots, odd chip.
8. **1.8** `rake.ts`, showdown, awarding, `hand_completed`.
9. **1.9** `table.ts` and `replay.ts`.
10. **1.10** `equity.ts`, `outs.ts` and their tests.
11. **1.11** Every test in section 4.11 exists and passes.

Creates: everything under `src/engine/`, project config files.

Acceptance: standard checks pass. `pnpm test` shows every test named in section 4.11. No file in `src/engine/` imports anything outside `src/engine/`.

### Phase 2: Table UI

**Goal:** play complete hands in the browser against placeholder bots (random choice between check/call and fold, never raising).

Tasks:

1. **2.1** `game/controller.ts` `useTable`: in-memory session, hand loop, bot turns with delays.
2. **2.2** Lobby setup form: opponents (1 to 8, default 3), stakes preset, buy-in. No persistence yet.
3. **2.3** Table components: seats, hole cards, board, pot and side pots, button and blind markers, stacks, current bets, action log.
4. **2.4** Action controls with slider, quick sizes and keyboard shortcuts.
5. **2.5** Hand end: showdown display, winner highlight, pot awards, rake taken, "Next hand"; rebuy prompt when the human busts.
6. **2.6** Responsive layout that works at phone width and desktop.

Creates: `src/game/controller.ts`, `src/components/*`, `src/app/page.tsx`, `src/app/play/[sessionId]/page.tsx`.

Acceptance: standard checks pass. By hand with `pnpm dev`: start a game with 3 opponents and with 8; play 10 hands including a fold, a call to showdown, a raise and an all-in; stacks, pots and the button move correctly; illegal bet sizes cannot be submitted; heads-up (1 opponent) blinds are right.

### Phase 3: Bots

**Goal:** opponents that play recognisably different styles.

Tasks:

1. **3.1** `chen.ts` with tests on the values in section 5.1.
2. **3.2** `view.ts` (`BotView`), with a test that it contains no other seat's hole cards and no deck.
3. **3.3** `profiles.ts`.
4. **3.4** `decide.ts` preflop.
5. **3.5** `decide.ts` postflop.
6. **3.6** Wire bots into the controller; the setup form gets a bot mix choice (default: random mix; or pick an archetype per seat).
7. **3.7** Sanity simulation test: 5,000 bot-only hands across all archetypes with no illegal action and chips conserved; assert the VPIP ordering tight-aggressive < loose-passive < calling station and that the maniac raises preflop most often.

Creates: everything under `src/bots/`.

Acceptance: standard checks pass. By hand: play 20 hands against one of each archetype; the maniac raises often, the calling station rarely folds, the tight-aggressive bot folds most hands. A bot decision takes under 100 ms.

### Phase 4: Persistence

**Goal:** every hand is stored and replayable; the app is passphrase-protected; it still runs with no database.

Tasks:

1. **4.1** `db/schema.ts`, `drizzle.config.ts`; generate the first migration with `pnpm drizzle-kit generate` (needs no database). Add scripts `db:generate` and `db:migrate`.
2. **4.2** `db/client.ts` (returns `null` when `DATABASE_URL` is unset), `server/auth.ts`, `server/validate.ts` (zod schemas), with unit tests for auth.
3. **4.3** Routes: health, unlock, lock.
4. **4.4** Routes: settings, sessions (create, get, list, rebuy, end), bankroll.
5. **4.5** Routes: hands (idempotent POST, list, summaries, by id).
6. **4.6** `data/summarize.ts` with tests (net, rake share, VPIP, PFR, position, showdown).
7. **4.7** `Repository`, `LocalRepository`, `HttpRepository`, `retryQueue.ts`, with tests for `LocalRepository` and the queue.
8. **4.8** Unlock screen and gating; the controller creates sessions, saves every hand, resumes an unfinished session, ends sessions.
9. **4.9** History list and hand replayer (step through events, forwards and back).

Creates: `src/db/*`, `src/server/*`, `src/data/*`, `src/app/api/**`, `src/app/unlock`, `src/app/history/**`, `drizzle/`.

Acceptance: standard checks pass. By hand with `DATABASE_URL` unset: play 5 hands, refresh, the session resumes; all 5 hands appear in history and replay correctly; the "local storage only" badge shows. With `APP_PASSPHRASE` set in `.env.local`: `/api/settings` returns 401 without the cookie (check with `curl`), the unlock screen rejects a wrong passphrase and accepts the right one. The database-backed path is verified by the user later (section 11); do not run anything against a real `DATABASE_URL`.

### Phase 5: Learning mode

**Goal:** a mode that shows all cards and explains who is winning on every street.

Tasks:

1. **5.1** `workers/equity.worker.ts` and `equityClient.ts` (typed request/response with request ids; stale responses are dropped).
2. **5.2** `analysis/explain.ts` with tests.
3. **5.3** Learning mode chosen on the setup form; sessions and hands carry the flag; a clear "Learning mode: play money" banner on the table.
4. **5.4** Learning UI: face-up cards, win percentage per seat, leader badge, made-hand labels, outs.
5. **5.5** Pot odds against equity panel and the per-street explanation panel.
6. **5.6** Learning overlay available in the hand replayer.

Creates: `src/workers/*`, `src/analysis/explain.ts`, learning components.

Acceptance: standard checks pass, and `pnpm build` bundles the worker without warnings. By hand: start a learning session; percentages across seats sum to about 100 and update on each street; the leader and explanation match the cards; on the river the leader shows 100% (or a tie); the UI stays responsive while preflop equity computes.

### Phase 6: Bankroll

**Goal:** bankroll, stakes, rake and the dashboard that teaches stake selection.

Tasks:

1. **6.1** `bankroll/presets.ts`; setup form gets rake preset and custom rake fields, custom stakes, buy-in limits.
2. **6.2** First-run starting bankroll; ledger page with deposit and withdraw.
3. **6.3** Buy-in, rebuy and cash-out wired to the ledger, including the insufficient-bankroll case; learning sessions leave the ledger untouched.
4. **6.4** `stats.ts` with tests on hand-built fixtures.
5. **6.5** Dashboard: stat tiles and the three charts, stake filter, "include learning hands" toggle.
6. **6.6** `guidance.ts` with tests; banner on lobby, setup form and dashboard.
7. **6.7** Stop-loss setting and modal.
8. **6.8** Settings page (buy-in rule, defaults, rake defaults, stop-loss default, auto-skip).

Creates: `src/bankroll/*`, `src/app/bankroll`, `src/app/settings`, chart components.

Acceptance: standard checks pass. By hand: set a $2,000 bankroll; the banner says under-rolled or move down for 2/5 and reacts when the stake changes; buy in at 1/2 for $200 and the balance drops to $1,800; play, end the session, and the balance rises by the final stack; the rake line on the winnings chart sits above the after-rake line; a learning session changes neither the balance nor the stats; a stop-loss of 1 buy-in triggers the modal after losing a buy-in.

### Phase 7: Extras and deploy prep

**Goal:** the three extras, and a repo the user can deploy.

Tasks:

1. **7.1** `bankroll/variance.ts` with tests (seeded paths reproducible; risk of ruin formula); `/variance` page.
2. **7.2** `analysis/review.ts` with tests; post-hand review panel and replayer flags.
3. **7.3** Fast-forward button and the auto-skip setting.
4. **7.4** `README.md`: what the app is, local development, and the user's setup and deploy steps from section 11 with exact commands.
5. **7.5** Final pass: empty states, error states, the sync-queue indicator, navigation between all pages; full standard checks.

Creates: `src/bankroll/variance.ts`, `src/analysis/review.ts`, `src/app/variance`, `README.md`.

Acceptance: standard checks pass. By hand: the variance page draws 100 paths and changing the win rate changes the risk of ruin; a deliberately bad call is flagged in the review panel; "Skip to next hand" finishes a folded hand instantly and the hand is in history. Then stop and tell the user the build is ready for their steps in section 11.

## 11. User does these

The builder prepares the commands and README instructions but **does not run any of these**, even if credentials are present:

1. Create the Vercel project and connect the repository.
2. Add Neon Postgres from the Vercel Marketplace (Storage tab), which sets `DATABASE_URL` on the project.
3. Set `APP_PASSPHRASE` in the Vercel project's environment variables.
4. Pull env vars locally (`vercel env pull .env.local`) or paste them into `.env.local`.
5. Run the migrations: `pnpm db:migrate`.
6. Deploy (push to the connected branch, or `vercel --prod`).
7. Smoke test on the deployed URL: unlock, set a bankroll, play a hand, confirm it appears in history after a refresh on another device.

Git commits and pushes are also the user's.

## 12. Known pitfalls

- **Scaffolding into a non-empty directory.** `create-next-app` may refuse because `PLAN.md`, `PROGRESS.md` and `CLAUDE.md` exist. Scaffold into a temporary subdirectory and move the files up, without overwriting these three.
- **Next.js version differences.** Use the installed version's conventions: dynamic route `params` and `cookies()` may be async. Check the docs for the installed version instead of assuming.
- **Side pots.** Build them from `committedHand` including folded players' chips. A folded player is never eligible but their chips count. Test with the three-all-in case before trusting it.
- **All-in edge cases.** A short big blind; a short all-in call; an incomplete raise that leaves earlier actors able to call but not raise; everyone all-in preflop (board runs out, rake applies because a flop is dealt); the last `active` player facing only all-ins must still be allowed to call or fold but not raise.
- **Uncalled bets** must be returned before pots and rake are computed, or the rake is overcharged.
- **Float money.** Never. Integer cents and `Math.floor` for rake; basis points for percentages.
- **Engine purity.** No `Math.random`, `Date.now`, `crypto.randomUUID` or imports from UI code inside the pure directories. Ids and timestamps are passed in.
- **Bot cheating.** Bots receive a `BotView`, never the `HandState`.
- **Web Worker in Next.js.** Create it inside `useEffect` in a client component with `new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' })`. Never construct it during server rendering. Terminate it on unmount. The worker file may import only from pure directories.
- **Passphrase.** Never trust a client-side check. Every protected route handler calls `requireAuth`. Never put the passphrase in a `NEXT_PUBLIC_` variable, in localStorage, or in a non-httpOnly cookie.
- **Idempotent saves.** Hand and transaction ids are generated on the client so retries cannot duplicate rows.
- **localStorage** is unavailable during server rendering and can throw; wrap access and only touch it in effects or event handlers.
- **Recharts** components are client-only; put them in client components.
