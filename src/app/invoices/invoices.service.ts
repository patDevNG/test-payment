import Decimal from 'decimal.js';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Context } from '../../ctx';
import { db } from '../../db';
import { invoices } from '../../db/schema';
import { AppError } from '../../http/middleware/errorHandler';
import type { ListInvoicesQuery } from '../../http/resources/invoices/spec';
import { getLogger } from '../../logger';

type InvoiceRow = typeof invoices.$inferSelect;

type Cursor = { date: string; id: string };

export const encodeCursor = (date: string, id: string): string =>
  Buffer.from(JSON.stringify({ date, id })).toString('base64url');

const decodeCursor = (cursor: string): Cursor => {
  const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Cursor;
  return raw;
};

const toInvoice = (row: InvoiceRow) => ({
  id: row.id,
  cardId: row.cardId,
  amount: new Decimal(row.amount).toFixed(2),
  currency: row.currency,
  dueDate: row.dueDate,
  status: row.status as 'pending' | 'paid' | 'overdue',
  createdAt: row.createdAt.toISOString(),
});

export type Invoice = ReturnType<typeof toInvoice>;

export const listInvoices = async (
  ctx: Context,
  opts: ListInvoicesQuery,
): Promise<{ rows: Invoice[]; total: number; nextCursor: string | null }> => {
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;

  const baseFilters = [
    eq(invoices.companyId, ctx.companyId),
    opts.status ? eq(invoices.status, opts.status) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  const cursorFilter = cursor
    ? sql`(${invoices.dueDate}, ${invoices.id}) < (${cursor.date}::date, ${cursor.id}::uuid)`
    : undefined;

  const pageFilters = cursorFilter ? [...baseFilters, cursorFilter] : baseFilters;

  const [rows, [{ total }]] = await db.transaction(async (tx) =>
    Promise.all([
      tx
        .select()
        .from(invoices)
        .where(and(...pageFilters))
        .orderBy(desc(invoices.dueDate), desc(invoices.id))
        .limit(opts.limit),
      tx
        .select({ total: count() })
        .from(invoices)
        .where(and(...baseFilters)),
    ]),
  );

  const mapped = rows.map(toInvoice);
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === opts.limit && lastRow ? encodeCursor(lastRow.dueDate, lastRow.id) : null;

  getLogger().debug(
    {
      companyId: ctx.companyId,
      count: mapped.length,
      total,
      hasCursor: !!cursor,
      hasNextCursor: !!nextCursor,
    },
    'Invoices listed',
  );
  return { rows: mapped, total, nextCursor };
};

export const getInvoice = async (ctx: Context, invoiceId: string): Promise<Invoice> => {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, ctx.companyId)));
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
  getLogger().debug({ invoiceId }, 'Invoice fetched');
  return toInvoice(rows[0]);
};
