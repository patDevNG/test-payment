import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { db } from '../../db';
import { companyMembers, users } from '../../db/schema';
import { AppError } from '../../http/middleware/errorHandler';
import { getLogger } from '../../logger';

const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes in seconds

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export const login = async (email: string, password: string): Promise<AuthTokens> => {
  const log = getLogger();
  const emailDomain = email.split('@')[1] ?? 'unknown';
  log.info({ emailDomain }, 'Login attempt');

  const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = userRows[0];

  const hash = user?.passwordHash ?? '$2b$10$invalidsaltinvalidsaltinv.u1u1u1u1u1u1u1u1u1u1u';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    log.warn({ emailDomain }, 'Login failed — invalid credentials');
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const memberRows = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.userId, user.id))
    .limit(1);

  const member = memberRows[0];
  if (!member) {
    log.warn({ userId: user.id }, 'Login failed — user has no company membership');
    throw new AppError(403, 'NO_COMPANY', 'User is not a member of any company');
  }

  const accessToken = jwt.sign({ sub: user.id, cid: member.companyId }, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_TTL,
  });

  log.info({ userId: user.id, companyId: member.companyId }, 'Login successful');
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL };
};
