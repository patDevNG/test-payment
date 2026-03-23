import * as z from 'zod';

export const Card = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  lastFour: z.string().length(4),
  cardHolder: z.string(),
  network: z.enum(['Mastercard', 'Visa']),
  status: z.enum(['active', 'inactive', 'blocked']),
  spendLimit: z.string(),
  currency: z.string().length(3),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const SpendSummary = z.object({
  cardId: z.uuid(),
  spendLimit: z.string(),
  spentThisMonth: z.string(),
  remaining: z.string(),
  currency: z.string().length(3),
});

export const CardParams = z.object({
  id: z.uuid(),
});

export const ActivateCardResponse = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.uuid(),
    status: z.enum(['active', 'inactive', 'blocked']),
    updatedAt: z.iso.datetime(),
  }),
});

export const CardListResponse = z.object({
  success: z.literal(true),
  data: Card.array(),
});

export const CardSpendResponse = z.object({
  success: z.literal(true),
  data: SpendSummary,
});

export type Card = z.infer<typeof Card>;
export type SpendSummary = z.infer<typeof SpendSummary>;
export type ActivateCardResponse = z.infer<typeof ActivateCardResponse>;
