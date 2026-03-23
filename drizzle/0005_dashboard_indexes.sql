-- Replace single-column cards index with composite covering ORDER BY created_at
DROP INDEX IF EXISTS idx_cards_company;
CREATE INDEX IF NOT EXISTS idx_cards_company_created ON cards (company_id, created_at);

-- Replace single-column invoices index with composite covering status filter + due_date sort
DROP INDEX IF EXISTS idx_invoices_company;
CREATE INDEX IF NOT EXISTS idx_invoices_company_status_due ON invoices (company_id, status, due_date);
