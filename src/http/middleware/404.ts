import type { NextFunction, Request, Response } from 'express';

export const notFound = (_req: Request, res: Response, _next: NextFunction) => {
  res
    .status(404)
    .json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
};
