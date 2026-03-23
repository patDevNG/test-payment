import * as z from 'zod';
import type { RouteConstructor } from '../../api';
import { ApiError, ValidationError } from '../generic_responses';
import { getInvoiceHandler, listInvoicesHandler } from './handlers';
import { InvoiceListResponse, InvoiceResponse, ListInvoicesQuery } from './spec';

export const invoiceRoutes = (route: RouteConstructor) => {
  route({
    category: 'Invoices',
    summary: 'List invoices',
    method: 'get',
    path: '/invoices',
    request: { query: ListInvoicesQuery },
    responses: {
      200: { description: 'Paginated invoice list', schema: InvoiceListResponse },
      400: { description: 'Invalid query params', schema: ValidationError },
      401: { description: 'Unauthorized', schema: ApiError },
    },
    handler: listInvoicesHandler,
  });

  route({
    category: 'Invoices',
    summary: 'Get an invoice by id',
    method: 'get',
    path: '/invoices/{id}',
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: { description: 'Invoice detail', schema: InvoiceResponse },
      401: { description: 'Unauthorized', schema: ApiError },
      404: { description: 'Not found', schema: ApiError },
    },
    handler: getInvoiceHandler,
  });
};
