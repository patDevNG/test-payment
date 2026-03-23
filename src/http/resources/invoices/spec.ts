import * as z from 'zod';

export const Invoice = z.object({
  id: z.uuid(),
  cardId: z.uuid(),
  amount: z.string(),
  currency: z.string().length(3),
  dueDate: z.string(),
  status: z.enum(['pending', 'paid', 'overdue']),
  createdAt: z.iso.datetime(),
});

export const ListInvoicesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(), // base64url-encoded { date: YYYY-MM-DD, id: UUID }
  status: z.enum(['pending', 'paid', 'overdue']).optional(),
});

export const InvoiceParams = z.object({
  id: z.uuid(),
});

export const InvoiceListResponse = z.object({
  success: z.literal(true),
  data: Invoice.array(),
  meta: z.object({
    limit: z.number().int(),
    total: z.number().int(),
    nextCursor: z.string().nullable(),
  }),
});

export const InvoiceResponse = z.object({
  success: z.literal(true),
  data: Invoice,
});

export type Invoice = z.infer<typeof Invoice>;
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuery>;
