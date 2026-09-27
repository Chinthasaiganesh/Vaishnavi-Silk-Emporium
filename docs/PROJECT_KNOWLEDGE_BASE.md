# Project Knowledge Base

## Business Domain

Vaishnavi Silk Emporium is a saree retail storefront with a small-store admin console. The core business records are products/catalog details, physical stock, customer carts and delivery addresses, manual UPI order/payment evidence, order fulfillment and cancellation/refund tracking. “Collections” is currently a frontend alias/catalog concept, not a distinct backend entity.

## System Overview

React 18 + Vite SPA (`frontend/`) calls an Express 4 API (`backend/`) over REST. API persists to PostgreSQL using `pg`; images are handled with an S3-compatible service configured for Supabase Storage. Repository deployment target is Vercel (frontend), Render (API), and Supabase (database/storage), but provider dashboards/live deployment facts require verification.

Read next: [ARCHITECTURE.md](ARCHITECTURE.md), [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md), [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Key Modules and Ownership

- `backend/src/server.js`: middleware, route composition, startup seed/bootstrap, health, reservation timer.
- `backend/src/db.js`: authoritative runtime PostgreSQL schema, SQL compatibility adapter, transactions.
- `products.routes.js` / categories: catalog visibility, product CRUD, image metadata, product audit.
- inventory repository/service: authoritative stock. `Inventory` is source; `Products.Quantity` is compatibility mirror.
- cart service/repository: server-priced user cart; locked during active reservation.
- reservation repository/checkout service: timed stock holds and immutable price/quantity snapshot.
- order repository/routes: order snapshots, state transitions, inventory consumption/restoration, payment/refund state.
- notification service/routes: persisted inbox and back-in-stock subscriptions; clients poll.
- frontend contexts: auth, cart, theme, language and modal notice queue; most page data stays local to route components.

## Key Flows

1. Login returns 15-minute access JWT and HttpOnly rotating refresh cookie.
2. Checkout reserves stock for five minutes by default, calculates QR locally using `VITE_UPI_ID`, then submits UTR and screenshot.
3. Order transaction consumes reservation, creates payment-pending order, snapshots lines and clears cart.
4. Admin manually verifies/rejects; verified orders enter PROCESSING; fulfillment advances linearly.
5. Cancellation can start a refund state; admin records refund processing manually after payment verification. No gateway transfer is implemented.
6. Notification rows are polled by frontend and link to order/product when IDs exist.

## Important Decisions / Constraints

- Runtime schema is code-generated in `db.js`; `docs/schema.sql` and `docs/supabase-schema.sql` are not authoritative substitutes.
- One modular backend process, not microservices. No API versioning/OpenAPI, message queue, websocket or backend cache.
- Startup creates configured admin/customer only if username does not exist; startup does not rotate existing demo passwords.
- Product, cart, order lists are mostly unpaginated. Admin order search is in-memory.
- UPI verification/refund money movement is external and manual.
- Translation adapter currently returns source text; local language dictionary is partial.
- Frontend tests/E2E absent; CI omits backend test command.

## Current Risks and Technical Debt

- Public product JSON leaks price fields to guests despite `canViewPrice=false` and older docs claiming protection.
- Runtime DDL has no ordered migration/rollback process; deployment uses additive startup changes.
- Payment proofs use `PaymentScreenshotKey` in a dedicated private bucket and ADMIN-only five-minute signed URLs. Production requires `S3_PAYMENT_PROOFS_BUCKET`; verify its provider ACL and migrate/delete legacy public objects before collecting real payment evidence. Uploads can still become orphaned after storage succeeds but a database write fails.
- Auth token in web storage, disabled account access JWT lifetime, no customer session revocation on password change, no CSRF middleware/general rate limit.
- Notification polling volume and reservation notification dedupe behavior need attention.
- Legacy seed includes non-saree products. Admin user API lacks UI; privacy/terms pages are placeholders; reports are product-derived client-side.

## Getting Started

1. Read [README](../README.md) for local setup and scripts.
2. Use an isolated PostgreSQL DB; set `DATABASE_URL`, backend secrets and frontend `VITE_API_URL`; set `VITE_UPI_ID` for QR flow.
3. Start backend with `cd backend && npm run dev`; frontend with `cd frontend && npm run dev`.
4. Check `GET /api/health`. Demo identities use configured backend username/password values only when absent from DB.
5. Run backend `npm test` and frontend `npm run build`; current CI only syntax-checks backend entrypoint and builds frontend.
6. For operations, read [DEPLOYMENT.md](DEPLOYMENT.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [MAINTENANCE_GUIDE.md](MAINTENANCE_GUIDE.md).

## Extension Guidance

Keep inventory/order/payment mutations transactional, preserve idempotency and histories, enforce owner scope in backend, and add tests for both success and race/denial cases. Update API/schema/business-rule docs with behavior changes. Treat payment evidence and customer data as sensitive. Do not rely on frontend route checks, labels, or README claims instead of the server implementation.

Future direction: first improve safety/migrations/tests/observability, then implement gateway verification and durable notifications, then evaluate search, analytics, loyalty, multi-vendor and service extraction. See [FUTURE_ARCHITECTURE_ROADMAP.md](FUTURE_ARCHITECTURE_ROADMAP.md).
