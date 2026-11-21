'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  DEFAULT_OPPONENTS,
  DEFAULT_RAKE_PRESET,
  MAX_OPPONENTS,
  MIN_OPPONENTS,
  RAKE_PRESETS,
  STAKES_PRESETS,
} from '@/bankroll/presets';
import { DEFAULT_BUY_IN_BB, MAX_BUY_IN_BB, MIN_BUY_IN_BB } from '@/engine';
import { newId, saveSessionConfig, type SessionConfig } from '@/game/session';
import { formatMoney } from '@/lib/format';

export function Lobby() {
  const router = useRouter();
  const [opponents, setOpponents] = useState(DEFAULT_OPPONENTS);
  const [stakesId, setStakesId] = useState(STAKES_PRESETS[0].id);
  const [buyInBb, setBuyInBb] = useState(DEFAULT_BUY_IN_BB);
  const stakes = STAKES_PRESETS.find((s) => s.id === stakesId)!;
  const buyIn = buyInBb * stakes.bigBlind;

  const start = () => {
    const id = newId();
    const config: SessionConfig = {
      id,
      seed: newId(),
      createdAt: new Date().toISOString(),
      opponents,
      smallBlind: stakes.smallBlind,
      bigBlind: stakes.bigBlind,
      buyIn,
      rake: RAKE_PRESETS[DEFAULT_RAKE_PRESET].rake,
      learningMode: false,
    };
    saveSessionConfig(config);
    router.push(`/play/${id}`);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">New cash game</h1>
      <p className="mt-1 text-sm text-muted">No-Limit Texas Hold&apos;em against bots.</p>

      <form
        className="mt-6 flex flex-col gap-6 rounded-xl border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">Opponents</legend>
          <div className="mt-2 grid grid-cols-8 gap-1.5">
            {Array.from({ length: MAX_OPPONENTS - MIN_OPPONENTS + 1 }, (_, i) => i + MIN_OPPONENTS).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={opponents === n}
                onClick={() => setOpponents(n)}
                className={`rounded-md border py-2 font-mono text-sm ${
                  opponents === n ? 'border-accent bg-accent text-black' : 'border-line bg-surface-2 hover:border-accent'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {opponents === 1 ? 'Heads-up' : `${opponents + 1}-handed table`}
          </p>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Stakes</legend>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {STAKES_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={stakesId === s.id}
                onClick={() => setStakesId(s.id)}
                className={`rounded-md border py-2 text-sm ${
                  stakesId === s.id ? 'border-accent bg-accent text-black' : 'border-line bg-surface-2 hover:border-accent'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Rake: {RAKE_PRESETS[DEFAULT_RAKE_PRESET].label}, no flop no drop.</p>
        </fieldset>

        <fieldset>
          <legend className="flex w-full justify-between text-sm font-medium">
            <span>Buy-in</span>
            <span className="font-mono">
              {formatMoney(buyIn)} <span className="text-muted">({buyInBb} bb)</span>
            </span>
          </legend>
          <input
            type="range"
            aria-label="Buy-in in big blinds"
            min={MIN_BUY_IN_BB}
            max={MAX_BUY_IN_BB}
            step={5}
            value={buyInBb}
            onChange={(e) => setBuyInBb(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>{MIN_BUY_IN_BB} bb</span>
            <span>{MAX_BUY_IN_BB} bb</span>
          </div>
        </fieldset>

        <button type="submit" className="rounded-lg bg-accent py-3 font-semibold text-black hover:brightness-110">
          Sit down
        </button>
      </form>
    </div>
  );
}
