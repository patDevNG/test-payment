/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  if (process.env['NODE_ENV'] === 'production') return;

  pgm.sql(`
    DO $$
    DECLARE
      v_company_id  UUID;
      v_user_id     UUID;
      v_card_id     UUID;
    BEGIN
      INSERT INTO companies (id, name, org_number)
      VALUES ('11111111-0000-0000-0000-000000000001', 'Company AB', '556123-4567')
      ON CONFLICT DO NOTHING;
      v_company_id := '11111111-0000-0000-0000-000000000001';

      INSERT INTO users (id, email, name)
      VALUES ('22222222-0000-0000-0000-000000000001', 'patrick@company.se', 'Patrick Lindqvist')
      ON CONFLICT DO NOTHING;
      v_user_id := '22222222-0000-0000-0000-000000000001';

      INSERT INTO company_members (user_id, company_id, role)
      VALUES (v_user_id, v_company_id, 'owner')
      ON CONFLICT DO NOTHING;

      INSERT INTO cards (id, company_id, last_four, card_holder, network, status, spend_limit, currency)
      VALUES ('33333333-0000-0000-0000-000000000001', v_company_id, '4242', 'Patrick Lindqvist', 'Mastercard', 'inactive', 10000.00, 'SEK')
      ON CONFLICT DO NOTHING;
      v_card_id := '33333333-0000-0000-0000-000000000001';

      INSERT INTO transactions (card_id, company_id, amount, currency, merchant_name, merchant_category, description, status, transacted_at)
      VALUES
        (v_card_id, v_company_id, -1200.00, 'SEK', 'Spotify AB',        'Entertainment', 'Streaming subscription', 'settled', NOW() - INTERVAL '1 day'),
        (v_card_id, v_company_id, -850.50,  'SEK', 'ICA Maxi',          'Groceries',     NULL,                    'settled', NOW() - INTERVAL '2 days'),
        (v_card_id, v_company_id, -3350.00, 'SEK', 'SAS Airlines',      'Travel',        'Stockholm-London',      'settled', NOW() - INTERVAL '5 days'),
        (v_card_id, v_company_id, -299.00,  'SEK', 'Adobe Inc',         'Software',      'Creative Cloud',        'pending', NOW() - INTERVAL '6 hours'),
        (v_card_id, v_company_id, -450.00,  'SEK', 'Restaurang Pelikan','Dining',        NULL,                    'settled', NOW() - INTERVAL '8 days')
      ON CONFLICT DO NOTHING;

      INSERT INTO invoices (card_id, company_id, amount, currency, due_date, status)
      VALUES (v_card_id, v_company_id, 5400.00, 'SEK', CURRENT_DATE + INTERVAL '14 days', 'pending')
      ON CONFLICT DO NOTHING;
    END $$;
  `);
};

exports.down = (pgm) => {
  if (process.env['NODE_ENV'] === 'production') return;

  pgm.sql(`
    DELETE FROM invoices     WHERE company_id = '11111111-0000-0000-0000-000000000001';
    DELETE FROM transactions WHERE company_id = '11111111-0000-0000-0000-000000000001';
    DELETE FROM cards        WHERE company_id = '11111111-0000-0000-0000-000000000001';
    DELETE FROM company_members WHERE company_id = '11111111-0000-0000-0000-000000000001';
    DELETE FROM users        WHERE id = '22222222-0000-0000-0000-000000000001';
    DELETE FROM companies    WHERE id = '11111111-0000-0000-0000-000000000001';
  `);
};
