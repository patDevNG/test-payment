import * as z from 'zod';

export const LoginBody = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const AuthResponse = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
    expiresIn: z.number().int().describe('Access token lifetime in seconds'),
  }),
});

export type LoginBody = z.infer<typeof LoginBody>;
