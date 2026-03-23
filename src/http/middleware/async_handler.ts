import type { Handler, NextFunction, Request, Response } from 'express';

/*
 *   Middleware to catch and forward errors to our error handler.
 *
 *   Basically this just allows us to not wrap every request handler
 *   in a try-catch and propogates it properly to the error handler.
 */

export const asyncHandler = (fn: Handler) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (e) {
      next(e);
    }
  };
};
