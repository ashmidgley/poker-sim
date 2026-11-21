'use client';

import type { Learning } from '@/game/useLearning';

/** The explanation for the current street, and pot odds against equity when facing a bet. */
export function LearningPanel({ learning }: { learning: Learning | null }) {
  if (!learning) return null;
  const e = learning.explanation;
  return (
    <section aria-live="polite" className="rounded-xl border border-good/40 bg-surface p-3 text-sm">
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-good uppercase">What&apos;s winning</h2>
      {!e ? (
        <p className="text-muted">{learning.computing ? 'Working out the odds…' : 'Deal a hand to see the analysis.'}</p>
      ) : (
        <>
          {e.headline && <p className="font-medium">{e.headline}</p>}
          {e.lines.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-muted">
              {e.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {e.potOdds && (
            <p
              className={`mt-2 rounded-md border px-2 py-1.5 ${
                e.potOdds.profitable ? 'border-good/50 bg-good/10' : 'border-danger/50 bg-danger/10'
              }`}
            >
              {e.potOdds.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
