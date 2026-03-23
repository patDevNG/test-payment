import { randomUUID } from 'node:crypto';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import express, { type Handler, type Router } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import * as z from 'zod';
import { env } from '../config/env';
import { pool } from '../db';
import { asyncContext } from '../lib/async-context';
import { logger } from '../logger';
import { notFound } from './middleware/404';
import { asyncHandler } from './middleware/async_handler';
import { requestContext } from './middleware/context';
import { errors } from './middleware/errorHandler';
import { authLimiter, globalLimiter } from './middleware/rateLimiter';
import { type RequestValidators, validate } from './middleware/validator';
import { OpenAPITags, registry } from './openapi';
import { authRoutes } from './resources/auth/routes';
import { cardRoutes } from './resources/cards/routes';
import { dashboardRoutes } from './resources/dashboard/routes';
import { invoiceRoutes } from './resources/invoices/routes';
import { transactionRoutes } from './resources/transactions/routes';

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

let cachedSpec: unknown = null;

export const api = () => {
  const app = express();
  const router = express.Router();

  app.disable('x-powered-by');
  app.use(helmet());
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

  // OpenAPI spec — no auth, cached after first generation
  router.get('/openapi.json', (_req, res) => {
    if (!cachedSpec) {
      const generator = new OpenApiGeneratorV3(registry.definitions);
      cachedSpec = generator.generateDocument({
        openapi: '3.0.3',
        info: { title: 'Payment Dashboard API', version: '1.0.0' },
        servers: [{ url: `http://localhost:${env.PORT}/api/v1` }],
        tags: OpenAPITags,
      });
    }
    res.json(cachedSpec);
  });

  // Redoc UI — no auth
  router.get('/openapi', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>Payment Dashboard API</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/api/v1/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`);
  });

  app.use('/api/v1', router);

  app.use(notFound);
  app.use(errors);

  return app;
};
