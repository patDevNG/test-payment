import type { Request, Response } from 'express';
import { getInvoice, listInvoices } from '../../../app/invoices/invoices.service';
import type { ListInvoicesQuery } from './spec';

export const listInvoicesHandler = async (req: Request, res: Response) => {
  const query = req.query as unknown as ListInvoicesQuery;
  const { rows, total, nextCursor } = await listInvoices(req.ctx, query);
  return res.json({
    success: true,
    data: rows,
    meta: { limit: query.limit, total, nextCursor },
  });
};

export const getInvoiceHandler = async (req: Request, res: Response) => {
  const invoice = await getInvoice(req.ctx, req.params.id as string);
  return res.json({ success: true, data: invoice });
};
