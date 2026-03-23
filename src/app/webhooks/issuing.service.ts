import Decimal from 'decimal.js';
import * as z from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { cards, transactions } from '../../db/schema';
import { getLogger } from '../../logger';

const CENTS_DIVISOR = new Decimal(100);

const IssuingAuthorizationEvent = z.object({
  type: z.literal('issuing_authorization.request'),
  data: z.object({
    object: z.object({
      id: z.string(),
      card: z.object({ id: z.string() }),
      amount: z.number().int().nonnegative(),
      currency: z.string(),
      merchant_data: z.object({
        name: z.string(),
        category: z.string().nullable().optional(),
        network_id: z.string().optional(),
      }),
      created: z.number().int(),
    }),
  }),
});

export type IssuingAuthorizationEvent = z.infer<typeof IssuingAuthorizationEvent>;

const firstOfCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

export const handleIssuingAuthorization = async (
  raw: unknown,
): Promise<{ approved: boolean }> => {
  const log = getLogger();

  const parsed = IssuingAuthorizationEvent.safeParse(raw);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, 'Unrecognised authorization event shape — ignoring');
    return { approved: false };
  }

  const auth = parsed.data.data.object;
  const externalCardId = auth.card.id;
  const externalId = auth.id; // authorization ID — used to correlate settlement/refund events
  const amount = new Decimal(auth.amount).div(CENTS_DIVISOR);
  const currency = auth.currency.toUpperCase();
  const transactedAt = new Date(auth.created * 1000);
  const merchantName = auth.merchant_data.name;
  const merchantCategory = auth.merchant_data.category ?? null;
  const currentMonth = firstOfCurrentMonth();

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(cards)
      .where(eq(cards.externalCardId, externalCardId));

    const card = rows[0];
    if (!card) {
      log.warn({ externalCardId }, 'Authorization rejected — card not found');
      return { approved: false };
    }

    if (card.status !== 'active') {
      log.warn({ cardId: card.id, status: card.status }, 'Authorization rejected — card not active');
      await tx.insert(transactions).values({
        externalId,
        cardId: card.id,
        companyId: card.companyId,
        amount: amount.toFixed(2),
        currency,
        merchantName,
        merchantCategory,
        description: null,
        status: 'declined',
        transactedAt,
      });
      return { approved: false };
    }

    // Atomic UPDATE — handles month reset and limit guard in a single statement.
    // If the card's spendMonth is before the current month we treat spentThisMonth
    // as 0 so the full limit is available again.  The WHERE clause re-evaluates the
    // same logic so a concurrent request cannot slip through the gap between our
    // application-level check and the write.
    const updated = await tx
      .update(cards)
      .set({
        spentThisMonth: sql`
          CASE
            WHEN spend_month < ${currentMonth}::date THEN ${amount.toFixed(2)}::numeric
            ELSE spent_this_month + ${amount.toFixed(2)}::numeric
          END`,
        spendMonth: sql`${currentMonth}::date`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cards.id, card.id),
          eq(cards.status, 'active'),
          sql`
            CASE
              WHEN spend_month < ${currentMonth}::date
                THEN ${amount.toFixed(2)}::numeric <= spend_limit
              ELSE spent_this_month + ${amount.toFixed(2)}::numeric <= spend_limit
            END`,
        ),
      )
      .returning({ id: cards.id });

    if (!updated[0]) {
      // Limit exceeded (or a concurrent request won the race)
      log.warn(
        { cardId: card.id, amount: amount.toFixed(2) },
        'Authorization rejected — spend limit exceeded',
      );
      await tx.insert(transactions).values({
        externalId,
        cardId: card.id,
        companyId: card.companyId,
        amount: amount.toFixed(2),
        currency,
        merchantName,
        merchantCategory,
        description: null,
        status: 'declined',
        transactedAt,
      });
      return { approved: false };
    }

    await tx.insert(transactions).values({
      externalId,
      cardId: card.id,
      companyId: card.companyId,
      amount: amount.toFixed(2),
      currency,
      merchantName,
      merchantCategory,
      description: null,
      status: 'pending',
      transactedAt,
    });

    log.info(
      { cardId: card.id, amount: amount.toFixed(2), currency, merchantName },
      'Authorization approved',
    );
    return { approved: true };
  });
};
