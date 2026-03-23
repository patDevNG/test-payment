import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { Request, Response } from 'express';
import { env } from '../../../config/env';
import { OpenAPITags, registry } from '../../openapi';

let cachedSpec: unknown = null;

export const getOpenApiSpecHandler = (_req: Request, res: Response) => {
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
};

export const getDocsHandler = (_req: Request, res: Response) => {
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
};
