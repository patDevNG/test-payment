import type { RouteConstructor } from '../../api';
import { getDocsHandler, getOpenApiSpecHandler } from './handlers';

export const openapiRoutes = (route: RouteConstructor) => {
  route({
    category: 'OpenAPI',
    summary: 'OpenAPI v3 spec',
    method: 'get',
    path: '/openapi.json',
    request: {},
    responses: {
      200: { description: 'OpenAPI v3.0 JSON spec' },
    },
    handler: getOpenApiSpecHandler,
  });

  route({
    category: 'OpenAPI',
    summary: 'API documentation',
    method: 'get',
    path: '/docs',
    request: {},
    responses: {
      200: { description: 'Redoc HTML documentation page' },
    },
    handler: getDocsHandler,
  });
};
