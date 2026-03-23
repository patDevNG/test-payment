import type { Context } from '../../../ctx';
import { db } from '../../../db';
import { encodeCursor, getTransaction, listTransactions } from '../transactions.service';

const setupListQuery = (rows: any[], total: number) => {
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => any) => {
    const tx = { select: jest.fn() };
    (tx.select as jest.Mock).mockReturnValueOnce(q(rows)).mockReturnValueOnce(q([{ total }]));
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

const baseTx = {
  id: 'tx-1',
  cardId: 'card-1',
  companyId: 'company-1',
  amount: '99.99',
  currency: 'SEK',
  merchantName: 'Coffee Shop',
  merchantCategory: 'food',
  description: null,
  status: 'settled',
  transactedAt: new Date('2026-03-01T12:00:00Z'),
};

const defaultOpts = { limit: 20 };

describe('encodeCursor', () => {
  it('encodes at and id into a base64url string', () => {
    const cursor = encodeCursor('2026-03-01T12:00:00.000Z', 'tx-1');
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    expect(decoded).toEqual({ at: '2026-03-01T12:00:00.000Z', id: 'tx-1' });
  });

  it('produces different cursors for different inputs', () => {
    const a = encodeCursor('2026-03-01T12:00:00.000Z', 'tx-1');
    const b = encodeCursor('2026-03-02T12:00:00.000Z', 'tx-2');
    expect(a).not.toBe(b);
  });
});

describe('listTransactions', () => {
  it('returns rows and total with null nextCursor when fewer rows than limit', async () => {
    setupListQuery([baseTx], 1);

    const result = await listTransactions(ctx, defaultOpts);

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor when rows returned equals the limit', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...baseTx,
      id: `tx-${i}`,
      transactedAt: new Date(`2026-03-0${(i % 9) + 1}T12:00:00Z`),
    }));
    setupListQuery(rows, 50);

    const result = await listTransactions(ctx, { limit: 20 });

    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('maps transaction rows to the correct shape', async () => {
    setupListQuery([baseTx], 1);

    const { rows } = await listTransactions(ctx, defaultOpts);

    expect(rows[0]).toMatchObject({
      id: 'tx-1',
      amount: '99.99',
      status: 'settled',
      transactedAt: '2026-03-01T12:00:00.000Z',
      merchantCategory: 'food',
      description: null,
    });
  });

  it('accepts an opts.cursor without throwing', async () => {
    const cursor = encodeCursor('2026-03-01T12:00:00.000Z', 'tx-0');
    setupListQuery([], 0);

    await expect(listTransactions(ctx, { limit: 20, cursor })).resolves.not.toThrow();
  });
});

describe('getTransaction', () => {
  it('throws 404 when transaction is not found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([]));

    await expect(getTransaction(ctx, 'missing-tx')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns the mapped transaction when found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([baseTx]));

    const tx = await getTransaction(ctx, 'tx-1');

    expect(tx.id).toBe('tx-1');
    expect(tx.amount).toBe('99.99');
    expect(tx.transactedAt).toBe('2026-03-01T12:00:00.000Z');
  });
});
