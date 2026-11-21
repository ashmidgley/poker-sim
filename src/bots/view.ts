import {
  legalActions,
  replay,
  type ActionType,
  type Card,
  type HandState,
  type LegalActions,
  type SeatStatus,
  type Street,
} from '@/engine';

/** Public information about a seat: nothing a player at the table could not see. */
export interface PublicSeat {
  seat: number;
  stack: number;
  committedStreet: number;
  committedHand: number;
  status: SeatStatus;
}

export interface PublicAction {
  street: Street;
  seat: number;
  action: ActionType;
  to: number; // the seat's street commitment after acting
  allIn: boolean;
}

/**
 * Everything a bot may use to decide. Built from the HandState but limited
 * to what a player in that seat would see: its own hole cards, the board,
 * stacks, bets, positions and the action so far. Never other hole cards or
 * the deck.
 */
export interface BotView {
  seat: number;
  holeCards: [Card, Card];
  board: Card[];
  street: Street;
  bigBlind: number;
  buttonSeat: number;
  seats: PublicSeat[]; // clockwise by seat number
  pot: number; // all chips committed this hand, including current bets
  currentBet: number;
  toCall: number;
  history: PublicAction[];
  legal: LegalActions;
}

export function buildBotView(state: HandState): BotView {
  const legal = legalActions(state);
  if (!legal) throw new Error('No seat to act');
  const me = state.seats.find((s) => s.seat === legal.seat)!;

  // Action streets are not stored on HandState; replaying the public actions
  // recovers them. Only the action events are kept.
  const history: PublicAction[] = replay(state.input, state.actions)
    .events.filter((e) => e.type === 'action')
    .map((e) => ({ street: e.street, seat: e.seat, action: e.action, to: e.to, allIn: e.allIn }));

  return {
    seat: me.seat,
    holeCards: [me.holeCards[0], me.holeCards[1]],
    board: state.board.slice(),
    street: state.phase as Street,
    bigBlind: state.input.config.bigBlind,
    buttonSeat: state.input.buttonSeat,
    seats: state.seats.map((s) => ({
      seat: s.seat,
      stack: s.stack,
      committedStreet: s.committedStreet,
      committedHand: s.committedHand,
      status: s.status,
    })),
    pot: state.seats.reduce((a, s) => a + s.committedHand, 0),
    currentBet: state.currentBet,
    toCall: Math.max(0, state.currentBet - me.committedStreet),
    history,
    legal,
  };
}
