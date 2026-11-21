import 'server-only';
import { z } from 'zod';
import { DataError } from '@/data/types';

export type IdContext = { params: Promise<{ id: string }> };

/** The [id] route param, validated as a UUID (anything else is a 404). */
export async function idParam(ctx: IdContext): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new DataError('not_found');
  return id;
}

/** Integer query parameter clamped to [min, max]. */
export function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  const n = raw === null ? fallback : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
