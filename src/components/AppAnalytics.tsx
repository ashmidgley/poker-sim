'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';

const UUID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$|\?)/gi;

/**
 * Vercel Web Analytics. Session and hand ids in URLs are collapsed to
 * "[id]" so pages aggregate as one route each in the dashboard (e.g.
 * /play/[id] rather than one row per session). Nothing is sent in
 * development.
 */
export function AppAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => ({ ...event, url: event.url.replace(UUID, '/[id]') })}
    />
  );
}
