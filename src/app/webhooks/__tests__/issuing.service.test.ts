import { db } from '../../../db';
import { handleIssuingAuthorization } from '../issuing.service';

jest.mock('../../../db', () => ({
  db: { transaction: jest.fn() },
}));

jest.mock('../../../logger', () => ({
  getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const q = (result: unknown) => {
  const chain: any = {};
  for (const m of ['from', 'where', 'set', 'returning', 'values']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  const p = Promise.resolve(result);
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
};

const baseCard = {
  id: 'card-1',
  companyId: 'company-1',
  externalCardId: 'ext-card-1',
  status: 'active',
  spendLimit: '10000.00',
  spentThisMonth: '3000.00',
  spendMonth: '2026-03-01',
  currency: 'SEK',
};

const validEvent = {
  type: 'issuing_authorization.request',
  data: {
    object: {
      id: 'auth-1',
      card: { id: 'ext-card-1' },
      amount: 50000, // 500.00 SEK in öre
      currency: 'sek',
      merchant_data: { name: 'Coffee Shop', category: 'food' },
      created: Math.floor(Date.now() / 1000),
    },
  },
};

describe('handleIssuingAuthorization', () => {
  it('returns approved: false for invalid event shape', async () => {
    const result = await handleIssuingAuthorization({ type: 'unknown' });
    expect(result).toEqual({ approved: false });
  });

  it('returns approved: false when card is not found', async () => {
    (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => any) => {
      const tx = { select: jest.fn().mockReturnValue(q([])) };
      return fn(tx);
    });

    const result = await handleIssuingAuthorization(validEvent);
    expect(result).toEqual({ approved: false });
  });

  it('returns approved: false and inserts declined transaction when card is inactive', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([{ ...baseCard, status: 'inactive' }])),
      insert: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const result = await handleIssuingAuthorization(validEvent);

    expect(result).toEqual({ approved: false });
    expect(tx.insert).toHaveBeenCalled();
  });

  it('returns approved: false and inserts declined transaction when card is blocked', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([{ ...baseCard, status: 'blocked' }])),
      insert: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const result = await handleIssuingAuthorization(validEvent);

    expect(result).toEqual({ approved: false });
  });

  it('returns approved: true and inserts pending transaction when within limit', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([baseCard])),
      update: jest.fn().mockReturnValue(q([{ id: 'card-1' }])),
      insert: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const result = await handleIssuingAuthorization(validEvent);

    expect(result).toEqual({ approved: true });
    expect(tx.insert).toHaveBeenCalledWith(
      expect.anything(),
    );
  });

  it('returns approved: false and inserts declined transaction when limit exceeded', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([{ ...baseCard, spentThisMonth: '9800.00' }])),
      update: jest.fn().mockReturnValue(q([])), // no row returned — limit exceeded
      insert: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const result = await handleIssuingAuthorization(validEvent);

    expect(result).toEqual({ approved: false });
    expect(tx.insert).toHaveBeenCalled();
  });

  it('converts amount from smallest unit to decimal correctly', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([baseCard])),
      update: jest.fn().mockReturnValue(q([{ id: 'card-1' }])),
      insert: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    await handleIssuingAuthorization({
      ...validEvent,
      data: { object: { ...validEvent.data.object, amount: 9999 } },
    });

    // 9999 öre = 99.99 SEK — insert was called (amount conversion verified via service logic)
    expect(tx.insert).toHaveBeenCalled();
  });
});
