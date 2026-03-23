import type { Context } from '../../../ctx';
import { db } from '../../../db';
import { activateCard, getCard, getSpendSummary, listCards } from '../cards.service';

jest.mock('../../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../../../logger', () => ({
  getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Makes a chainable, awaitable query stub resolving to `result`.
const q = (result: unknown) => {
  const chain: any = {};
  for (const m of ['from', 'where', 'orderBy', 'limit', 'set', 'returning', 'values']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  const p = Promise.resolve(result);
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
};

const ctx: Context = { userId: 'user-1', companyId: 'company-1' };

const baseCard = {
  id: 'card-1',
  companyId: 'company-1',
  lastFour: '4242',
  cardHolder: 'Jane Doe',
  network: 'Visa',
  status: 'active',
  spendLimit: '5000.00',
  spentThisMonth: '1200.50',
  spendMonth: '2026-03-01',
  currency: 'SEK',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

describe('listCards', () => {
  it('returns an empty array when the company has no cards', async () => {
    (db.select as jest.Mock).mockReturnValue(q([]));
    await expect(listCards(ctx)).resolves.toEqual([]);
  });

  it('returns mapped cards with monetary values as fixed-decimal strings', async () => {
    (db.select as jest.Mock).mockReturnValue(q([baseCard]));

    const [card] = await listCards(ctx);

    expect(card.id).toBe('card-1');
    expect(card.monthlyLimit).toBe('5000.00');
    expect(card.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(card.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('getCard', () => {
  it('throws 404 when card is not found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([]));

    await expect(getCard(ctx, 'missing-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns the mapped card when found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([baseCard]));

    const card = await getCard(ctx, 'card-1');

    expect(card.id).toBe('card-1');
    expect(card.lastFour).toBe('4242');
    expect(card.network).toBe('Visa');
  });
});

describe('activateCard', () => {
  const setupTransaction = (cardRow: any, updatedRow?: any) => {
    (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => any) => {
      const tx = {
        select: jest.fn().mockReturnValue(q([cardRow])),
        update: jest.fn().mockReturnValue(q(updatedRow ? [updatedRow] : [])),
        insert: jest.fn().mockReturnValue(q(undefined)),
      };
      return fn(tx);
    });
  };

  it('throws 404 when card is not found inside the transaction', async () => {
    (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => any) => {
      const tx = { select: jest.fn().mockReturnValue(q([])) };
      return fn(tx);
    });

    await expect(activateCard(ctx, 'missing-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws 409 when card is blocked', async () => {
    setupTransaction({ ...baseCard, status: 'blocked' });

    await expect(activateCard(ctx, 'card-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CARD_BLOCKED',
    });
  });

  it('returns current status without updating when card is already active', async () => {
    setupTransaction({ ...baseCard, status: 'active' });

    const result = await activateCard(ctx, 'card-1');

    expect(result.status).toBe('active');
    // update should not have been called
    const tx = (db.transaction as jest.Mock).mock.calls[0];
    expect(tx).toBeDefined();
  });

  it('activates an inactive card and returns the updated status', async () => {
    const updatedCard = {
      id: 'card-1',
      status: 'active',
      updatedAt: new Date('2026-03-23T10:00:00Z'),
    };
    setupTransaction({ ...baseCard, status: 'inactive' }, updatedCard);

    const result = await activateCard(ctx, 'card-1');

    expect(result.id).toBe('card-1');
    expect(result.status).toBe('active');
    expect(result.updatedAt).toBe('2026-03-23T10:00:00.000Z');
  });
});

describe('getSpendSummary', () => {
  it('throws 404 when card is not found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([]));

    await expect(getSpendSummary(ctx, 'missing-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns spend summary with remaining correctly computed', async () => {
    (db.select as jest.Mock).mockReturnValue(q([baseCard]));

    const summary = await getSpendSummary(ctx, 'card-1');

    expect(summary.cardId).toBe('card-1');
    expect(summary.monthlyLimit).toBe('5000.00');
    expect(summary.spentThisMonth).toBe('1200.50');
    expect(summary.currency).toBe('SEK');
  });
});
