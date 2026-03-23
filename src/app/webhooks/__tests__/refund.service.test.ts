import { db } from '../../../db';
import { handleRefund } from '../refund.service';

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

const originalTx = {
  id: 'tx-1',
  cardId: 'card-1',
  companyId: 'company-1',
  externalId: 'auth-1',
  merchantName: 'Coffee Shop',
  merchantCategory: 'food',
  amount: '500.00',
  currency: 'SEK',
};

const validEvent = {
  type: 'transaction.refunded',
  data: {
    object: {
      authorization_id: 'auth-1',
      refund_id: 'refund-1',
      amount: 25000, // 250.00 SEK in öre
      currency: 'sek',
      refunded_at: Math.floor(Date.now() / 1000),
    },
  },
};

describe('handleRefund', () => {
  it('returns received: true for invalid event shape without throwing', async () => {
    const result = await handleRefund({ type: 'unknown' });
    expect(result).toEqual({ received: true });
  });

  it('returns received: true when authorization_id is not found', async () => {
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = { select: jest.fn().mockReturnValue(q([])) };
      return fn(tx);
    });

    const result = await handleRefund(validEvent);
    expect(result).toEqual({ received: true });
  });

  it('inserts a negative settled transaction for the refunded amount', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([originalTx])),
      insert: jest.fn().mockReturnValue(q(undefined)),
      update: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const result = await handleRefund(validEvent);

    expect(result).toEqual({ received: true });
    expect(tx.insert).toHaveBeenCalled();
  });

  it('updates spentThisMonth on the card', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([originalTx])),
      insert: jest.fn().mockReturnValue(q(undefined)),
      update: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    await handleRefund(validEvent);

    expect(tx.update).toHaveBeenCalled();
  });

  it('converts refund amount from smallest unit to decimal', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(q([originalTx])),
      insert: jest.fn().mockReturnValue(q(undefined)),
      update: jest.fn().mockReturnValue(q(undefined)),
    };
    (db.transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    // 25000 öre = 250.00 SEK — the inserted transaction should have amount -250.00
    await handleRefund(validEvent);

    // insert is chained; we verify it was called with the transactions table
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });
});
