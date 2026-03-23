import { randomUUID } from 'node:crypto';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import express, { type Handler, type Router } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import * as z from 'zod';
import { pool } from '../db';
import { asyncContext } from '../lib/async-context';
import { logger } from '../logger';
import { notFound } from './middleware/404';
import { asyncHandler } from './middleware/async_handler';
import { requestContext } from './middleware/context';
import { verifyWebhookSignature } from './middleware/webhookSignature';
import { errors } from './middleware/errorHandler';
import { authLimiter, globalLimiter } from './middleware/rateLimiter';
import { type RequestValidators, validate } from './middleware/validator';
import { registry } from './openapi';
import { authRoutes } from './resources/auth/routes';
import { cardRoutes } from './resources/cards/routes';
import { dashboardRoutes } from './resources/dashboard/routes';
import { invoiceRoutes } from './resources/invoices/routes';
import { openapiRoutes } from './resources/openapi/routes';
import { transactionRoutes } from './resources/transactions/routes';
import {
  issuingAuthorizationHandler,
  refundHandler,
  settlementHandler,
} from './resources/webhooks/handlers';

export interface Route {
  category: string;
  summary?: string;
  description?: string;
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  request: RequestValidators;
  responses: {
    [statusCode: string]: {
      description: string;
      schema?: z.ZodType;
    };
  };
  handler: Handler;
}

export type RouteConstructor = (route: Route) => void;

const registerRoutes = (
  router: Router,
  openapi: boolean,
  ...middleware: Handler[]
): RouteConstructor => {
  return (route: Route) => {
    if (openapi) {
      const responses: Record<string, ResponseConfig> = {};
      for (const [status, response] of Object.entries(route.responses)) {
        responses[status] = {
          description: response.description,
          content: {
            'application/json': {
              schema: response.schema ?? z.object({}),
            },
          },
        };
      }

      registry.registerPath({
        method: route.method,
        path: route.path,
        summary: route.summary,
        description: route.description,
        tags: [route.category],
        request: {
          params: route.request.params,
          query: route.request.query,
          body: route.request.body
            ? { content: { 'application/json': { schema: route.request.body } } }
            : undefined,
        },
        responses,
      });
    }

    // Convert OpenAPI {param} format → Express :param format
    const path = route.path
      .split('/')
      .map((segment) => (segment.startsWith('{') ? `:${segment.slice(1, -1)}` : segment))
      .join('/');

    const handlers: Handler[] = [
      validate(route.request),
      ...middleware,
      asyncHandler(route.handler),
    ];

    switch (route.method) {
      case 'get':
        router.get(path, handlers);
        break;
      case 'post':
        router.post(path, handlers);
        break;
      case 'put':
        router.put(path, handlers);
        break;
      case 'delete':
        router.delete(path, handlers);
        break;
      case 'patch':
        router.patch(path, handlers);
        break;
    }
  };
};

export const api = () => {
  const app = express();
  const router = express.Router();

  app.disable('x-powered-by');

  // Webhook — must receive the raw body for HMAC verification,
  // registered before express.json() so the buffer is not consumed first.
  const webhookMiddleware = [express.raw({ type: 'application/json' }), verifyWebhookSignature];

  app.post('/webhooks/issuing_authorization', ...webhookMiddleware, asyncHandler(issuingAuthorizationHandler));
  app.post('/webhooks/transaction_settled', ...webhookMiddleware, asyncHandler(settlementHandler));
  app.post('/webhooks/transaction_refunded', ...webhookMiddleware, asyncHandler(refundHandler));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", 'https://cdn.redoc.ly'],
          'worker-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(express.json());
  app.use((req, _res, next) => {
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    asyncContext.run({ requestId }, next);
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
    }),
  );
  app.use(globalLimiter);

  // Health check — no auth
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected', uptime: Math.floor(process.uptime()) });
    } catch {
      res
        .status(503)
        .json({ status: 'error', db: 'disconnected', uptime: Math.floor(process.uptime()) });
    }
  });

  authRoutes(registerRoutes(router, true, authLimiter));

  for (const routes of [dashboardRoutes, transactionRoutes, cardRoutes, invoiceRoutes]) {
    routes(registerRoutes(router, true, requestContext));
  }

  openapiRoutes(registerRoutes(router, true));

  app.use('/api/v1', router);

  app.use(notFound);
  app.use(errors);

  return app;
};
