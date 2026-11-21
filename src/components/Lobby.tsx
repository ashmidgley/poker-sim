'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_OPPONENTS,
  DEFAULT_RAKE_PRESET,
  MAX_OPPONENTS,
  MIN_OPPONENTS,
  RAKE_PRESETS,
  STAKES_PRESETS,
} from '@/bankroll/presets';
import { ARCHETYPES, PROFILES, type ArchetypeId } from '@/bots';
import { DEFAULT_BUY_IN_BB, MAX_BUY_IN_BB, MIN_BUY_IN_BB } from '@/engine';
import { useRepository } from '@/data/RepositoryProvider';
import { DataError, type Session } from '@/data/types';
import { newId, seededMix } from '@/game/session';
import { BOT_NAMES } from '@/game/tableReducer';
import { formatMoney } from '@/lib/format';
import { OpenSessions } from './OpenSessions';
import { StartingBankroll } from './StartingBankroll';

export function Lobby() {
  const router = useRouter();
  const [opponents, setOpponents] = useState(DEFAULT_OPPONENTS);
  const [stakesId, setStakesId] = useState(STAKES_PRESETS[0].id);
  const [buyInBb, setBuyInBb] = useState(DEFAULT_BUY_IN_BB);
  const [mixMode, setMixMode] = useState<'random' | 'custom'>('random');
  const [chosen, setChosen] = useState<ArchetypeId[]>(() => Array.from({ length: 8 }, (_, i) => ARCHETYPES[i % 4]));
  const stakes = STAKES_PRESETS.find((s) => s.id === stakesId)!;
  const buyIn = buyInBb * stakes.bigBlind;

  const { status, repo, store } = useRepository();
  const [bankroll, setBankroll] = useState<{ balance: number; hasHistory: boolean } | null>(null);
  const [openSessions, setOpenSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!repo) return;
    try {
      const [b, sessions] = await Promise.all([repo.getBankroll(), repo.listSessions(20)]);
      setBankroll({ balance: b.balance, hasHistory: b.transactions.length > 0 });
      setOpenSessions(sessions.filter((s) => !s.endedAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data from the repository once it is ready
    if (status === 'ready') void load();
  }, [status, load]);

  const start = async () => {
    if (!repo || starting) return;
    setStarting(true);
    setError(null);
    const id = newId();
    const seed = newId();
    try {
      await repo.createSession({
        id,
        seed,
        learningMode: false,
        smallBlind: stakes.smallBlind,
        bigBlind: stakes.bigBlind,
        rake: RAKE_PRESETS[DEFAULT_RAKE_PRESET].rake,
        opponents,
        botProfiles: mixMode === 'random' ? seededMix(seed, opponents) : chosen.slice(0, opponents),
        stopLoss: null,
        buyIn,
      });
      router.push(`/play/${id}`);
    } catch (e) {
      setStarting(false);
      if (e instanceof DataError && e.code === 'insufficient_bankroll') {
        setError(`Your bankroll of ${formatMoney(bankroll?.balance ?? 0)} cannot cover a ${formatMoney(buyIn)} buy-in.`);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  if (status !== 'ready' || !repo || !bankroll) {
    return <p className="p-6 text-muted">{error ?? 'Loading…'}</p>;
  }
  if (!bankroll.hasHistory) {
    return <StartingBankroll repo={repo} onDone={load} />;
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">New cash game</h1>
        <span className="text-sm text-muted">
          Bankroll <span className="font-mono text-foreground">{formatMoney(bankroll.balance)}</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">No-Limit Texas Hold&apos;em against bots.</p>

      {store && openSessions.length > 0 && (
        <OpenSessions sessions={openSessions} repo={repo} store={store} onChange={load} />
      )}

      <form
        className="mt-6 flex flex-col gap-6 rounded-xl border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
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
          <legend className="text-sm font-medium">Opponent styles</legend>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['random', 'custom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mixMode === m}
                onClick={() => setMixMode(m)}
                className={`rounded-md border py-2 text-sm ${
                  mixMode === m ? 'border-accent bg-accent text-black' : 'border-line bg-surface-2 hover:border-accent'
                }`}
              >
                {m === 'random' ? 'Random mix' : 'Choose each'}
              </button>
            ))}
          </div>
          {mixMode === 'random' ? (
            <p className="mt-1.5 text-xs text-muted">
              A hidden mix of tight-aggressive, loose-passive, calling station and maniac. Learning mode shows who is who.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {Array.from({ length: opponents }, (_, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <label htmlFor={`bot-${i}`} className="w-16 text-muted">
                    {BOT_NAMES[i]}
                  </label>
                  <select
                    id={`bot-${i}`}
                    value={chosen[i]}
                    onChange={(e) => setChosen((c) => c.map((v, j) => (j === i ? (e.target.value as ArchetypeId) : v)))}
                    className="flex-1 rounded-md border border-line bg-surface-2 px-2 py-1.5"
                  >
                    {ARCHETYPES.map((a) => (
                      <option key={a} value={a}>
                        {PROFILES[a].label}: {PROFILES[a].description}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
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

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={starting}
          className="rounded-lg bg-accent py-3 font-semibold text-black hover:brightness-110 disabled:opacity-60"
        >
          {starting ? 'Starting…' : `Sit down with ${formatMoney(buyIn)}`}
        </button>
      </form>
    </div>
  );
}
