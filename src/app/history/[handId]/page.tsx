import { Suspense } from 'react';
import { HandReplayClient } from '@/components/HandReplayClient';

/** With cacheComponents, params resolve inside Suspense; the replayer is client-side. */
export default function HandPage({ params }: PageProps<'/history/[handId]'>) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading hand…</p>}>
      {params.then(({ handId }) => (
        <HandReplayClient handId={handId} />
      ))}
    </Suspense>
  );
}
