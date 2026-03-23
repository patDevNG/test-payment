import Decimal from 'decimal.js';
import * as z from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { cards, transactions } from '../../db/schema';
import { getLogger } from '../../logger';

const CENTS_DIVISOR = new Decimal(100);

const RefundEvent = z.object({
  type: z.literal('transaction.refunded'),
  data: z.object({
    object: z.object({
      authorization_id: z.string(),
      refund_id: z.string(),
      amount: z.number().int().positive(), // positive value representing the refunded amount
      currency: z.string(),
      refunded_at: z.number().int(),
    }),
  }),
});

export const handleRefund = async (raw: unknown): Promise<{ received: boolean }> => {
  const log = getLogger();

  const parsed = RefundEvent.safeParse(raw);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, 'Unrecognised refund event shape — ignoring');
    return { received: true };
  }

  const obj = parsed.data.data.object;
  const refundAmount = new Decimal(obj.amount).div(CENTS_DIVISOR);
  const currency = obj.currency.toUpperCase();
  const refundedAt = new Date(obj.refunded_at * 1000);

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, obj.authorization_id));

    const original = rows[0];
    if (!original) {
      log.warn({ authorization_id: obj.authorization_id }, 'Refund received for unknown transaction — ignoring');
      return;
    }

    // Insert the refund as a separate transaction with a negative amount so it
    // appears in the transaction list and the running total stays accurate.
    await tx.insert(transactions).values({
      externalId: obj.refund_id,
      cardId: original.cardId,
      companyId: original.companyId,
      amount: refundAmount.negated().toFixed(2),
      currency,
      merchantName: original.merchantName,
      merchantCategory: original.merchantCategory,
      description: 'Refund',
      status: 'settled',
      transactedAt: refundedAt,
    });

    // Reduce spentThisMonth but never go below zero
    await tx
      .update(cards)
      .set({
        spentThisMonth: sql`GREATEST(spent_this_month - ${refundAmount.toFixed(2)}::numeric, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(cards.id, original.cardId));

    log.info(
      { cardId: original.cardId, refundAmount: refundAmount.toFixed(2), authorization_id: obj.authorization_id },
      'Refund processed',
    );
  });

  return { received: true };
};
