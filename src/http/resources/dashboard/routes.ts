import type { RouteConstructor } from '../../api';
import { ApiError } from '../generic_responses';
import { getDashboardHandler } from './handlers';
import { DashboardResponse } from './spec';

export const dashboardRoutes = (route: RouteConstructor) => {
  route({
    category: 'Dashboard',
    summary: 'Get full mobile dashboard payload',
    description: 'Returns all data needed for the mobile screen in a single request.',
    method: 'get',
    path: '/dashboard',
    request: {},
    responses: {
      200: { description: 'Dashboard payload', schema: DashboardResponse },
      401: { description: 'Unauthorized', schema: ApiError },
    },
    handler: getDashboardHandler,
  });
};
