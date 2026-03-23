import * as z from 'zod';

export const ApiError = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const ValidationError = ApiError.extend({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    location: z.enum(['params', 'query', 'body']).optional(),
    details: z.unknown().optional(),
  }),
});

export const Pagination = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type ApiError = z.infer<typeof ApiError>;
export type ValidationError = z.infer<typeof ValidationError>;
export type Pagination = z.infer<typeof Pagination>;
