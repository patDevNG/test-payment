import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { getLogger } from '../../logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errors(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const log = getLogger();

  if (err instanceof ZodError) {
    log.warn({ issues: err.issues }, 'Request validation failed');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    log[level]({ code: err.code, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  log.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
