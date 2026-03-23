import type { Context } from '../ctx';

declare global {
  namespace Express {
    interface Request {
      ctx: Context;
    }
  }
}
