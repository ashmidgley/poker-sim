'use client';

import { useState } from 'react';
import type { Repository } from '@/data/repository';
import { formatMoney, parseMoney } from '@/lib/format';

const SUGGESTIONS = [100000, 200000, 500000];

/**
 * First run: record a starting bankroll as a deposit (PLAN 9.4). Brought
 * forward from Phase 6 because buy-ins are charged to the bankroll from
 * Phase 4 on.
 */
export function StartingBankroll({ repo, onDone }: { repo: Repository; onDone: () => void }) {
  const [text, setText] = useState('2000');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cents = parseMoney(text);

  const save = async () => {
    if (cents === null || cents <= 0) return setError('Enter an amount in dollars, e.g. 2000');
    setSaving(true);
    try {
      await repo.addTransaction({ id: crypto.randomUUID(), type: 'deposit', amount: cents, note: 'Starting bankroll' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set your starting bankroll</h1>
      <p className="mt-2 text-sm text-muted">
        This is the money you set aside for poker. Every buy-in comes out of it and every cash-out goes back in, so you can see
        whether you are playing the right stakes for your bankroll.
      </p>
      <form
        className="mt-6 flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Starting bankroll
          <div className="flex items-center rounded-md border border-line bg-background px-3">
            <span className="text-muted">$</span>
            <input
              inputMode="decimal"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              className="w-full bg-transparent py-2 pl-1 font-mono outline-none"
              aria-label="Starting bankroll in dollars"
            />
          </div>
        </label>
        <div className="flex gap-1.5">
          {SUGGESTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setText(String(c / 100))}
              className="rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs hover:border-accent"
            >
              {formatMoney(c)}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent py-2.5 font-semibold text-black hover:brightness-110 disabled:opacity-60"
        >
          {cents ? `Start with ${formatMoney(cents)}` : 'Start'}
        </button>
      </form>
    </div>
  );
}
