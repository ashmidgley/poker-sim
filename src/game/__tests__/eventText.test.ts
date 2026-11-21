import { describe, expect, it } from 'vitest';
import { eventText } from '../eventText';

const name = (seat: number) => (seat === 0 ? 'You' : 'Ava');

describe('Action log text', () => {
  it('conjugates for "You" and for bots', () => {
    const act = (seat: number, action: 'fold' | 'raise') =>
      eventText({ type: 'action', street: 'flop', seat, action, added: 400, to: 400, allIn: false, potAfter: 0 }, name);
    expect(act(0, 'fold')).toBe('You fold.');
    expect(act(1, 'fold')).toBe('Ava folds.');
    expect(act(0, 'raise')).toBe('You raise to $4.');
    expect(eventText({ type: 'blind_posted', seat: 0, kind: 'bb', amount: 150, allIn: true }, name)).toBe(
      'You post the big blind $1.50 and are all-in.',
    );
    expect(
      eventText({ type: 'pot_awarded', potIndex: 1, amount: 900, winners: [{ seat: 0, amount: 900 }], description: 'Flush, ace high' }, name),
    ).toBe('You ($9) win side pot 1 with flush, ace high.');
  });
});
