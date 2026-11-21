import {
  applyAction,
  botRebuys,
  createHand,
  initialButton,
  maxTopUp,
  nextButton,
  type Action,
  type HandEvent,
  type HandState,
} from '@/engine';
import type { ArchetypeId } from '@/bots';
import type { SessionConfig } from './session';

export interface Player {
  seat: number;
  playerId: string;
  name: string;
  isHuman: boolean;
  profile: ArchetypeId | null; // null for the human
  stack: number; // between hands; during a hand the HandState holds live stacks
}

export interface TableState {
  config: SessionConfig;
  players: Player[];
  button: number | null;
  handNumber: number; // hands started so far
  hand: HandState | null;
  events: HandEvent[]; // events of the current (or just finished) hand
  error: string | null;
}

export type TableAction =
  | { type: 'startHand'; handId: string }
  | { type: 'act'; action: Action }
  | { type: 'rebuy'; amount: number }
  | { type: 'clearError' };

export const BOT_NAMES = ['Ava', 'Bruno', 'Chen', 'Dara', 'Eli', 'Farah', 'Gus', 'Hana'];

export function initialTableState(config: SessionConfig): TableState {
  const players: Player[] = [
    { seat: 0, playerId: 'hero', name: 'You', isHuman: true, profile: null, stack: config.buyIn },
    ...Array.from({ length: config.opponents }, (_, i) => ({
      seat: i + 1,
      playerId: `bot-${i + 1}`,
      name: BOT_NAMES[i],
      isHuman: false,
      profile: config.botProfiles[i],
      stack: 100 * config.bigBlind,
    })),
  ];
  return { config, players, button: null, handNumber: 0, hand: null, events: [], error: null };
}

export function isHandInProgress(state: TableState): boolean {
  return state.hand !== null && state.hand.phase !== 'complete';
}

export function heroNeedsRebuy(state: TableState): boolean {
  return !isHandInProgress(state) && state.players.find((p) => p.isHuman)!.stack === 0;
}

export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'startHand': {
      if (isHandInProgress(state) || heroNeedsRebuy(state)) return state;
      const { config } = state;
      const rebuys = botRebuys(state.players, config.bigBlind);
      const players = state.players.map((p) => {
        const r = rebuys.find((x) => x.seat === p.seat);
        return r ? { ...p, stack: p.stack + r.amount } : p;
      });
      const seatsIn = players.filter((p) => p.stack > 0);
      const seatNumbers = seatsIn.map((p) => p.seat);
      const button =
        state.button === null ? initialButton(config.seed, seatNumbers) : nextButton(state.button, seatNumbers);
      const handNumber = state.handNumber + 1;
      const { state: hand, events } = createHand({
        handId: action.handId,
        handNumber,
        sessionSeed: config.seed,
        config: { smallBlind: config.smallBlind, bigBlind: config.bigBlind, rake: config.rake },
        buttonSeat: button,
        seats: seatsIn.map(({ seat, playerId, name, isHuman, stack }) => ({ seat, playerId, name, isHuman, stack })),
      });
      return settle({ ...state, players, button, handNumber, hand, events, error: null });
    }

    case 'act': {
      if (!state.hand) return state;
      try {
        const r = applyAction(state.hand, action.action);
        return settle({ ...state, hand: r.state, events: [...state.events, ...r.events], error: null });
      } catch (e) {
        return { ...state, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case 'rebuy': {
      if (isHandInProgress(state)) return state;
      const hero = state.players.find((p) => p.isHuman)!;
      const amount = Math.min(action.amount, maxTopUp(hero.stack, state.config.bigBlind));
      if (amount <= 0) return state;
      return {
        ...state,
        players: state.players.map((p) => (p.isHuman ? { ...p, stack: p.stack + amount } : p)),
      };
    }

    case 'clearError':
      return { ...state, error: null };
  }
}

/** When a hand completes, copy the final stacks back to the players. */
function settle(state: TableState): TableState {
  const hand = state.hand;
  if (!hand || hand.phase !== 'complete') return state;
  return {
    ...state,
    players: state.players.map((p) => {
      const s = hand.seats.find((x) => x.seat === p.seat);
      return s ? { ...p, stack: s.stack } : p;
    }),
  };
}
