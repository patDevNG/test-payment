import type { Request, Response } from 'express';
import { getDashboard } from '../../../app/dashboard/dashboard.service';

export const getDashboardHandler = async (req: Request, res: Response) => {
  const data = await getDashboard(req.ctx);
  return res.json({ success: true, data });
};
