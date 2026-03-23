import * as z from 'zod';
import type { RouteConstructor } from '../../api';
import { ApiError, ValidationError } from '../generic_responses';
import { getTransactionHandler, listTransactionsHandler } from './handlers';
import { ListTransactionsQuery, TransactionListResponse, TransactionResponse } from './spec';

export const transactionRoutes = (route: RouteConstructor) => {
  route({
    category: 'Transactions',
    summary: 'List transactions',
    method: 'get',
    path: '/transactions',
    request: { query: ListTransactionsQuery },
    responses: {
      200: { description: 'Paginated transaction list', schema: TransactionListResponse },
      400: { description: 'Invalid query params', schema: ValidationError },
      401: { description: 'Unauthorized', schema: ApiError },
    },
    handler: listTransactionsHandler,
  });

  route({
    category: 'Transactions',
    summary: 'Get a transaction by id',
    method: 'get',
    path: '/transactions/{id}',
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: { description: 'Transaction detail', schema: TransactionResponse },
      401: { description: 'Unauthorized', schema: ApiError },
      404: { description: 'Not found', schema: ApiError },
    },
    handler: getTransactionHandler,
  });
};
