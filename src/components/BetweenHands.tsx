'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buyInLimits, maxTopUp, type HandEvent } from '@/engine';
import { formatBb, formatMoney } from '@/lib/format';

interface Props {
  handNumber: number;
  events: HandEvent[];
  heroSeat: number;
  heroStack: number;
  bigBlind: number;
  needsRebuy: boolean;
  onNext: () => void;
  onRebuy: (amount: number) => void;
}

/** Shown when no hand is running: result of the last hand, rebuy / top-up, and the deal button. */
export function BetweenHands({ handNumber, events, heroSeat, heroStack, bigBlind, needsRebuy, onNext, onRebuy }: Props) {
  const limits = buyInLimits(bigBlind);
  const topUpMax = maxTopUp(heroStack, bigBlind);
  const [amount, setAmount] = useState(needsRebuy ? limits.default : Math.min(topUpMax, limits.default));
  const [showTopUp, setShowTopUp] = useState(false);

  const completed = events.find((e): e is Extract<HandEvent, { type: 'hand_completed' }> => e.type === 'hand_completed');
  const heroNet = completed?.stacks.find((s) => s.seat === heroSeat)?.net ?? null;

  if (needsRebuy) {
    const min = limits.min;
    const value = Math.max(min, Math.min(amount, limits.max));
    return (
      <div className="rounded-xl border border-danger/50 bg-surface p-4">
        <h2 className="font-semibold">You are out of chips</h2>
        <p className="mt-1 text-sm text-muted">
          Rebuy between {formatMoney(limits.min)} and {formatMoney(limits.max)} (40 to 200 big blinds), or leave the table.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            aria-label="Rebuy amount"
            min={limits.min}
            max={limits.max}
            step={bigBlind}
            value={value}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-28 text-right font-mono text-sm">
            {formatMoney(value)} <span className="text-muted">({formatBb(value, bigBlind)})</span>
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onRebuy(value)}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-black hover:brightness-110"
          >
            Rebuy {formatMoney(value)}
          </button>
          <Link href="/" className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2">
            Leave table
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <div className="flex-1 text-sm">
        {handNumber === 0 ? (
          <span className="text-muted">Ready when you are.</span>
        ) : heroNet !== null ? (
          <span>
            Hand #{handNumber}:{' '}
            <span className={`font-mono font-semibold ${heroNet > 0 ? 'text-good' : heroNet < 0 ? 'text-danger' : ''}`}>
              {formatMoney(heroNet, { signed: true })}
            </span>
            {completed && completed.rake > 0 && <span className="text-muted"> · rake {formatMoney(completed.rake)}</span>}
          </span>
        ) : null}
      </div>
      {showTopUp && topUpMax > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="range"
            aria-label="Top-up amount"
            min={bigBlind}
            max={topUpMax}
            step={bigBlind}
            value={Math.min(Math.max(amount, bigBlind), topUpMax)}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <button
            type="button"
            onClick={() => {
              onRebuy(Math.min(Math.max(amount, bigBlind), topUpMax));
              setShowTopUp(false);
            }}
            className="rounded-md border border-line px-2 py-1 font-mono hover:bg-surface-2"
          >
            Add {formatMoney(Math.min(Math.max(amount, bigBlind), topUpMax))}
          </button>
        </div>
      )}
      <div className="flex gap-2">
        {topUpMax > 0 && !showTopUp && (
          <button
            type="button"
            onClick={() => setShowTopUp(true)}
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"
          >
            Top up
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          autoFocus
          className="rounded-lg bg-accent px-5 py-2 font-semibold text-black hover:brightness-110"
        >
          {handNumber === 0 ? 'Deal first hand' : 'Next hand'}
        </button>
      </div>
    </div>
  );
}
