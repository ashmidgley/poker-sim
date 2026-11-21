import { createHand, applyAction, type Action, type HandEvent, type HandState, type NewHandInput } from '@/engine';

type Ev<T extends HandEvent['type']> = Extract<HandEvent, { type: T }>;

export interface ReplayStep {
  state: HandState;
  events: HandEvent[]; // cumulative events up to and including this step
}

export interface Replay {
  input: NewHandInput;
  actions: Action[];
  steps: ReplayStep[]; // step 0 = hand dealt, step k = after the k-th action
  heroSeat: number;
  /** True when replaying the input and actions reproduces the stored events exactly. */
  matchesRecord: boolean;
}

/**
 * Rebuild a stored hand from its event log: hand_started carries the full
 * NewHandInput and the action events carry every player action, so the
 * engine can step through it again.
 */
export function buildReplay(events: readonly HandEvent[]): Replay {
  const started = events.find((e): e is Ev<'hand_started'> => e.type === 'hand_started');
  if (!started) throw new Error('No hand_started event');
  const input: NewHandInput = {
    handId: started.handId,
    handNumber: started.handNumber,
    sessionSeed: started.sessionSeed,
    config: started.config,
    buttonSeat: started.buttonSeat,
    seats: started.seats.map((s) => ({ ...s })),
  };
  const actions: Action[] = events
    .filter((e): e is Ev<'action'> => e.type === 'action')
    .map((e) => (e.action === 'bet' || e.action === 'raise' ? { type: e.action, seat: e.seat, to: e.to } : { type: e.action, seat: e.seat }));

  const first = createHand(input);
  const steps: ReplayStep[] = [{ state: first.state, events: first.events }];
  for (const action of actions) {
    const prev = steps[steps.length - 1];
    const next = applyAction(prev.state, action);
    steps.push({ state: next.state, events: [...prev.events, ...next.events] });
  }

  const final = steps[steps.length - 1].events;
  const matchesRecord = JSON.stringify(final) === JSON.stringify(events);
  const heroSeat = started.seats.find((s) => s.isHuman)?.seat ?? 0;
  return { input, actions, steps, heroSeat, matchesRecord };
}
