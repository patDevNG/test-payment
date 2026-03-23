-- ============================================================
-- Qred Mobile Dashboard — Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------
-- updated_at trigger helper
-- ----------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------
-- companies
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  org_number  TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------
-- users
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------
-- company_members  (users ↔ companies)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS company_members (
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

-- ----------------------------------------
-- cards
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS cards (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID            NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_four    CHAR(4)         NOT NULL,
  card_holder  TEXT            NOT NULL,
  network      TEXT            NOT NULL CHECK (network IN ('Mastercard', 'Visa')),
  status       TEXT            NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'blocked')),
  spend_limit  NUMERIC(12,2)   NOT NULL,
  currency     CHAR(3)         NOT NULL DEFAULT 'SEK',
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_company ON cards(company_id);

CREATE TRIGGER cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------
-- transactions
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id             UUID            NOT NULL REFERENCES cards(id),
  company_id          UUID            NOT NULL REFERENCES companies(id),
  amount              NUMERIC(12,2)   NOT NULL,  -- negative = debit
  currency            CHAR(3)         NOT NULL DEFAULT 'SEK',
  merchant_name       TEXT            NOT NULL,
  merchant_category   TEXT,
  description         TEXT,
  status              TEXT            NOT NULL CHECK (status IN ('pending', 'settled', 'declined')),
  transacted_at       TIMESTAMPTZ     NOT NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_company      ON transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card         ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_time ON transactions(company_id, transacted_at DESC);

-- ----------------------------------------
-- invoices
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID            NOT NULL REFERENCES cards(id),
  company_id  UUID            NOT NULL REFERENCES companies(id),
  amount      NUMERIC(12,2)   NOT NULL,
  currency    CHAR(3)         NOT NULL DEFAULT 'SEK',
  due_date    DATE            NOT NULL,
  status      TEXT            NOT NULL CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);

-- ----------------------------------------
-- audit_events
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        NOT NULL REFERENCES users(id),
  entity_type TEXT        NOT NULL,  -- 'card', 'invoice', etc.
  entity_id   UUID        NOT NULL,
  action      TEXT        NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------
-- card_spend_summary view
-- ----------------------------------------
CREATE OR REPLACE VIEW card_spend_summary AS
SELECT
  c.id                                          AS card_id,
  c.company_id,
  c.spend_limit,
  c.currency,
  COALESCE(SUM(ABS(t.amount)) FILTER (
    WHERE t.status = 'settled'
      AND t.transacted_at >= date_trunc('month', now())
  ), 0)                                         AS spent_this_month,
  c.spend_limit - COALESCE(SUM(ABS(t.amount)) FILTER (
    WHERE t.status = 'settled'
      AND t.transacted_at >= date_trunc('month', now())
  ), 0)                                         AS remaining
FROM cards c
LEFT JOIN transactions t ON t.card_id = c.id
GROUP BY c.id;

-- ----------------------------------------
-- Seed data (dev / demo only)
-- ----------------------------------------
DO $$
DECLARE
  v_company_id  UUID;
  v_user_id     UUID;
  v_card_id     UUID;
BEGIN
  -- company
  INSERT INTO companies (id, name, org_number)
  VALUES ('11111111-0000-0000-0000-000000000001', 'Company AB', '556123-4567')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_company_id;

  IF v_company_id IS NULL THEN
    v_company_id := '11111111-0000-0000-0000-000000000001';
  END IF;

  -- user
  INSERT INTO users (id, email, name)
  VALUES ('22222222-0000-0000-0000-000000000001', 'patrick@company.se', 'Patrick Lindqvist')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    v_user_id := '22222222-0000-0000-0000-000000000001';
  END IF;

  -- membership
  INSERT INTO company_members (user_id, company_id, role)
  VALUES (v_user_id, v_company_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- card
  INSERT INTO cards (id, company_id, last_four, card_holder, network, status, spend_limit, currency)
  VALUES ('33333333-0000-0000-0000-000000000001', v_company_id, '4242', 'Patrick Lindqvist', 'Mastercard', 'inactive', 10000.00, 'SEK')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_card_id;

  IF v_card_id IS NULL THEN
    v_card_id := '33333333-0000-0000-0000-000000000001';
  END IF;

  -- transactions
  INSERT INTO transactions (card_id, company_id, amount, currency, merchant_name, merchant_category, description, status, transacted_at)
  VALUES
    (v_card_id, v_company_id, -1200.00, 'SEK', 'Spotify AB',       'Entertainment', 'Streaming subscription', 'settled', NOW() - INTERVAL '1 day'),
    (v_card_id, v_company_id, -850.50,  'SEK', 'ICA Maxi',         'Groceries',     NULL,                    'settled', NOW() - INTERVAL '2 days'),
    (v_card_id, v_company_id, -3350.00, 'SEK', 'SAS Airlines',     'Travel',        'Stockholm-London',      'settled', NOW() - INTERVAL '5 days'),
    (v_card_id, v_company_id, -299.00,  'SEK', 'Adobe Inc',        'Software',      'Creative Cloud',        'pending', NOW() - INTERVAL '6 hours'),
    (v_card_id, v_company_id, -450.00,  'SEK', 'Restaurang Pelikan','Dining',       NULL,                    'settled', NOW() - INTERVAL '8 days')
  ON CONFLICT DO NOTHING;

  -- invoice
  INSERT INTO invoices (card_id, company_id, amount, currency, due_date, status)
  VALUES (v_card_id, v_company_id, 5400.00, 'SEK', CURRENT_DATE + INTERVAL '14 days', 'pending')
  ON CONFLICT DO NOTHING;
END $$;
