# Codebase Analysis Report

## Executive Assessment

The project is a feature-rich commerce SPA and modular Express monolith. It has real transactional handling for inventory reservations/order conversion, role-aware routes, customer order/payment review workflows, and focused pure logic tests. Its main production risks are startup-driven unversioned schema changes, incomplete CI/integration coverage, inconsistent validation/response contracts, unpaginated reads/polling, and several discrepancies between intended behavior and implementation.

## Structure and Module Boundaries

- `frontend/`: Vite/React SPA, page-based routing, shared contexts, UI components and local utilities.
- `backend/src/`: route modules with selected controllers/services/repositories; domain separation exists but not uniform.
- `backend/test/`: six Node unit tests for DB config, inventory logic, pricing, order reference, payment rejection reason and product image parsing.
- `docs/`: deployment/API/Postman and SQL artifacts plus this technical suite.
- `.github/workflows/ci.yml`: Node 20 install, server syntax check and frontend build; no tests or deploy job.

Reusable components/logic include public/admin layout, product cards/actions/media/price, shared auth/cart/theme/language/notifier contexts, `db.js` transaction adapter, stock transition helper, pricing/order reference/image parsing helpers, notification presets and INR/image/UPI utilities.

## Confirmed Findings

### High: Guest price API exposure

`products.routes.js` passes `canViewPrice=false` for guest request but `mapProduct` still serializes numeric `price`, `originalPrice`, and possibly `discountedPrice`; `canViewPrice` is only metadata. UI sign-in masking does not protect API data. This conflicts with README/Postman behavior claims and should be fixed at serializer/query contract with regression tests.

### High: Runtime schema has no ordered migration workflow

`db.js` executes DDL and backfills on import/startup. The SQL files in `docs/` do not match final runtime schema (legacy SQLite fragment and incomplete lowercase Supabase draft). This creates deployment compatibility and rollback risk. Add reviewed, versioned migrations and compare schema before release.

### Medium: CI does not run the test suite

Workflow runs `node --check src/server.js` and `npm run build`, but omits `npm test`, DB-backed integration tests and E2E. Changes can pass CI while domain tests regress.

### Medium: Storage settings are not startup-validated

S3 client is constructed with blank defaults; DB transaction can fail after object upload, leaving orphan objects. Render Blueprint does not declare S3 variables; they may exist only in dashboard. Add startup readiness/config validation, upload compensation and lifecycle cleanup.

### Medium: Unpaginated/catalog-wide processing

Public products are loaded as all active rows and filtered/sorted in JavaScript. Admin order listing loads all orders before in-memory search/status filter. No pagination contract exists. This raises memory/latency and information exposure risk as data grows.

### Medium: Polling load and duplicate background work

Header polls notifications every five seconds per signed-in tab; catalog/product details/home refresh at roughly 15 seconds, cart/wishlist 30 seconds. Reservation cleanup is per API process every 30 seconds. This increases DB reads and produces multiple schedulers if scaled horizontally.

### Medium: Security/session gaps

No general API rate limit, MFA, email verification, recovery flow, CSRF protection for cookie refresh, or external error monitoring. Access JWT is stored in web storage. Existing JWTs can remain valid after account disable; customer password change does not revoke refresh sessions. Upload validation relies on MIME metadata plus limited avatar decode checks.

### Medium: Translation integration not implemented

`translation.service.js` returns original source text; `INDIC_TRANS2_URL` only changes provider label and does not make a network call. UI language dictionary is partial.

### Medium: Reservation notification dedupe is too broad

`sendReservationNotification` receives reservation ID but neither persists nor includes it in dedupe query. Identical notification content for a user can suppress future session notifications.

### Low: Development seed data does not match store domain

`seed.js` inserts legacy laptop/furniture/speaker items alongside saree fixtures. Do not run against production. Seed script should be development-gated and consistent with product domain.

### Low: Admin modules advertised but not all surfaced

Admin user management APIs exist but no admin-users page/route; admin notification center likewise absent. Reports are computed client-side from product API. “Collections” is a frontend catalog alias, not a backend entity/API.

## Data and API Consistency

- Response casing mixes camelCase DTOs and raw PascalCase DB records.
- Validation is uneven; some endpoints rely on DB constraints, and order creation does not validate initial UTR with the same express-validator used for proof resubmission.
- Registration validates mobile format but `Users.MobileNumber` is not unique, while API error text suggests duplicate mobile numbers are rejected. Product-create upload fields allow one `image` plus eight `images` without a combined eight-image check; edit does enforce the combined cap.
- No OpenAPI/JSON schema contract or automated API compatibility check.
- `Notifications.OrderId` and `ProductAuditLog.ProductId` are not FKs; address/order ownership consistency is not enforced by a composite DB constraint.
- Audit logs are written in several flows but no administrative query/retention interface exists for all of them. Cart/order logs appear primarily write-oriented; verify all readers before labeling them unused.
- `InventoryMigrations` is read/written as the one-time legacy-stock bootstrap and is not dead code. TranslationCache is read/written but currently caches identity fallback output.

## Technical Debt and Duplication

- SQL is embedded in route, service and repository layers with SQLite-like syntax converted at runtime by regex. This adapter increases cognitive burden and makes arbitrary PostgreSQL SQL harder to reason about.
- Error mapping, validation, DTO mapping and mutation response patterns repeat across route modules.
- Product image cleanup/update compensation is split around DB transactions and external storage; no outbox or reconciliation job.
- Product image URLs are stored as serialized JSON inside one text field rather than normalized image rows.
- Order statuses/payment/refunds have different state domains but partly overlap legacy status values such as REFUNDED/CANCELLED.
- Several timers and polling intervals are hard-coded in UI/API code.
- No formal branch strategy/staging pipeline/deployment approval is in repository.

## Dead Code and Unused Surface

No complete dead-code analyzer or import graph was run, so this section avoids asserting arbitrary files are dead. Verified unused-from-UI surfaces include `/api/admin/users` endpoints and translation endpoint (no UI invocation found in frontend API scan). `createOrder`/non-reservation order fallback remains in backend but public route requires reservation header; treat as legacy internal path and confirm usages before removal. Older SQL schemas and lowercase `docs/deployment.md` coexist with runtime schema and newly generated uppercase docs; maintain clear source-of-truth labels.

## Performance Findings

- Public product and admin order data are fetched wholesale; filtering/search is partly client/server process memory.
- Frequent repeated polling and no conditional caching add SQL/API load.
- Notification endpoint returns 50 latest records plus unread count; count is a separate query.
- Inventory list writes one VIEWED audit row per returned item, increasing writes on read-heavy admin page.
- Images use immutable one-year cache-control and UUID names; this is beneficial if URLs change on content replacement. No resizing/format negotiation is implemented.
- No frontend bundle-size budget or bundle analyzer in CI.

## Architecture Risks and Recommended Priorities

1. Fix public price serialization and add API regression test.
2. Replace startup DDL with ordered migration tool and staging migration gate; document schema compatibility.
3. Run all backend tests in CI, then add PostgreSQL integration tests for reservation/order concurrency and payment/refund transitions.
4. Add API pagination/search at database layer and remove full-result JS filtering.
5. Add storage validation, private payment-proof access policy, upload compensation and orphan scanner.
6. Add rate limiting, CSRF review, access-token/session revocation strategy, security headers/CSP review and secret rotation procedure.
7. Add end-to-end test suite for login, checkout reservation/expiry, payment review, cancel/refund, notification links and admin workflows.
8. Add central observability, health/readiness probes for storage and DB pool metrics.
9. Add idempotent notification event key and retention/pagination.
10. Clarify admin user-management UX, complete/label translation behavior, legal routes, and production-safe seed strategy.

## Scope and Confidence

Assessment is source-based. Live provider dashboards, production database contents, object policies, real deployment history, traffic and operational incident data are not available from this workspace. Deployment statements distinguish repository configuration from provider runtime facts. No test/build was run as part of this report generation yet; final task verification is recorded in the session response.
