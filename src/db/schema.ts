import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  orgNumber: text('org_number').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companyMembers = pgTable(
  'company_members',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    check('company_members_role_check', sql`${t.role} IN ('owner', 'admin', 'member')`),
  ],
);

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    lastFour: varchar('last_four', { length: 4 }).notNull(),
    cardHolder: text('card_holder').notNull(),
    network: text('network').notNull(),
    status: text('status').notNull().default('inactive'),
    spendLimit: numeric('spend_limit', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('SEK'),
    spentThisMonth: numeric('spent_this_month', { precision: 12, scale: 2 }).notNull().default('0'),
    spendMonth: date('spend_month').notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_cards_company').on(t.companyId),
    check('cards_network_check', sql`${t.network} IN ('Mastercard', 'Visa')`),
    check('cards_status_check', sql`${t.status} IN ('active', 'inactive', 'blocked')`),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('SEK'),
    merchantName: text('merchant_name').notNull(),
    merchantCategory: text('merchant_category'),
    description: text('description'),
    status: text('status').notNull(),
    transactedAt: timestamp('transacted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_transactions_company').on(t.companyId),
    index('idx_transactions_card').on(t.cardId),
    index('idx_transactions_company_time').on(t.companyId, t.transactedAt),
    check('transactions_status_check', sql`${t.status} IN ('pending', 'settled', 'declined')`),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('SEK'),
    dueDate: date('due_date').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_invoices_company').on(t.companyId),
    check('invoices_status_check', sql`${t.status} IN ('pending', 'paid', 'overdue')`),
  ],
);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
