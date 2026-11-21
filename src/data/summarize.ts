import type { HandEvent } from '@/engine';
import type { HandSummary, StoredHand } from './types';

type Ev<T extends HandEvent['type']> = Extract<HandEvent, { type: T }>;
type Position = HandSummary['heroPosition'];

export const ENGINE_VERSION = 1;

/**
 * Position of `seat` given the dealt-in seats and the button. Heads-up the
 * button is BTN (it also posts the small blind). Seats between the big blind
 * and the button are UTG (first), CO (last before the button) and MP.
 */
export function positionOf(seat: number, seats: readonly number[], buttonSeat: number): Position {
  const sorted = [...seats].sort((a, b) => a - b);
  const n = sorted.length;
  const b = sorted.indexOf(buttonSeat);
  const offset = (sorted.indexOf(seat) - b + n) % n; // 0 = button, 1 = next clockwise, ...
  if (offset === 0) return 'BTN';
  if (n === 2) return 'BB';
  if (offset === 1) return 'SB';
  if (offset === 2) return 'BB';
  if (offset === 3) return 'UTG';
  if (offset === n - 1) return 'CO';
  return 'MP';
}

/** Derive every summary column from a completed hand's event log (PLAN 6). */
export function summarize(
  events: readonly HandEvent[],
  opts: { sessionId: string; playedAt: string; learningMode: boolean; heroSeat: number },
): StoredHand {
  const started = events.find((e): e is Ev<'hand_started'> => e.type === 'hand_started');
  const completed = events.find((e): e is Ev<'hand_completed'> => e.type === 'hand_completed');
  if (!started || !completed) throw new Error('summarize needs a completed hand');
  const hero = opts.heroSeat;

  const holes = events.find((e): e is Ev<'hole_cards_dealt'> => e.type === 'hole_cards_dealt' && e.seat === hero);
  if (!holes) throw new Error('Hero was not dealt in');
  const streets = events.filter((e): e is Ev<'street_dealt'> => e.type === 'street_dealt');
  const board = streets.length ? streets[streets.length - 1].board.join('') : '';
  const awards = events.filter((e): e is Ev<'pot_awarded'> => e.type === 'pot_awarded');
  const rakeEvent = events.find((e): e is Ev<'rake_taken'> => e.type === 'rake_taken');
  const actions = events.filter((e): e is Ev<'action'> => e.type === 'action');

  const heroPre = actions.filter((a) => a.seat === hero && a.street === 'preflop');
  const heroVpip = heroPre.some((a) => a.action === 'call' || a.action === 'bet' || a.action === 'raise');
  const heroPfr = heroPre.some((a) => a.action === 'bet' || a.action === 'raise');
  const heroFoldedPreflop = heroPre.some((a) => a.action === 'fold');
  const flopDealt = streets.some((s) => s.street === 'flop');

  // Rake attributed to the hero: for each pot, the rake taken from it times
  // the hero's share of what that pot paid out.
  let heroRakePaid = 0;
  for (const award of awards) {
    const fromPot = rakeEvent?.fromPots[award.potIndex] ?? 0;
    if (fromPot === 0) continue;
    const heroAmount = award.winners.find((w) => w.seat === hero)?.amount ?? 0;
    if (heroAmount === 0) continue;
    const share = award.amount > 0 ? heroAmount / award.amount : 1 / award.winners.length;
    heroRakePaid += fromPot * share;
  }

  const heroNet = completed.stacks.find((s) => s.seat === hero)?.net ?? 0;
  const potAwarded = awards.reduce((a, p) => a + p.amount, 0);

  return {
    id: started.handId,
    sessionId: opts.sessionId,
    handNumber: started.handNumber,
    playedAt: opts.playedAt,
    learningMode: opts.learningMode,
    smallBlind: started.config.smallBlind,
    bigBlind: started.config.bigBlind,
    numPlayers: started.seats.length,
    heroSeat: hero,
    buttonSeat: started.buttonSeat,
    heroPosition: positionOf(
      hero,
      started.seats.map((s) => s.seat),
      started.buttonSeat,
    ),
    heroHoleCards: holes.cards.join(''),
    board,
    potTotal: potAwarded + completed.rake,
    rake: completed.rake,
    heroNet,
    heroRakePaid: Math.round(heroRakePaid),
    heroVpip,
    heroPfr,
    heroSawFlop: flopDealt && !heroFoldedPreflop,
    wentToShowdown: events.some((e) => e.type === 'showdown' && e.seat === hero),
    heroWon: heroNet > 0,
    engineVersion: ENGINE_VERSION,
    events: [...events],
  };
}
