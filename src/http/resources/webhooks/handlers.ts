import type { Request, Response } from 'express';
import { handleIssuingAuthorization } from '../../../app/webhooks/issuing.service';
import { handleRefund } from '../../../app/webhooks/refund.service';
import { handleSettlement } from '../../../app/webhooks/settlement.service';

export const issuingAuthorizationHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await handleIssuingAuthorization(req.body);
  res.json(result);
};

export const settlementHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await handleSettlement(req.body);
  res.json(result);
};

export const refundHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await handleRefund(req.body);
  res.json(result);
};
