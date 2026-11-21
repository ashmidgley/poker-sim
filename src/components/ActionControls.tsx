'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Action, LegalActions } from '@/engine';
import { formatMoney, parseMoney } from '@/lib/format';

interface Props {
  legal: LegalActions | null; // null or another seat's turn => disabled
  enabled: boolean;
  pot: number; // all chips committed this hand
  currentBet: number;
  committedStreet: number; // hero's chips in front this street
  bigBlind: number;
  onAct: (action: Action) => void;
}

/** Pot-fraction sizing: bet f * pot, or raise to currentBet + f * (pot + toCall). */
export function sizeFor(fraction: number, p: { pot: number; currentBet: number; committedStreet: number; bigBlind: number }) {
  const toCall = p.currentBet - p.committedStreet;
  const raw = p.currentBet === 0 ? fraction * p.pot : p.currentBet + fraction * (p.pot + toCall);
  const unit = p.bigBlind >= 100 ? 100 : 1; // round to whole dollars at normal stakes
  return Math.round(raw / unit) * unit;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ActionControls({ legal: legalForSeatToAct, enabled, pot, currentBet, committedStreet, bigBlind, onAct }: Props) {
  // Only the hero's own legal actions drive labels and buttons; while a bot
  // is acting the controls show neutral, disabled labels.
  const legal = enabled ? legalForSeatToAct : null;
  const raise = legal?.raise ?? null;
  const [raiseTo, setRaiseTo] = useState(0);
  const [text, setText] = useState('');

  // Reset the raise amount to the minimum whenever a new decision starts.
  const decisionKey = enabled && legal ? `${legal.seat}:${currentBet}:${committedStreet}:${pot}` : '';
  const [lastKey, setLastKey] = useState('');
  if (decisionKey !== lastKey) {
    setLastKey(decisionKey);
    if (raise) {
      setRaiseTo(raise.minTo);
      setText((raise.minTo / 100).toString());
    }
  }

  const quick = useMemo(() => {
    if (!raise) return [];
    const p = { pot, currentBet, committedStreet, bigBlind };
    return [
      { label: '½ pot', to: clamp(sizeFor(0.5, p), raise.minTo, raise.maxTo) },
      { label: '⅔ pot', to: clamp(sizeFor(2 / 3, p), raise.minTo, raise.maxTo) },
      { label: 'Pot', to: clamp(sizeFor(1, p), raise.minTo, raise.maxTo) },
      { label: 'All-in', to: raise.maxTo },
    ];
  }, [raise, pot, currentBet, committedStreet, bigBlind]);

  const setAmount = (to: number) => {
    if (!raise) return;
    const v = clamp(to, raise.minTo, raise.maxTo);
    setRaiseTo(v);
    setText((v / 100).toString());
  };

  const fold = () => legal && onAct({ type: 'fold', seat: legal.seat });
  const checkOrCall = () =>
    legal && onAct(legal.canCheck ? { type: 'check', seat: legal.seat } : { type: 'call', seat: legal.seat });
  const doRaise = () => {
    if (!legal || !raise) return;
    // Only min..max are legal; anything typed outside is clamped.
    onAct({ type: raise.kind, seat: legal.seat, to: clamp(raiseTo, raise.minTo, raise.maxTo) });
  };

  // Keyboard shortcuts: F fold, C check/call, R bet/raise.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') fold();
      else if (k === 'c') checkOrCall();
      else if (k === 'r') doRaise();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const disabled = !enabled || !legal;
  const callLabel = !legal ? 'Check / Call' : legal.canCheck ? 'Check' : `Call ${formatMoney(legal.callAmount)}`;
  const raiseLabel = raise
    ? `${raise.kind === 'bet' ? 'Bet' : 'Raise to'} ${formatMoney(clamp(raiseTo, raise.minTo, raise.maxTo))}${raiseTo >= raise.maxTo ? ' (all-in)' : ''}`
    : 'Raise';

  return (
    <div className={`rounded-xl border border-line bg-surface p-3 ${disabled ? 'opacity-50' : ''}`}>
      {raise && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setAmount(q.to)}
                className="rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs hover:border-accent"
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              aria-label="Raise amount"
              min={raise.minTo}
              max={raise.maxTo}
              step={bigBlind >= 100 ? 100 : 1}
              value={raiseTo}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1"
            />
            <div className="flex items-center rounded-md border border-line bg-background px-2">
              <span className="text-muted">$</span>
              <input
                aria-label="Raise to (dollars)"
                inputMode="decimal"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  const cents = parseMoney(e.target.value);
                  if (cents !== null) setRaiseTo(cents);
                }}
                onBlur={() => setAmount(raiseTo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doRaise();
                }}
                className="w-20 bg-transparent py-1 text-right font-mono outline-none"
              />
            </div>
          </div>
          {(raiseTo < raise.minTo || raiseTo > raise.maxTo) && (
            <p className="text-xs text-danger">
              Allowed: {formatMoney(raise.minTo)} to {formatMoney(raise.maxTo)}. It will be adjusted.
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={fold}
          className="rounded-lg bg-danger/90 px-3 py-2.5 font-semibold text-white enabled:hover:bg-danger disabled:cursor-not-allowed"
        >
          Fold <kbd className="ml-1 hidden text-xs opacity-70 sm:inline">F</kbd>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={checkOrCall}
          className="rounded-lg bg-surface-2 px-3 py-2.5 font-semibold enabled:hover:bg-line disabled:cursor-not-allowed"
        >
          {callLabel} <kbd className="ml-1 hidden text-xs opacity-70 sm:inline">C</kbd>
        </button>
        <button
          type="button"
          disabled={disabled || !raise}
          onClick={doRaise}
          className="rounded-lg bg-accent px-3 py-2.5 font-semibold text-black enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {raiseLabel} <kbd className="ml-1 hidden text-xs opacity-70 sm:inline">R</kbd>
        </button>
      </div>
    </div>
  );
}
