import { db } from '../../../db';
import { handleSettlement } from '../settlement.service';

jest.mock('../../../db', () => ({
  db: { update: jest.fn() },
}));

jest.mock('../../../logger', () => ({
  getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const q = (result: unknown) => {
  const chain: any = {};
  for (const m of ['set', 'where', 'returning']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  const p = Promise.resolve(result);
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
};

const validEvent = {
  type: 'transaction.settled',
  data: {
    object: {
      authorization_id: 'auth-1',
      transaction_id: 'tx-ext-1',
    },
  },
};

describe('handleSettlement', () => {
  it('returns received: true for invalid event shape without throwing', async () => {
    const result = await handleSettlement({ type: 'unknown' });
    expect(result).toEqual({ received: true });
  });

  it('returns received: true and updates transaction status to settled', async () => {
    (db.update as jest.Mock).mockReturnValue(q([{ id: 'tx-1' }]));

    const result = await handleSettlement(validEvent);

    expect(result).toEqual({ received: true });
    expect(db.update).toHaveBeenCalled();
  });

  it('returns received: true when authorization_id is not found', async () => {
    (db.update as jest.Mock).mockReturnValue(q([]));

    const result = await handleSettlement(validEvent);

    expect(result).toEqual({ received: true });
  });
});
