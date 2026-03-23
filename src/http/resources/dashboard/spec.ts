import * as z from 'zod';

export const CardSummary = z.object({
  id: z.uuid(),
  lastFour: z.string().length(4),
  cardHolder: z.string(),
  network: z.enum(['Mastercard', 'Visa']),
  status: z.enum(['active', 'inactive', 'blocked']),
});

export const SpendSummary = z.object({
  cardId: z.uuid(),
  spendLimit: z.string(),
  spentThisMonth: z.string(),
  remaining: z.string(),
  currency: z.string().length(3),
});

export const InvoiceSummary = z.object({
  id: z.uuid(),
  amount: z.string(),
  currency: z.string().length(3),
  dueDate: z.string(),
  status: z.enum(['pending', 'paid', 'overdue']),
});

export const TransactionItem = z.object({
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

export const DashboardResponse = z.object({
  success: z.literal(true),
  data: z.object({
    company: z.object({ id: z.uuid(), name: z.string() }),
    card: CardSummary,
    spend: SpendSummary,
    invoice: InvoiceSummary.nullable(),
    recentTransactions: TransactionItem.array().max(5),
    totalTransactionCount: z.number().int(),
  }),
});

export type DashboardResponse = z.infer<typeof DashboardResponse>;
export type TransactionItem = z.infer<typeof TransactionItem>;
