import { Suspense } from 'react';
import { PlayClient } from './PlayClient';

/**
 * With cacheComponents enabled, params must be resolved inside a Suspense
 * boundary; the table itself is entirely client-side.
 */
export default function PlayPage({ params }: PageProps<'/play/[sessionId]'>) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading table…</p>}>
      {params.then(({ sessionId }) => (
        <PlayClient sessionId={sessionId} />
      ))}
    </Suspense>
  );
}
