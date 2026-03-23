import type { Request, Response } from 'express';
import {
  activateCard,
  getCard,
  getSpendSummary,
  listCards,
} from '../../../app/cards/cards.service';

export const listCardsHandler = async (req: Request, res: Response) => {
  const cards = await listCards(req.ctx);
  return res.json({ success: true, data: cards });
};

export const getCardHandler = async (req: Request, res: Response) => {
  const card = await getCard(req.ctx, req.params.id as string);
  return res.json({ success: true, data: card });
};

export const activateCardHandler = async (req: Request, res: Response) => {
  const result = await activateCard(req.ctx, req.params.id as string);
  return res.json({ success: true, data: result });
};

export const getCardSpendHandler = async (req: Request, res: Response) => {
  const spend = await getSpendSummary(req.ctx, req.params.id as string);
  return res.json({ success: true, data: spend });
};
