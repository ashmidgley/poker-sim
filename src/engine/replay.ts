import { applyAction, createHand } from './hand';
import type { Action, HandResult, NewHandInput } from './types';

/** Rebuild a hand from its input and player actions. Same input + actions = same events. */
export function replay(input: NewHandInput, actions: readonly Action[]): HandResult {
  const start = createHand(input);
  let state = start.state;
  const events = [...start.events];
  for (const action of actions) {
    const next = applyAction(state, action);
    state = next.state;
    events.push(...next.events);
  }
  return { state, events };
}
