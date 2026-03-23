import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';
import type { Context } from '../../ctx';
import { db } from '../../db';
import { auditEvents, cards } from '../../db/schema';
import { AppError } from '../../http/middleware/errorHandler';
import { getLogger } from '../../logger';

type CardRow = typeof cards.$inferSelect;

const toCard = (row: CardRow) => ({
  id: row.id,
  companyId: row.companyId,
  lastFour: row.lastFour,
  cardHolder: row.cardHolder,
  network: row.network as 'Mastercard' | 'Visa',
  status: row.status as 'active' | 'inactive' | 'blocked',
  monthlyLimit: new Decimal(row.spendLimit).toFixed(2),
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toSpendSummary = (row: CardRow) => ({
  cardId: row.id,
  monthlyLimit: new Decimal(row.spendLimit).toFixed(2),
  spentThisMonth: new Decimal(row.spentThisMonth).toFixed(2),
  currency: row.currency,
});

export type Card = ReturnType<typeof toCard>;
export type SpendSummary = ReturnType<typeof toSpendSummary>;

export const listCards = async (ctx: Context): Promise<Card[]> => {
  const rows = await db
    .select()
    .from(cards)
    .where(eq(cards.companyId, ctx.companyId))
    .orderBy(cards.createdAt);
  getLogger().debug({ companyId: ctx.companyId, count: rows.length }, 'Cards listed');
  return rows.map(toCard);
};

export const getCard = async (ctx: Context, cardId: string): Promise<Card> => {
  const rows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.companyId, ctx.companyId)));
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Card not found');
  return toCard(rows[0]);
};

export const activateCard = async (
  ctx: Context,
  cardId: string,
): Promise<{ id: string; status: Card['status']; updatedAt: string }> => {
  const log = getLogger();

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.companyId, ctx.companyId)));

    const card = rows[0];
    if (!card) throw new AppError(404, 'NOT_FOUND', 'Card not found');

    if (card.status === 'blocked') {
      log.warn({ cardId, userId: ctx.userId }, 'Card activation rejected — card is blocked');
      throw new AppError(409, 'CARD_BLOCKED', 'Blocked cards cannot be activated via self-service');
    }

    if (card.status === 'active') {
      log.debug({ cardId }, 'Card already active — no-op');
      return { id: card.id, status: 'active' as const, updatedAt: card.updatedAt.toISOString() };
    }

    const updated = await tx
      .update(cards)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        and(eq(cards.id, cardId), eq(cards.companyId, ctx.companyId), eq(cards.status, 'inactive')),
      )
      .returning({ id: cards.id, status: cards.status, updatedAt: cards.updatedAt });

    // biome-ignore lint/style/noNonNullAssertion: row was just locked above
    const row = updated[0]!;

    await tx.insert(auditEvents).values({
      actorId: ctx.userId,
      entityType: 'card',
      entityId: cardId,
      action: 'activate',
      oldValue: { status: card.status },
      newValue: { status: 'active' },
    });

    log.info({ cardId, userId: ctx.userId, previousStatus: card.status }, 'Card activated');
    return {
      id: row.id,
      status: row.status as Card['status'],
      updatedAt: row.updatedAt.toISOString(),
    };
  });
};

export const getSpendSummary = async (ctx: Context, cardId: string): Promise<SpendSummary> => {
  const rows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.companyId, ctx.companyId)));
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Card not found');
  return toSpendSummary(rows[0]);
};
