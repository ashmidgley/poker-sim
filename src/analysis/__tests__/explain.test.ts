import { describe, expect, it } from 'vitest';
import { equityKnown, mulberry32, nextCardOuts, parseCards, type Card } from '@/engine';
import { describeOuts, explain, madeHandLabel, preflopLabel, type ExplainPlayer } from '../explain';

const c = (s: string) => parseCards(s) as [Card, Card];

/** Build players with real equities and outs for a fixed spot. */
function spot(hands: { name: string; cards: string; hero?: boolean; folded?: boolean }[], boardText: string) {
  const board = parseCards(boardText);
  const live = hands.filter((h) => !h.folded);
  const eq = equityKnown(live.map((h) => c(h.cards)), board, mulberry32(1));
  const outs = nextCardOuts(live.map((h) => c(h.cards)), board);
  const players: ExplainPlayer[] = hands.map((h, seat) => {
    const li = live.indexOf(h);
    return {
      seat,
      name: h.hero ? 'You' : h.name,
      isHero: !!h.hero,
      cards: c(h.cards),
      folded: !!h.folded,
      equity: li >= 0 ? eq[li].equity : null,
      outs: li >= 0 ? (outs.find((o) => o.seatIndex === li)?.outs ?? []) : null,
    };
  });
  return { players, board };
}

describe('Learning explanations', () => {
  it('labels starting hands and made hands', () => {
    expect(preflopLabel(c('Kd Ks'))).toBe('Pocket kings');
    expect(preflopLabel(c('Kh As'))).toBe('A-K offsuit');
    expect(preflopLabel(c('9s Ts'))).toBe('10-9 suited');
    expect(madeHandLabel(c('Ah 5h'), parseCards('2h 7h Jc'))).toBe('Ace high');
    expect(madeHandLabel(c('Kc Kd'), parseCards('2h 7h Jc'))).toBe('Pair of kings');
  });

  it('flop: names the leader and explains the hero draw with its outs', () => {
    const { players, board } = spot(
      [
        { name: 'You', cards: 'Ah 5h', hero: true },
        { name: 'Ava', cards: 'Kc Kd' },
      ],
      '2h 7h Jc',
    );
    const e = explain({ players, board, pot: 1200, toCall: 400, heroToAct: true });
    expect(e.leaderSeats).toEqual([1]);
    expect(e.headline).toMatch(/^Ava leads with pair of kings \(\d+% to win\)\.$/);
    expect(e.lines[0]).toMatch(/^You have ace high, drawing to 12 outs \(9 to a flush, 3 to a pair\): \d+% to win\.$/);
    expect(e.potOdds!.text).toMatch(/^Calling \$4 into \$12 needs 25%\. You have \d+%\./);
    expect(e.potOdds!.need).toBeCloseTo(0.25);
    expect(e.potOdds!.profitable).toBe(e.potOdds!.have >= 0.25);
  });

  it('turn: a hand with no outs and no equity is drawing dead', () => {
    const { players, board } = spot(
      [
        { name: 'You', cards: 'Ah 2c', hero: true },
        { name: 'Bruno', cards: 'Kc Qd' },
      ],
      '3h 7h 9h Jh',
    );
    const e = explain({ players, board, pot: 1000, toCall: 0, heroToAct: false });
    expect(e.headline).toBe('You lead with flush, ace high (100% to win).');
    expect(e.lines).toEqual(['Bruno has king high and is drawing dead.']);
    expect(e.potOdds).toBeNull();
  });

  it('preflop: favourite and the hero win rate', () => {
    const { players, board } = spot(
      [
        { name: 'You', cards: 'Kd Kc', hero: true },
        { name: 'Chen', cards: 'As Ah' },
      ],
      '',
    );
    const e = explain({ players, board, pot: 300, toCall: 0, heroToAct: false });
    expect(e.headline).toMatch(/^Chen is the favourite with pocket aces \(8\d%\)\.$/);
    expect(e.lines[0]).toMatch(/^You win 1\d% of the time with pocket kings against these hands\.$/);
  });

  it('river: a split pot names both players; folded players are left out', () => {
    const { players, board } = spot(
      [
        { name: 'You', cards: '2c 3d', hero: true },
        { name: 'Dara', cards: '4c 5d' },
        { name: 'Eli', cards: 'Kc Kd', folded: true },
      ],
      'Ah Kh Qh Jh Th',
    );
    const e = explain({ players, board, pot: 900, toCall: 0, heroToAct: false });
    expect(e.headline).toBe('You and Dara split the pot with royal flush.');
    expect(e.leaderSeats).toEqual([0, 1]);
    expect(e.lines).toEqual([]);
  });

  it('waits for equity before explaining', () => {
    const { players, board } = spot([{ name: 'You', cards: 'Ah 5h', hero: true }, { name: 'Ava', cards: 'Kc Kd' }], '2h 7h Jc');
    const e = explain({ players: players.map((p) => ({ ...p, equity: null })), board, pot: 0, toCall: 0, heroToAct: false });
    expect(e.headline).toBeNull();
  });

  it('keeps card ranks capitalised mid-sentence', () => {
    const { players, board } = spot(
      [
        { name: 'You', cards: 'Qd Ah', hero: true },
        { name: 'Ava', cards: '7c 6d' },
      ],
      '',
    );
    expect(explain({ players, board, pot: 300, toCall: 0, heroToAct: false }).headline).toMatch(
      /^You are the favourite with A-Q offsuit \(\d+%\)\.$/,
    );
  });

  it('describes what outs improve to', () => {
    expect(describeOuts(c('8h 9h'), parseCards('Th Jc 2h'), parseCards('Qd 7c 3h'))).toBe('2 to a straight, 1 to a flush');
  });
});
