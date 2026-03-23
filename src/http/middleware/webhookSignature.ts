import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from './errorHandler';

const TOLERANCE_SECONDS = 300; // reject webhooks older than 5 minutes

export const verifyWebhookSignature = (req: Request, _res: Response, next: NextFunction): void => {
  const sig = req.headers['x-webhook-signature'] as string | undefined;
  if (!sig) throw new AppError(400, 'BAD_REQUEST', 'Missing X-Webhook-Signature header');

  const parts: Record<string, string> = {};
  for (const part of sig.split(',')) {
    const idx = part.indexOf('=');
    if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
  }

  const { t: timestamp, v1 } = parts;
  if (!timestamp || !v1) throw new AppError(400, 'BAD_REQUEST', 'Malformed X-Webhook-Signature header');

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (age > TOLERANCE_SECONDS) throw new AppError(400, 'BAD_REQUEST', 'Webhook timestamp too old');

  const rawBody = (req.body as Buffer).toString('utf8');
  const expected = createHmac('sha256', env.EXTERNAL_API_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const v1Buf = Buffer.from(v1, 'hex');

  if (expectedBuf.length !== v1Buf.length || !timingSafeEqual(expectedBuf, v1Buf)) {
    throw new AppError(400, 'BAD_REQUEST', 'Invalid webhook signature');
  }

  req.body = JSON.parse(rawBody);
  next();
};
