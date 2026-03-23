import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  companyId?: string;
}

export const asyncContext = new AsyncLocalStorage<RequestContext>();

export const getContext = (): RequestContext | undefined => asyncContext.getStore();
