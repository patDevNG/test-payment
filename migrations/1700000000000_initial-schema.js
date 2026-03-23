/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

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

    CREATE TABLE IF NOT EXISTS company_members (
      user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      role        TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, company_id)
    );

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

    CREATE TABLE IF NOT EXISTS transactions (
      id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
      card_id             UUID            NOT NULL REFERENCES cards(id),
      company_id          UUID            NOT NULL REFERENCES companies(id),
      amount              NUMERIC(12,2)   NOT NULL,
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

    CREATE TABLE IF NOT EXISTS audit_events (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id    UUID        NOT NULL REFERENCES users(id),
      entity_type TEXT        NOT NULL,
      entity_id   UUID        NOT NULL,
      action      TEXT        NOT NULL,
      old_value   JSONB,
      new_value   JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP VIEW IF EXISTS card_spend_summary;
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS cards;
    DROP TABLE IF EXISTS company_members;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS companies;
    DROP FUNCTION IF EXISTS set_updated_at;
    DROP EXTENSION IF EXISTS pgcrypto;
  `);
};
