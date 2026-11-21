'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRepository } from '@/data/RepositoryProvider';
import type { StoredHand } from '@/data/types';
import { HandReplayer } from './HandReplayer';

export function HandReplayClient({ handId }: { handId: string }) {
  const { status, repo } = useRepository();
  const [hand, setHand] = useState<StoredHand | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !repo) return;
    let cancelled = false;
    repo
      .getHand(handId)
      .then((h) => !cancelled && setHand(h))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [status, repo, handId]);

  if (error) return <p className="p-6 text-danger">{error}</p>;
  if (hand === undefined) return <p className="p-6 text-muted">Loading hand…</p>;
  if (hand === null) {
    return (
      <div className="p-6">
        <p className="font-semibold">Hand not found</p>
        <Link href="/history" className="text-sm text-accent hover:underline">
          Back to history
        </Link>
      </div>
    );
  }
  return <HandReplayer hand={hand} />;
}
