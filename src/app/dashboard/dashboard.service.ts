import Decimal from 'decimal.js';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Context } from '../../ctx';
import { db } from '../../db';
import { cards, companies, invoices, transactions } from '../../db/schema';
import { AppError } from '../../http/middleware/errorHandler';
import type { DashboardResponse } from '../../http/resources/dashboard/spec';
import { getLogger } from '../../logger';

export const getDashboard = async (ctx: Context): Promise<DashboardResponse['data']> => {
  const [companyRows, cardRows, recentTxRows, [{ total }], pendingInvoiceRows] = await Promise.all([
    db.select().from(companies).where(eq(companies.id, ctx.companyId)).limit(1),
    db
      .select()
      .from(cards)
      .where(eq(cards.companyId, ctx.companyId))
      .orderBy(cards.createdAt)
      .limit(1),
    db
      .select()
      .from(transactions)
      .where(eq(transactions.companyId, ctx.companyId))
      .orderBy(desc(transactions.transactedAt))
      .limit(5),
    db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.companyId, ctx.companyId)),
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, ctx.companyId),
          inArray(invoices.status, ['pending', 'overdue']),
        ),
      )
      .orderBy(invoices.dueDate)
      .limit(1),
  ]);

  const company = companyRows[0];
  const card = cardRows[0];
  if (!company || !card) throw new AppError(404, 'NOT_FOUND', 'Company or card not found');

  // card row already has spentThisMonth and spendLimit — no extra query needed
  const invoice = pendingInvoiceRows[0] ?? null;

  const result = {
    company: { id: company.id, name: company.name },
    card: {
      id: card.id,
      lastFour: card.lastFour,
      cardHolder: card.cardHolder,
      network: card.network as 'Mastercard' | 'Visa',
      status: card.status as 'active' | 'inactive' | 'blocked',
    },
    spend: {
      cardId: card.id,
      spendLimit: new Decimal(card.spendLimit).toFixed(2),
      spentThisMonth: new Decimal(card.spentThisMonth).toFixed(2),
      remaining: new Decimal(card.spendLimit).minus(card.spentThisMonth).toFixed(2),
      currency: card.currency,
    },
    invoice: invoice
      ? {
          id: invoice.id,
          amount: new Decimal(invoice.amount).toFixed(2),
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          status: invoice.status as 'pending' | 'paid' | 'overdue',
        }
      : null,
    recentTransactions: recentTxRows.map((row) => ({
      id: row.id,
      cardId: row.cardId,
      amount: new Decimal(row.amount).toFixed(2),
      currency: row.currency,
      merchantName: row.merchantName,
      merchantCategory: row.merchantCategory ?? null,
      description: row.description ?? null,
      status: row.status as 'pending' | 'settled' | 'declined',
      transactedAt: row.transactedAt.toISOString(),
    })),
    totalTransactionCount: total,
  };

  getLogger().debug(
    { companyId: ctx.companyId, totalTransactionCount: total, hasInvoice: !!invoice },
    'Dashboard fetched',
  );

  return result;
};
