import { addTransactionSchema } from '@/data/types';
import { json, protectedRoute, readBody } from '@/server/http';
import { addTransaction } from '@/server/service';

/** Deposits and withdrawals. Withdrawals beyond the balance are refused with 409. */
export const POST = protectedRoute(async (req, db) =>
  json(await addTransaction(db, await readBody(req, addTransactionSchema)), 201),
);
