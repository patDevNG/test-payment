import type { Request, Response } from 'express';
import { getTransaction, listTransactions } from '../../../app/transactions/transactions.service';
import type { ListTransactionsQuery } from './spec';

export const listTransactionsHandler = async (req: Request, res: Response) => {
  const query = req.query as unknown as ListTransactionsQuery;
  const { rows, total, nextCursor } = await listTransactions(req.ctx, query);
  return res.json({
    success: true,
    data: rows,
    meta: { limit: query.limit, total, nextCursor },
  });
};

export const getTransactionHandler = async (req: Request, res: Response) => {
  const transaction = await getTransaction(req.ctx, req.params.id as string);
  return res.json({ success: true, data: transaction });
};
