import type { ReactNode } from 'react';
import type { Card } from '@/engine';
import { formatMoney } from '@/lib/format';
import { PlayingCard } from './PlayingCard';

export interface SeatViewModel {
  seat: number;
  name: string;
  isHuman: boolean;
  stack: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  toAct: boolean;
  isButton: boolean;
  blind: 'SB' | 'BB' | null;
  cards: [Card, Card] | null; // null when not dealt in
  showCards: boolean;
  lastAction: string | null;
  won: number; // amount won this hand (0 if none)
  handLabel: string | null; // e.g. showdown description
  styleLabel: string | null; // bot archetype, shown in learning mode only
  learning?: {
    winPct: string | null;
    leader: boolean;
    madeHand: string;
    outs: string[] | null;
  };
  badge?: ReactNode; // extra content (learning mode, archetype label)
}

export function SeatView({ m }: { m: SeatViewModel }) {
  return (
    <div
      className={`relative flex w-24 flex-col items-center gap-1 sm:w-32 ${m.folded || !m.inHand ? 'opacity-55' : ''}`}
    >
      <div className="flex gap-0.5">
        {m.cards ? (
          m.cards.map((c, i) => (
            <PlayingCard key={i} card={c} faceDown={!m.showCards} size={m.isHuman ? 'lg' : 'md'} dim={m.folded} />
          ))
        ) : (
          <div className="h-12 sm:h-14" />
        )}
      </div>
      <div
        className={`w-full rounded-lg border px-2 py-1 text-center shadow-md transition-colors ${
          m.toAct
            ? 'border-accent bg-surface-2 ring-2 ring-accent'
            : m.won > 0
              ? 'border-good bg-surface-2 ring-2 ring-good'
              : 'border-line bg-surface'
        }`}
      >
        <div className="flex items-center justify-center gap-1 truncate text-xs font-medium sm:text-sm">
          {m.isButton && (
            <span
              title="Dealer button"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black"
            >
              D
            </span>
          )}
          <span className="truncate">{m.name}</span>
          {m.blind && <span className="shrink-0 rounded bg-white/10 px-1 text-[10px] text-muted">{m.blind}</span>}
        </div>
        <div className="font-mono text-xs text-muted sm:text-sm">
          {m.allIn && !m.folded ? <span className="font-semibold text-danger">ALL-IN</span> : formatMoney(m.stack)}
        </div>
      </div>
      {(m.won > 0 || m.lastAction || m.handLabel) && (
        <div className="max-w-full truncate text-center text-[11px] leading-tight sm:text-xs">
          {m.won > 0 ? (
            <span className="font-semibold text-good">Wins {formatMoney(m.won)}</span>
          ) : m.handLabel ? (
            <span className="text-foreground">{m.handLabel}</span>
          ) : (
            <span className="text-muted">{m.lastAction}</span>
          )}
        </div>
      )}
      {m.learning && m.inHand && (
        <div className="flex max-w-full flex-col items-center gap-0.5 text-center text-[10px] leading-tight sm:text-[11px]">
          <div className="flex items-center gap-1">
            {m.learning.leader && !m.folded && (
              <span className="rounded bg-good px-1 font-semibold text-black">LEADS</span>
            )}
            {m.learning.winPct !== null && !m.folded && (
              <span className={`font-mono font-semibold ${m.learning.leader ? 'text-good' : 'text-foreground'}`}>{m.learning.winPct}</span>
            )}
          </div>
          <span className="max-w-full truncate text-muted">
            {m.folded ? `Would hold ${m.learning.madeHand.charAt(0).toLowerCase()}${m.learning.madeHand.slice(1)}` : m.learning.madeHand}
          </span>
          {m.learning.outs && m.learning.outs.length > 0 && !m.folded && (
            <span className="text-accent" title={`Outs: ${m.learning.outs.join(' ')}`}>
              {m.learning.outs.length} out{m.learning.outs.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
      {m.styleLabel && (
        <div className="rounded-full border border-line bg-black/40 px-2 text-[10px] text-muted">{m.styleLabel}</div>
      )}
      {m.badge}
    </div>
  );
}
