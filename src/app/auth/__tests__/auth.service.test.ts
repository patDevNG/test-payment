import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../../../db';
import { AppError } from '../../../http/middleware/errorHandler';
import { login } from '../auth.service';

jest.mock('../../../db', () => ({
  db: { select: jest.fn() },
}));

jest.mock('../../../logger', () => ({
  getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('../../../config/env', () => ({
  env: { JWT_PRIVATE_KEY: 'test-private-key' },
}));

const q = (result: unknown) => {
  const chain: any = {};
  for (const m of ['from', 'where', 'limit']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  const p = Promise.resolve(result);
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
};

const userRow = {
  id: 'user-1',
  email: 'jane@example.com',
  passwordHash: '$2b$10$hashedpassword',
};

const memberRow = { companyId: 'company-1' };

describe('login', () => {
  it('throws 401 when user is not found', async () => {
    (db.select as jest.Mock).mockReturnValue(q([])); // no user
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(login('unknown@example.com', 'password')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws 401 when password is wrong', async () => {
    (db.select as jest.Mock).mockReturnValue(q([userRow]));
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(login('jane@example.com', 'wrongpassword')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('runs bcrypt even when user is not found to prevent timing attacks', async () => {
    (db.select as jest.Mock).mockReturnValue(q([]));
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(login('ghost@example.com', 'password')).rejects.toThrow(AppError);
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when user has no company membership', async () => {
    (db.select as jest.Mock)
      .mockReturnValueOnce(q([userRow])) // users query
      .mockReturnValueOnce(q([])); // companyMembers query — no membership
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(login('jane@example.com', 'correct')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY',
    });
  });

  it('returns accessToken and expiresIn on successful login', async () => {
    (db.select as jest.Mock).mockReturnValueOnce(q([userRow])).mockReturnValueOnce(q([memberRow]));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (jwt.sign as jest.Mock).mockReturnValue('signed.jwt.token');

    const result = await login('jane@example.com', 'correct');

    expect(result).toEqual({ accessToken: 'signed.jwt.token', expiresIn: 900 });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: userRow.id, cid: memberRow.companyId },
      'test-private-key',
      { algorithm: 'RS256', expiresIn: 900 },
    );
  });
});
