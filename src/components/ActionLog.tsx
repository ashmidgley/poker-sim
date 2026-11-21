'use client';

import { useEffect, useRef } from 'react';
import type { HandEvent } from '@/engine';
import { eventText, type NameOf } from '@/game/eventText';

export function ActionLog({
  events,
  name,
  showHoleCards,
}: {
  events: HandEvent[];
  name: NameOf;
  showHoleCards?: (seat: number) => boolean;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const lines = events.map((e) => eventText(e, name, { showHoleCards })).filter((l): l is string => l !== null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase">Action</h2>
      <ol ref={ref} className="max-h-48 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed lg:max-h-[28rem]">
        {lines.length === 0 && <li className="text-muted">No hand in progress.</li>}
        {lines.map((l, i) => (
          <li key={i} className={l.startsWith('Flop') || l.startsWith('Turn') || l.startsWith('River') ? 'mt-1 text-accent' : ''}>
            {l}
          </li>
        ))}
      </ol>
    </div>
  );
}
