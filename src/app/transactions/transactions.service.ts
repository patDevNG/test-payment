import Decimal from 'decimal.js';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Context } from '../../ctx';
import { db } from '../../db';
import { transactions } from '../../db/schema';
import { AppError } from '../../http/middleware/errorHandler';
import type { ListTransactionsQuery } from '../../http/resources/transactions/spec';
import { getLogger } from '../../logger';

type TransactionRow = typeof transactions.$inferSelect;

type Cursor = { at: string; id: string };

export const encodeCursor = (at: string, id: string): string =>
  Buffer.from(JSON.stringify({ at, id })).toString('base64url');

const decodeCursor = (cursor: string): Cursor => {
  const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Cursor;
  return raw;
};

const toTransaction = (row: TransactionRow) => ({
  id: row.id,
  cardId: row.cardId,
  amount: new Decimal(row.amount).toFixed(2),
  currency: row.currency,
  merchantName: row.merchantName,
  merchantCategory: row.merchantCategory ?? null,
  description: row.description ?? null,
  status: row.status as 'pending' | 'settled' | 'declined',
  transactedAt: row.transactedAt.toISOString(),
});

export type Transaction = ReturnType<typeof toTransaction>;

export const listTransactions = async (
  ctx: Context,
  opts: ListTransactionsQuery,
): Promise<{ rows: Transaction[]; total: number; nextCursor: string | null }> => {
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;

  const baseFilters = [
    eq(transactions.companyId, ctx.companyId),
    opts.cardId ? eq(transactions.cardId, opts.cardId) : undefined,
    opts.status ? eq(transactions.status, opts.status) : undefined,
    opts.from ? gte(transactions.transactedAt, new Date(opts.from)) : undefined,
    opts.to ? lte(transactions.transactedAt, new Date(opts.to)) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  const cursorFilter = cursor
    ? sql`(${transactions.transactedAt}, ${transactions.id}) < (${new Date(cursor.at)}::timestamptz, ${cursor.id}::uuid)`
    : undefined;

  const pageFilters = cursorFilter ? [...baseFilters, cursorFilter] : baseFilters;

  const [rows, [{ total }]] = await db.transaction(async (tx) =>
    Promise.all([
      tx
        .select()
        .from(transactions)
        .where(and(...pageFilters))
        .orderBy(desc(transactions.transactedAt), desc(transactions.id))
        .limit(opts.limit),
      // Total count spans all matching rows ignoring cursor position
      tx
        .select({ total: count() })
        .from(transactions)
        .where(and(...baseFilters)),
    ]),
  );

  const mapped = rows.map(toTransaction);
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === opts.limit && lastRow
      ? encodeCursor(lastRow.transactedAt.toISOString(), lastRow.id)
      : null;

  getLogger().debug(
    {
      companyId: ctx.companyId,
      count: mapped.length,
      total,
      hasCursor: !!cursor,
      hasNextCursor: !!nextCursor,
    },
    'Transactions listed',
  );
  return { rows: mapped, total, nextCursor };
};

export const getTransaction = async (ctx: Context, transactionId: string): Promise<Transaction> => {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.companyId, ctx.companyId)));
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Transaction not found');
  getLogger().debug({ transactionId }, 'Transaction fetched');
  return toTransaction(rows[0]);
};
