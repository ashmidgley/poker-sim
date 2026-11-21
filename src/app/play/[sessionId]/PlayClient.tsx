'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TableScreen } from '@/components/TableScreen';
import { loadSessionConfig, type SessionConfig } from '@/game/session';

export function PlayClient({ sessionId }: { sessionId: string }) {
  // undefined = still loading (localStorage is only readable after mount).
  const [config, setConfig] = useState<SessionConfig | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of browser storage after mount
    setConfig(loadSessionConfig(sessionId));
  }, [sessionId]);

  if (config === undefined) return <p className="p-6 text-muted">Loading table…</p>;
  if (config === null) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Session not found</p>
        <p className="mt-1 text-sm text-muted">It may have been started in another browser.</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-black">
          Back to the lobby
        </Link>
      </div>
    );
  }
  return <TableScreen config={config} />;
}
