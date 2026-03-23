import pino, { type LoggerOptions } from 'pino';
import { env } from './config/env';
import { getContext } from './lib/async-context';

const config: LoggerOptions = {
  name: 'test-payment',
  level: env.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
};

export const logger = pino(config);

/**
 * Returns a child logger with request context (requestId, userId, companyId)
 * automatically bound from AsyncLocalStorage. Use this inside service functions
 * so every log line is traceable back to the originating request without
 * manually threading the logger through every call.
 */
export const getLogger = () => {
  const ctx = getContext();
  if (!ctx) return logger;
  return logger.child({
    requestId: ctx.requestId,
    ...(ctx.userId && { userId: ctx.userId }),
    ...(ctx.companyId && { companyId: ctx.companyId }),
  });
};
