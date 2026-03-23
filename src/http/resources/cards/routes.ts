import * as z from 'zod';
import type { RouteConstructor } from '../../api';
import { ApiError } from '../generic_responses';
import {
  activateCardHandler,
  getCardHandler,
  getCardSpendHandler,
  listCardsHandler,
} from './handlers';
import { ActivateCardResponse, CardListResponse, CardSpendResponse } from './spec';

export const cardRoutes = (route: RouteConstructor) => {
  route({
    category: 'Cards',
    summary: 'List all cards for the company',
    method: 'get',
    path: '/cards',
    request: {},
    responses: {
      200: { description: 'Card list', schema: CardListResponse },
      401: { description: 'Unauthorized', schema: ApiError },
    },
    handler: listCardsHandler,
  });

  route({
    category: 'Cards',
    summary: 'Get a card by id',
    method: 'get',
    path: '/cards/{id}',
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: { description: 'Card detail', schema: CardListResponse },
      401: { description: 'Unauthorized', schema: ApiError },
      404: { description: 'Not found', schema: ApiError },
    },
    handler: getCardHandler,
  });

  route({
    category: 'Cards',
    summary: 'Activate a card',
    description: 'Idempotent — activating an already-active card returns 200 with current state.',
    method: 'patch',
    path: '/cards/{id}/activate',
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: { description: 'Card activated', schema: ActivateCardResponse },
      401: { description: 'Unauthorized', schema: ApiError },
      403: { description: 'Card belongs to a different company', schema: ApiError },
      404: { description: 'Not found', schema: ApiError },
      409: { description: 'Card is blocked', schema: ApiError },
    },
    handler: activateCardHandler,
  });

  route({
    category: 'Cards',
    summary: 'Get on-demand spend summary for a card',
    method: 'get',
    path: '/cards/{id}/spend',
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: { description: 'Spend summary', schema: CardSpendResponse },
      401: { description: 'Unauthorized', schema: ApiError },
      404: { description: 'Not found', schema: ApiError },
    },
    handler: getCardSpendHandler,
  });
};
