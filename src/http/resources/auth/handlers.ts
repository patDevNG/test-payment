import type { Request, Response } from 'express';
import { login } from '../../../app/auth/auth.service';
import type { LoginBody } from './spec';

export const loginHandler = async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginBody;
  const tokens = await login(email, password);
  return res.status(200).json({ success: true, data: tokens });
};
