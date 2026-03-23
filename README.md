# Payment Platform API

A B2B corporate card management and transaction processing platform. Companies issue spending cards to employees, track transactions in real time via webhooks from an external card provider, manage spend limits, and receive invoices — all through a single REST API.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (ES2022, strict) |
| Framework | Express.js v5 |
| Database | PostgreSQL 16 (Drizzle ORM) |
| Auth | JWT RS256 (15-min access tokens) |
| Validation | Zod |
| Logging | Pino (structured JSON) |
| Testing | Jest + ts-jest + Supertest |
| Linting | Biome |

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default: `3000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_PRIVATE_KEY` | RSA private key for signing tokens |
| `JWT_PUBLIC_KEY` | RSA public key for verifying tokens |
| `EXTERNAL_API_WEBHOOK_SECRET` | HMAC secret for verifying incoming webhooks |
| `LOG_LEVEL` | `trace` / `debug` / `info` / `warn` / `error` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms (default: `60000`) |
| `RATE_LIMIT_MAX` | Max requests per window (default: `100`) |

**Generating RSA keys:**

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Set `JWT_PRIVATE_KEY` to the contents of `private.pem` and `JWT_PUBLIC_KEY` to `public.pem`.

### 3. Start the database

```bash
docker compose up -d
```

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. Start the dev server

```bash
npm run dev
```

The server starts at `http://localhost:3000`. The OpenAPI spec is available at `GET /api/v1/openapi.json`.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile TypeScript to `/dist` |
| `npm start` | Run compiled build |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with Biome |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code |
| `npm run db:migrate` | Apply pending migrations from `drizzle/` in order |
| `npm run db:studio` | Open Drizzle Studio GUI |

## API Overview

All authenticated routes require `Authorization: Bearer <token>`.

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login with email + password → JWT |

Rate limited to **20 requests per 15 minutes** per IP.

### Cards

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/cards` | List company cards |
| `GET` | `/api/v1/cards/:id` | Get card details |
| `PATCH` | `/api/v1/cards/:id/activate` | Activate a card |
| `GET` | `/api/v1/cards/:id/spend` | Get card spend summary |

### Transactions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/transactions` | List transactions (paginated) |
| `GET` | `/api/v1/transactions/:id` | Get transaction details |

### Invoices

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/invoices` | List invoices (paginated) |
| `GET` | `/api/v1/invoices/:id` | Get invoice details |

### Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/dashboard` | Aggregated dashboard payload (company, card, spend, recent transactions, next invoice) |

The dashboard returns up to `1000` for `totalTransactionCount`. A value of exactly `1000` means "at least 1000" — display as `1000+` in the UI.

### Webhooks

Signed with HMAC-SHA256. The signature is sent in the `X-Webhook-Signature` header as `t=<timestamp>,v1=<signature>`. Requests older than 5 minutes are rejected.

| Method | Path | Event |
|---|---|---|
| `POST` | `/api/v1/webhooks/issuing_authorization` | Card authorization request — validates spend limit and returns `{ approved: boolean }` |
| `POST` | `/api/v1/webhooks/transaction_settled` | Transaction settled — updates status to `settled` |
| `POST` | `/api/v1/webhooks/transaction_refunded` | Transaction refunded — reverses spend and updates status |

### Health Check

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns server status and DB connectivity |

## Database Schema

```
companies ──< company_members >── users
    │
    ├──< cards ──< transactions
    │               └── (externalId links to card network auth ID)
    │
    ├──< invoices
    │
    └── (auditEvents tracks actor + entity changes)
```

**Key design decisions:**
- `cards.spentThisMonth` is maintained in-app (incremented on authorization, decremented on refund) to avoid COUNT aggregations on every card spend check
- `transactions.externalId` links back to the card provider's authorization ID for idempotent webhook processing
- All monetary values stored as `NUMERIC(12,2)` and handled with `Decimal.js` to avoid floating-point errors

## Project Structure

```
src/
├── app/                  # Business logic (one directory per domain)
│   ├── auth/
│   ├── cards/
│   ├── dashboard/
│   ├── invoices/
│   ├── transactions/
│   └── webhooks/         # issuing, settlement, refund handlers
├── config/
│   └── env.ts            # Zod-validated environment variables
├── db/
│   └── schema.ts         # Drizzle table definitions + indexes
├── http/
│   ├── api.ts            # Express app factory + route registration
│   ├── openapi.ts        # OpenAPI registry
│   ├── middleware/       # auth context, validation, rate limiting, webhook sig
│   └── resources/        # Route handlers + Zod/OpenAPI specs per resource
├── ctx.ts                # Request context type (userId, companyId)
├── logger.ts             # Pino logger with AsyncLocalStorage enrichment
└── index.ts              # Server entry point + graceful shutdown
drizzle/                  # SQL migration files (sequential)
```

## Security

- **JWT RS256** — asymmetric signing; public key can be distributed to downstream services without exposing the signing key
- **bcrypt** password hashing with constant-time comparison to prevent timing attacks and user enumeration
- **Webhook HMAC** — replayed or tampered webhook payloads are rejected; timestamps are validated within a 5-minute window
- **Helmet.js** — security headers on all responses
- **Rate limiting** — global limiter + stricter limiter on auth endpoints
- **Explicit column selection** — sensitive fields (e.g. `externalCardId`) are never included in API responses

## Testing

```bash
npm test
npm run test:coverage
```

Tests live alongside source code in `__tests__/` directories within each domain. The suite covers service-level unit tests for all major domains: auth, cards, dashboard, transactions, invoices, and webhooks.
