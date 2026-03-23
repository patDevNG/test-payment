-- 1. Add spend tracking columns to cards
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS spent_this_month NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spend_month      DATE          NOT NULL DEFAULT date_trunc('month', NOW());

-- 2. Trigger function: keeps spent_this_month accurate on transaction changes
CREATE OR REPLACE FUNCTION update_card_spend() RETURNS TRIGGER AS $$
DECLARE
  cur_month DATE := date_trunc('month', NOW());
BEGIN
  -- Auto-reset if the stored month is stale (month rollover)
  UPDATE cards
     SET spent_this_month = 0, spend_month = cur_month
   WHERE id = COALESCE(NEW.card_id, OLD.card_id)
     AND spend_month < cur_month;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'settled' AND NEW.transacted_at >= cur_month THEN
      UPDATE cards SET spent_this_month = spent_this_month + ABS(NEW.amount) WHERE id = NEW.card_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status flipped TO settled in current month → add
    IF OLD.status != 'settled' AND NEW.status = 'settled' AND NEW.transacted_at >= cur_month THEN
      UPDATE cards SET spent_this_month = spent_this_month + ABS(NEW.amount) WHERE id = NEW.card_id;
    -- Status flipped FROM settled in current month → subtract
    ELSIF OLD.status = 'settled' AND NEW.status != 'settled' AND OLD.transacted_at >= cur_month THEN
      UPDATE cards SET spent_this_month = spent_this_month - ABS(OLD.amount) WHERE id = NEW.card_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'settled' AND OLD.transacted_at >= cur_month THEN
      UPDATE cards SET spent_this_month = spent_this_month - ABS(OLD.amount) WHERE id = OLD.card_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_card_spend
  AFTER INSERT OR UPDATE OF status, amount OR DELETE
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_card_spend();

-- 3. Backfill current month's spend for all existing cards
UPDATE cards c
   SET spent_this_month = (
         SELECT COALESCE(SUM(ABS(t.amount)), 0)
           FROM transactions t
          WHERE t.card_id = c.id
            AND t.status = 'settled'
            AND t.transacted_at >= date_trunc('month', NOW())
       ),
       spend_month = date_trunc('month', NOW());

-- 4. New indexes
CREATE INDEX IF NOT EXISTS idx_cards_company_created
  ON cards(company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_card_time
  ON transactions(card_id, transacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_card_settled
  ON transactions(card_id, transacted_at DESC)
  WHERE status = 'settled';

CREATE INDEX IF NOT EXISTS idx_invoices_company_status_due
  ON invoices(company_id, status, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_events(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_events(actor_id, created_at DESC);

-- 5. Drop old redundant index and view
DROP INDEX IF EXISTS idx_transactions_card;
DROP VIEW  IF EXISTS card_spend_summary;
