import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** PLAN section 6. All money columns are integer cents. */

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1), // single row
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
  stopLossBuyIns: integer('stop_loss_buy_ins'), // null = off
  autoSkipWhenFolded: boolean('auto_skip_when_folded').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(), // client-generated
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
  botProfiles: jsonb('bot_profiles').notNull(), // string[] of archetype ids by bot seat
  stopLoss: integer('stop_loss'), // cents, null = off
  totalBoughtIn: integer('total_bought_in').notNull(),
  cashedOut: integer('cashed_out'), // null until ended
  handsPlayed: integer('hands_played').notNull().default(0),
});

export const hands = pgTable(
  'hands',
  {
    id: uuid('id').primaryKey(), // client-generated; makes POST idempotent
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    handNumber: integer('hand_number').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    learningMode: boolean('learning_mode').notNull(),
    smallBlind: integer('small_blind').notNull(),
    bigBlind: integer('big_blind').notNull(),
    numPlayers: integer('num_players').notNull(),
    heroSeat: integer('hero_seat').notNull(),
    buttonSeat: integer('button_seat').notNull(),
    heroPosition: text('hero_position').notNull(), // BTN, SB, BB, UTG, MP, CO
    heroHoleCards: text('hero_hole_cards').notNull(), // e.g. "AsKd"
    board: text('board').notNull(), // "" to 10 chars
    potTotal: integer('pot_total').notNull(), // before rake
    rake: integer('rake').notNull(),
    heroNet: integer('hero_net').notNull(), // after rake
    heroRakePaid: integer('hero_rake_paid').notNull(),
    heroVpip: boolean('hero_vpip').notNull(),
    heroPfr: boolean('hero_pfr').notNull(),
    heroSawFlop: boolean('hero_saw_flop').notNull(),
    wentToShowdown: boolean('went_to_showdown').notNull(),
    heroWon: boolean('hero_won').notNull(),
    engineVersion: integer('engine_version').notNull().default(1),
    events: jsonb('events').notNull(), // HandEvent[]
  },
  (t) => [uniqueIndex('hands_session_number').on(t.sessionId, t.handNumber), index('hands_played_at').on(t.playedAt)],
);

export const bankrollTransactions = pgTable('bankroll_transactions', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  type: text('type').notNull(), // deposit | withdrawal | buy_in | cash_out
  amount: integer('amount').notNull(), // signed: buy_in and withdrawal negative
  sessionId: uuid('session_id').references(() => sessions.id),
  note: text('note'),
});
