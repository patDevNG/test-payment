import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import * as z from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export const OpenAPITags: { name: string; description: string }[] = [
  { name: 'Auth', description: 'Authentication — login, token refresh, logout' },
  { name: 'Dashboard', description: 'Single-request dashboard payload' },
  { name: 'Transactions', description: 'Card transaction history' },
  { name: 'Cards', description: 'Company card management' },
  { name: 'Invoices', description: 'Company invoices' },
  { name: 'OpenAPI', description: '' },
];
