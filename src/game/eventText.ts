import type { HandEvent } from '@/engine';
import { formatMoney } from '@/lib/format';

export type NameOf = (seat: number) => string;

const pretty = (cards: string[]) =>
  cards.map((c) => `${c[0] === 'T' ? '10' : c[0]}${{ c: '♣', d: '♦', h: '♥', s: '♠' }[c[1]]}`).join(' ');

/** "Ava folds" but "You fold": third-person verbs for everyone except "You". */
function verb(who: string, thirdPerson: string): string {
  if (who !== 'You') return thirdPerson;
  const irregular: Record<string, string> = { is: 'are', has: 'have' };
  return irregular[thirdPerson] ?? thirdPerson.replace(/s$/, '');
}

/** One line of the action log for an event, or null for events not shown. */
export function eventText(e: HandEvent, name: NameOf, opts: { showHoleCards?: (seat: number) => boolean } = {}): string | null {
  switch (e.type) {
    case 'hand_started':
      return `Hand #${e.handNumber}. ${name(e.buttonSeat)} ${verb(name(e.buttonSeat), 'has')} the button.`;
    case 'blind_posted':
      return `${name(e.seat)} ${verb(name(e.seat), 'posts')} the ${e.kind === 'sb' ? 'small' : 'big'} blind ${formatMoney(e.amount)}${e.allIn ? ` and ${verb(name(e.seat), 'is')} all-in` : ''}.`;
    case 'hole_cards_dealt':
      return opts.showHoleCards?.(e.seat) ? `${name(e.seat)} ${verb(name(e.seat), 'is')} dealt ${pretty(e.cards)}.` : null;
    case 'action': {
      const who = name(e.seat);
      const allIn = e.allIn ? ' (all-in)' : '';
      switch (e.action) {
        case 'fold':
          return `${who} ${verb(who, 'folds')}.`;
        case 'check':
          return `${who} ${verb(who, 'checks')}.`;
        case 'call':
          return `${who} ${verb(who, 'calls')} ${formatMoney(e.added)}${allIn}.`;
        case 'bet':
          return `${who} ${verb(who, 'bets')} ${formatMoney(e.to)}${allIn}.`;
        case 'raise':
          return `${who} ${verb(who, 'raises')} to ${formatMoney(e.to)}${allIn}.`;
      }
      return null;
    }
    case 'uncalled_returned':
      return `Uncalled ${formatMoney(e.amount)} returned to ${name(e.seat)}.`;
    case 'street_dealt':
      return `${e.street[0].toUpperCase()}${e.street.slice(1)}: ${pretty(e.cards)}  [${pretty(e.board)}]`;
    case 'all_in_runout':
      return 'All-in: running out the board.';
    case 'showdown':
      return `${name(e.seat)} ${verb(name(e.seat), 'shows')} ${pretty(e.cards)}: ${e.description}.`;
    case 'rake_taken':
      return `Rake: ${formatMoney(e.amount)}.`;
    case 'pot_awarded': {
      const pot = e.potIndex === 0 ? 'the main pot' : `side pot ${e.potIndex}`;
      const winners = e.winners.map((w) => `${name(w.seat)} (${formatMoney(w.amount)})`).join(' and ');
      const split = e.winners.length > 1 ? 'split ' : `${verb(name(e.winners[0].seat), 'wins')} `;
      return `${winners} ${split}${pot}${e.description ? ` with ${e.description.toLowerCase()}` : ''}.`;
    }
    case 'hand_completed':
      return null;
  }
}

export { pretty as prettyCards };
