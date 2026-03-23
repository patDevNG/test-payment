import type { NextFunction, Request, Response } from 'express';
import type * as z from 'zod';
import { logger } from '../../logger';

export interface RequestValidators {
  // biome-ignore lint/suspicious/noExplicitAny: generic validator, shape is unknown at definition time
  params?: z.ZodObject<any>;
  // biome-ignore lint/suspicious/noExplicitAny: generic validator, shape is unknown at definition time
  query?: z.ZodObject<any>;
  body?: z.ZodType;
}

export const validate = (validators: RequestValidators) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    let location = '';
    try {
      if (validators.params) {
        location = 'params';
        const parsed = (await validators.params.parseAsync(req.params)) as Record<string, string>;
        req.params = parsed;
      }
      if (validators.query) {
        location = 'query';
        const parsed = (await validators.query.parseAsync(req.query)) as Record<string, string>;
        req.query = parsed;
      }
      if (validators.body) {
        location = 'body';
        req.body = await validators.body.parseAsync(req.body);
      }
      next();
    } catch (err) {
      (err as Record<string, unknown>).location = location;
      logger.debug({ err }, 'Request validation error');
      next(err);
    }
  };
};
