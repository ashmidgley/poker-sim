import { categoryName, describeScore, evaluate, rankOf, suitOf, type Card } from '@/engine';
import { formatMoney } from '@/lib/format';

/**
 * Learning-mode explanations (PLAN 9.3): pure templates over the hands, the
 * board, each player's equity and next-card outs. Equity comes from the
 * worker; everything else is computed here.
 */

export interface ExplainPlayer {
  seat: number;
  name: string;
  isHero: boolean;
  cards: [Card, Card];
  folded: boolean;
  equity: number | null; // 0..1, null while computing
  outs: Card[] | null; // next-card outs when behind on the flop or turn
}

export interface ExplainInput {
  players: ExplainPlayer[];
  board: Card[];
  pot: number; // all chips committed this hand, including current bets
  toCall: number; // what the hero must add to call (0 if not facing a bet)
  heroToAct: boolean;
}

export interface Explanation {
  headline: string | null;
  lines: string[];
  leaderSeats: number[];
  potOdds: { need: number; have: number; profitable: boolean; text: string } | null;
}

const RANK_SYMBOL: Record<string, string> = { T: '10' };
/** Lowercase a leading word ("Pair of kings" -> "pair of kings") but not a card rank ("A-Q offsuit"). */
const lc = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "Pocket kings", "A-K suited", "10-9 offsuit". */
export function preflopLabel(cards: readonly [Card, Card]): string {
  const [a, b] = rankOf(cards[0]) >= rankOf(cards[1]) ? cards : [cards[1], cards[0]];
  if (a[0] === b[0]) return `Pocket ${pairName(a)}`;
  const r = (c: Card) => RANK_SYMBOL[c[0]] ?? c[0];
  return `${r(a)}-${r(b)} ${suitOf(a) === suitOf(b) ? 'suited' : 'offsuit'}`;
}

const PAIR_NAMES: Record<string, string> = {
  '2': 'deuces',
  '3': 'threes',
  '4': 'fours',
  '5': 'fives',
  '6': 'sixes',
  '7': 'sevens',
  '8': 'eights',
  '9': 'nines',
  T: 'tens',
  J: 'jacks',
  Q: 'queens',
  K: 'kings',
  A: 'aces',
};
const pairName = (c: Card) => PAIR_NAMES[c[0]];

/** What the player holds now: a made hand from the flop on, a starting-hand label preflop. */
export function madeHandLabel(cards: readonly [Card, Card], board: readonly Card[]): string {
  return board.length < 3 ? preflopLabel(cards) : describeScore(evaluate([...cards, ...board]));
}

const IMPROVE_TO: Record<string, string> = {
  Pair: 'a pair',
  'Two pair': 'two pair',
  'Three of a kind': 'trips',
  Straight: 'a straight',
  Flush: 'a flush',
  'Full house': 'a full house',
  'Four of a kind': 'quads',
  'Straight flush': 'a straight flush',
  'High card': 'a better high card',
};

/** "8 to a flush, 1 to a straight": what each out turns the hand into, most common first. */
export function describeOuts(cards: readonly [Card, Card], board: readonly Card[], outs: readonly Card[]): string {
  const groups = new Map<string, number>();
  for (const out of outs) {
    const name = IMPROVE_TO[categoryName(evaluate([...cards, ...board, out]))];
    groups.set(name, (groups.get(name) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([name, n]) => `${n} to ${name}`)
    .join(', ');
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function explain(input: ExplainInput): Explanation {
  const { players, board } = input;
  const live = players.filter((p) => !p.folded);
  const street = board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river';
  const known = live.every((p) => p.equity !== null);
  if (!known || live.length === 0) return { headline: null, lines: [], leaderSeats: [], potOdds: null };

  const best = Math.max(...live.map((p) => p.equity!));
  const leaders = live.filter((p) => Math.abs(p.equity! - best) < 1e-9);
  const leaderSeats = leaders.map((p) => p.seat);
  const leader = leaders[0];
  const label = (p: ExplainPlayer) => madeHandLabel(p.cards, board);
  const lines: string[] = [];

  // Headline: who is ahead.
  let headline: string;
  if (street === 'river') {
    headline =
      leaders.length > 1
        ? `${joinNames(leaders.map((p) => p.name))} split the pot with ${lc(label(leader))}.`
        : `${leader.name} ${leader.isHero ? 'win' : 'wins'} with ${lc(label(leader))}.`;
  } else if (street === 'preflop') {
    headline =
      leaders.length > 1
        ? `${joinNames(leaders.map((p) => p.name))} are level at ${pct(best)} each.`
        : `${leader.name} ${leader.isHero ? 'are' : 'is'} the favourite with ${lc(label(leader))} (${pct(best)}).`;
  } else {
    headline =
      leaders.length > 1
        ? `${joinNames(leaders.map((p) => p.name))} are level with ${lc(label(leader))} (${pct(best)} each).`
        : `${leader.name} ${leader.isHero ? 'lead' : 'leads'} with ${lc(label(leader))} (${pct(best)} to win).`;
  }

  // One line per player behind, hero first.
  if (street !== 'river') {
    const behind = live.filter((p) => !leaderSeats.includes(p.seat)).sort((a, b) => Number(b.isHero) - Number(a.isHero));
    for (const p of behind) {
      const you = p.isHero;
      const who = you ? 'You' : p.name;
      const eq = pct(p.equity!);
      if (street === 'preflop') {
        lines.push(`${who} ${you ? 'win' : 'wins'} ${eq} of the time with ${lc(label(p))} against these hands.`);
        continue;
      }
      const outs = p.outs ?? [];
      const holding = `${who} ${you ? 'have' : 'has'} ${lc(label(p))}`;
      if (p.equity === 0) {
        lines.push(`${holding} and ${you ? 'are' : 'is'} drawing dead.`);
      } else if (outs.length === 0) {
        lines.push(`${holding}. No single card puts ${you ? 'you' : 'them'} ahead; ${you ? 'you need' : 'they need'} help on both the turn and river (${eq}).`);
      } else {
        lines.push(`${holding}, drawing to ${outs.length} out${outs.length === 1 ? '' : 's'} (${describeOuts(p.cards, board, outs)}): ${eq} to win.`);
      }
    }
  }

  // Pot odds against equity when the hero faces a bet.
  let potOdds: Explanation['potOdds'] = null;
  const hero = live.find((p) => p.isHero);
  if (hero && input.heroToAct && input.toCall > 0 && street !== 'river') {
    const need = input.toCall / (input.pot + input.toCall);
    const have = hero.equity!;
    const profitable = have >= need;
    potOdds = {
      need,
      have,
      profitable,
      text:
        `Calling ${formatMoney(input.toCall)} into ${formatMoney(input.pot)} needs ${pct(need)}. You have ${pct(have)}. ` +
        (profitable ? 'Calling shows a profit on pot odds alone.' : 'On pot odds alone this is a fold.'),
    };
  } else if (hero && input.heroToAct && input.toCall > 0 && street === 'river') {
    const need = input.toCall / (input.pot + input.toCall);
    const have = hero.equity!;
    potOdds = {
      need,
      have,
      profitable: have >= need,
      text: `Calling ${formatMoney(input.toCall)} into ${formatMoney(input.pot)} needs ${pct(need)}. With every card known, you ${
        have === 1 ? 'win' : have > 0 ? 'split' : 'lose'
      }.`,
    };
  }

  return { headline, lines, leaderSeats, potOdds };
}
