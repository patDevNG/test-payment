import * as z from 'zod';

export const Transaction = z.object({
  id: z.uuid(),
  cardId: z.uuid(),
  amount: z.string(),
  currency: z.string().length(3),
  merchantName: z.string(),
  merchantCategory: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(['pending', 'settled', 'declined']),
  transactedAt: z.iso.datetime(),
});

export const ListTransactionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(), // base64url-encoded { at: ISO, id: UUID }
  cardId: z.uuid().optional(),
  status: z.enum(['pending', 'settled', 'declined']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const TransactionParams = z.object({
  id: z.uuid(),
});

export const TransactionListResponse = z.object({
  success: z.literal(true),
  data: Transaction.array(),
  meta: z.object({
    limit: z.number().int(),
    total: z.number().int(),
    nextCursor: z.string().nullable(),
  }),
});

export const TransactionResponse = z.object({
  success: z.literal(true),
  data: Transaction,
});

export type Transaction = z.infer<typeof Transaction>;
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuery>;
export type TransactionListResponse = z.infer<typeof TransactionListResponse>;
