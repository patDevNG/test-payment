import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { asyncContext } from '../../lib/async-context';
import { AppError } from './errorHandler';

interface JwtPayload {
  sub: string;
  cid: string;
  iat: number;
  exp: number;
}

export const requestContext = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as JwtPayload;

    req.ctx = { userId: payload.sub, companyId: payload.cid };

    const store = asyncContext.getStore();
    if (store) {
      store.userId = payload.sub;
      store.companyId = payload.cid;
    }

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
};
