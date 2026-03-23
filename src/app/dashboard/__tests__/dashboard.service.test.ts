import { getDashboard } from '../dashboard.service';
import { db } from '../../../db';
import type { Context } from '../../../ctx';

jest.mock('../../../db', () => ({
  db: { select: jest.fn() },
}));

jest.mock('../../../logger', () => ({
  getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Makes a chainable, awaitable query stub resolving to `result`.
const q = (result: unknown) => {
  const chain: any = {};
  for (const m of ['from', 'where', 'orderBy', 'limit']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  const p = Promise.resolve(result);
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
};

const ctx: Context = { userId: 'user-1', companyId: 'company-1' };

const companyRow = { id: 'company-1', name: 'Acme AB' };

const cardRow = {
  id: 'card-1',
  companyId: 'company-1',
  lastFour: '4242',
  cardHolder: 'Jane Doe',
  network: 'Visa',
  status: 'active',
  spendLimit: '10000.00',
  spentThisMonth: '3000.00',
  currency: 'SEK',
};

const txRow = {
  id: 'tx-1',
  cardId: 'card-1',
  amount: '99.99',
  currency: 'SEK',
  merchantName: 'Coffee Shop',
  merchantCategory: null,
  description: null,
  status: 'settled',
  transactedAt: new Date('2026-03-01T12:00:00Z'),
};

const invoiceRow = {
  id: 'inv-1',
  amount: '5000.00',
  currency: 'SEK',
  dueDate: '2026-04-01',
  status: 'pending',
};

// Configures db.select to return the 5 dashboard queries in order:
// companies → cards → recent transactions → transaction count → pending invoices
const setupDashboardQueries = (overrides: {
  company?: any[];
  card?: any[];
  transactions?: any[];
  total?: number;
  invoice?: any[];
} = {}) => {
  (db.select as jest.Mock)
    .mockReturnValueOnce(q(overrides.company ?? [companyRow]))
    .mockReturnValueOnce(q(overrides.card ?? [cardRow]))
    .mockReturnValueOnce(q(overrides.transactions ?? [txRow]))
    .mockReturnValueOnce(q([{ total: overrides.total ?? 1 }]))
    .mockReturnValueOnce(q(overrides.invoice ?? [invoiceRow]));
};

describe('getDashboard', () => {
  it('throws 404 when company is not found', async () => {
    setupDashboardQueries({ company: [] });

    await expect(getDashboard(ctx)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws 404 when company has no card', async () => {
    setupDashboardQueries({ card: [] });

    await expect(getDashboard(ctx)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns the full dashboard with a pending invoice', async () => {
    setupDashboardQueries({ total: 42 });

    const result = await getDashboard(ctx);

    expect(result.company).toEqual({ id: 'company-1', name: 'Acme AB' });
    expect(result.card).toMatchObject({ id: 'card-1', lastFour: '4242', network: 'Visa' });
    expect(result.spend).toEqual({
      cardId: 'card-1',
      spendLimit: '10000.00',
      spentThisMonth: '3000.00',
      remaining: '7000.00',
      currency: 'SEK',
    });
    expect(result.invoice).toMatchObject({ id: 'inv-1', status: 'pending' });
    expect(result.recentTransactions).toHaveLength(1);
    expect(result.totalTransactionCount).toBe(42);
  });

  it('returns null invoice when there are no pending or overdue invoices', async () => {
    setupDashboardQueries({ invoice: [] });

    const result = await getDashboard(ctx);

    expect(result.invoice).toBeNull();
  });

  it('maps recent transaction amounts as fixed-decimal strings', async () => {
    setupDashboardQueries();

    const result = await getDashboard(ctx);

    expect(result.recentTransactions[0].amount).toBe('99.99');
    expect(result.recentTransactions[0].transactedAt).toBe('2026-03-01T12:00:00.000Z');
  });

  it('computes spend remaining correctly', async () => {
    setupDashboardQueries({
      card: [{ ...cardRow, spendLimit: '5000.00', spentThisMonth: '4999.99' }],
    });

    const result = await getDashboard(ctx);

    expect(result.spend.remaining).toBe('0.01');
  });
});
