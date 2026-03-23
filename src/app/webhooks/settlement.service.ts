import * as z from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { transactions } from '../../db/schema';
import { getLogger } from '../../logger';

const SettlementEvent = z.object({
  type: z.literal('transaction.settled'),
  data: z.object({
    object: z.object({
      authorization_id: z.string(),
      transaction_id: z.string(),
    }),
  }),
});

export const handleSettlement = async (raw: unknown): Promise<{ received: boolean }> => {
  const log = getLogger();

  const parsed = SettlementEvent.safeParse(raw);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, 'Unrecognised settlement event shape — ignoring');
    return { received: true };
  }

  const { authorization_id } = parsed.data.data.object;

  const updated = await db
    .update(transactions)
    .set({ status: 'settled' })
    .where(eq(transactions.externalId, authorization_id))
    .returning({ id: transactions.id });

  if (!updated[0]) {
    log.warn({ authorization_id }, 'Settlement received for unknown transaction — ignoring');
    return { received: true };
  }

  log.info({ transactionId: updated[0].id, authorization_id }, 'Transaction settled');
  return { received: true };
};
