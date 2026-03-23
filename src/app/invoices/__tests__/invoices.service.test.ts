import { encodeCursor, getInvoice, listInvoices } from '../invoices.service';
import { db } from '../../../db';
import type { Context } from '../../../ctx';

const setupListQuery = (rows: any[], total: number) => {
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => any) => {
    const tx = { select: jest.fn() };
    (tx.select as jest.Mock)
      .mockReturnValueOnce(q(rows))
      .mockReturnValueOnce(q([{ total }]));
    return fn(tx);
  });
};

jest.mock('../../../db', () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
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

const baseInvoice = {
  id: 'inv-1',
  cardId: 'card-1',
  companyId: 'company-1',
  amount: '2500.00',
  currency: 'SEK',
  dueDate: '2026-04-01',
  status: 'pending',
  createdAt: new Date('2026-03-01T00:00:00Z'),
};

const defaultOpts = { limit: 20 };

describe('encodeCursor', () => {
  it('encodes date and id into a base64url string', () => {
    const cursor = encodeCursor('2026-04-01', 'inv-1');
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    expect(decoded).toEqual({ date: '2026-04-01', id: 'inv-1' });
  });

  it('produces different cursors for different inputs', () => {
    const a = encodeCursor('2026-04-01', 'inv-1');
    const b = encodeCursor('2026-05-01', 'inv-2');
    expect(a).not.toBe(b);
  });
});

describe('listInvoices', () => {
  it('returns rows and total with null nextCursor when fewer rows than limit', async () => {
    setupListQuery([baseInvoice], 1);

    const result = await listInvoices(ctx, defaultOpts);

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor when rows returned equals the limit', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...baseInvoice,
      id: `inv-${i}`,
      dueDate: `2026-0${(i % 9) + 1}-01`,
    }));
    setupListQuery(rows, 100);

    const result = await listInvoices(ctx, { limit: 20 });

    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('maps invoice rows to the correct shape', async () => {
    setupListQuery([baseInvoice], 1);

    const { rows } = await listInvoices(ctx, defaultOpts);

    expect(rows[0]).toMatchObject({
      id: 'inv-1',
      amount: '2500.00',
      currency: 'SEK',
      dueDate: '2026-04-01',
      status: 'pending',
      createdAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('accepts an opts.cursor without throwing', async () => {
    const cursor = encodeCursor('2026-04-01', 'inv-0');
    setupListQuery([], 0);

    await expect(listInvoices(ctx, { limit: 20, cursor })).resolves.not.toThrow();
  });
});

describe('getInvoice', () => {
  it('throws 404 when invoice is not found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([]));

    await expect(getInvoice(ctx, 'missing-inv')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns the mapped invoice when found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([baseInvoice]));

    const invoice = await getInvoice(ctx, 'inv-1');

    expect(invoice.id).toBe('inv-1');
    expect(invoice.amount).toBe('2500.00');
    expect(invoice.dueDate).toBe('2026-04-01');
    expect(invoice.createdAt).toBe('2026-03-01T00:00:00.000Z');
  });
});
