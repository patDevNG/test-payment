import type { RouteConstructor } from '../../api';
import { ApiError } from '../../resources/generic_responses';
import { loginHandler } from './handlers';
import { AuthResponse, LoginBody } from './spec';

export const authRoutes = (route: RouteConstructor) => {
  route({
    category: 'Auth',
    method: 'post',
    path: '/auth/login',
    summary: 'Login with email and password',
    request: { body: LoginBody },
    responses: {
      200: { description: 'Access token issued', schema: AuthResponse },
      401: { description: 'Invalid credentials', schema: ApiError },
    },
    handler: loginHandler,
  });
};
