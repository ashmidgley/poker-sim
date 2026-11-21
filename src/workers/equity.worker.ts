import { computeEquity, type EquityRequest } from './equityProtocol';

/**
 * Equity worker (PLAN 9.3): runs exact enumeration on the flop, turn and
 * river and a 20,000-runout Monte Carlo preflop off the main thread.
 * Imports only pure modules.
 */
const scope = self as unknown as {
  addEventListener(type: 'message', listener: (e: MessageEvent<EquityRequest>) => void): void;
  postMessage(message: unknown): void;
};

scope.addEventListener('message', (e) => {
  scope.postMessage(computeEquity(e.data, () => performance.now()));
});
