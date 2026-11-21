import type { Card } from './cards';

export type { Card };

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type Phase = Street | 'complete';
export type SeatStatus = 'active' | 'folded' | 'allIn';

/** All money amounts are integer cents. */
export interface RakeConfig {
  percentBps: number; // 500 = 5%
  cap: number; // cents; 0 means no cap
  roundTo: number; // cents; rake is floored to a multiple of this (>= 1)
  noFlopNoDrop: boolean;
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  rake: RakeConfig;
}

export interface SeatInput {
  seat: number; // 0..8, stable for the session; the human is seat 0
  playerId: string;
  name: string;
  isHuman: boolean;
  stack: number; // > 0
}

export interface NewHandInput {
  handId: string;
  handNumber: number; // 1-based within the session
  sessionSeed: string;
  config: TableConfig;
  buttonSeat: number;
  seats: SeatInput[]; // 2..9 seats, only players being dealt in
}

export interface SeatState extends SeatInput {
  startingStack: number;
  holeCards: [Card, Card];
  status: SeatStatus;
  committedStreet: number; // chips put in on the current street
  committedHand: number; // chips put in this hand
  actedThisStreet: boolean;
  raiseRightsOpen: boolean;
}

export interface Pot {
  amount: number;
  eligible: number[]; // seat numbers
}

export interface HandState {
  input: NewHandInput;
  seats: SeatState[]; // ordered clockwise by seat number
  deck: Card[]; // undealt cards
  board: Card[];
  phase: Phase;
  currentBet: number; // highest committedStreet this street
  lastFullRaiseSize: number;
  toAct: number | null; // seat number
  lastAggressor: number | null; // last bet/raise on the current street
  flopDealt: boolean;
  rake: number;
  actions: Action[]; // every player action so far, for replay
}

export type Action =
  | { type: 'fold'; seat: number }
  | { type: 'check'; seat: number }
  | { type: 'call'; seat: number }
  | { type: 'bet'; seat: number; to: number } // to = total committedStreet after
  | { type: 'raise'; seat: number; to: number };

export type ActionType = Action['type'];

export type HandEvent =
  | {
      type: 'hand_started';
      handId: string;
      handNumber: number;
      sessionSeed: string;
      config: TableConfig;
      buttonSeat: number;
      seats: { seat: number; playerId: string; name: string; isHuman: boolean; stack: number }[];
    }
  | { type: 'blind_posted'; seat: number; kind: 'sb' | 'bb'; amount: number; allIn: boolean }
  | { type: 'hole_cards_dealt'; seat: number; cards: [Card, Card] }
  | {
      type: 'action';
      street: Street;
      seat: number;
      action: ActionType;
      added: number;
      to: number;
      allIn: boolean;
      potAfter: number;
    }
  | { type: 'uncalled_returned'; seat: number; amount: number }
  | { type: 'street_dealt'; street: 'flop' | 'turn' | 'river'; cards: Card[]; board: Card[] }
  | { type: 'all_in_runout'; seats: { seat: number; cards: [Card, Card] }[] }
  | { type: 'showdown'; seat: number; cards: [Card, Card]; description: string }
  | { type: 'rake_taken'; amount: number; fromPots: number[] } // per pot index
  | {
      type: 'pot_awarded';
      potIndex: number;
      amount: number; // after rake
      winners: { seat: number; amount: number }[];
      description: string | null;
    }
  | { type: 'hand_completed'; stacks: { seat: number; stack: number; net: number }[]; rake: number };

export interface LegalActions {
  seat: number;
  canFold: boolean; // always true when it is this seat's turn
  canCheck: boolean;
  callAmount: number; // chips to add; 0 when checking is available
  raise: { kind: 'bet' | 'raise'; minTo: number; maxTo: number } | null;
}

export interface HandResult {
  state: HandState;
  events: HandEvent[];
}
