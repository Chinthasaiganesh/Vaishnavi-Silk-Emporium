# Testing Strategy

## Current Test Architecture

Backend uses Node's built-in `node:test` runner via `npm test`. Six focused tests cover database production configuration, inventory arithmetic/reservation invariant, order pricing, order-reference generation, payment rejection reason, and product image parsing. Tests are pure/unit-level; no PostgreSQL integration suite exists. There are no frontend unit/component tests, Playwright tests, browser E2E tests, or committed fixtures covering full flows.

GitHub Actions (`.github/workflows/ci.yml`) runs Node 20, `npm ci` in backend, `node --check src/server.js`, `npm ci` in frontend, and `npm run build`. It does not invoke `npm test`, lint, migration tests, accessibility checks, security scans, or deployment. CI is triggered on pushes and PRs targeting `main`.

## Test Matrix

| Area | Current | Required regression coverage |
| --- | --- | --- |
| Pure domain unit | Inventory/pricing/reference/payment review/image parser | Keep fast tests for boundary values, status transitions, price rounding, malformed inputs. |
| Auth/config | One production env config guard; no route-level tests | Login/register/refresh rotation/logout, disabled user, invalid JWT, role denial, owner scoping, OAuth state/provider errors, rate limit. |
| Database integration | None | PostgreSQL test DB; schema bootstrap twice; constraints; migrations from prior schema; transaction rollback. |
| Catalog/product | None | Guest vs authenticated DTO (including no price for guests after fix), visibility, filtering/sorting, discounts, image CRUD/compensation. |
| Inventory/cart | Pure arithmetic only | Concurrent last-unit add/reserve, cart lock, stock reduction with reservations, release/expiry, mirror reconciliation, audit. |
| Orders | None | Idempotent retry, reservation conversion, out-of-stock race, history/lifecycle, cancellation and stock return exactly once. |
| Payment/refund | Pure rejection helper only | Proof upload, verify/reject, resubmit, verify after cancellation, refund transition matrix and idempotency. |
| Notifications | None | Generation/dedupe/owner scope/read/delete/50-row cap/redirect and back-in-stock one-shot. |
| Frontend | Build only | React component tests for route guards/forms/context; accessible keyboard/mobile interaction and loading/error states. |
| E2E/Playwright | None | Browser journeys against isolated API + PostgreSQL and mocked/test object storage. |
| Accessibility | `axe-core` dependency exists; no checked-in test script found | Integrate axe scans for customer/admin critical pages, focus/contrast/reduced motion. |
| Performance/security | None in CI | API pagination/load baseline, dependency audit, secret scan, upload limits, CORS/CSRF/XSS regression. |

## Critical User Journeys

1. Guest browse/search/category/product; verify active visibility and price exposure contract.
2. Register USER; login; refresh token rotates persisted session; logout in one tab propagates.
3. Add to cart; update/remove; test unavailable product and guest restrictions.
4. Checkout address ownership validation; reserve stock; second customer cannot reserve last units; cart locked; release/expiry returns stock.
5. Build QR amount/note from reservation; submit UTR and image; idempotent retry creates only one order and clears cart.
6. Admin verifies payment; order advances to PROCESSING; customer sees notification and timeline; admin moves through each allowed shipment state.
7. Admin rejects payment; reservation-backed order cancels/restores stock; eligible non-canceled order can resubmit proof.
8. Cancel before shipping with/without submitted payment; refund unavailable until verified; valid refund transitions; inventory returned once.
9. Back-in-stock subscription receives one notification on zero-to-positive available stock; read/delete and redirect behavior work.
10. Admin creates product with multiple images, edits category/stock/visibility, deletes product while order history remains intact.

## Test Environment Requirements

Use isolated PostgreSQL database per test run; never production. Provide test storage bucket or S3 mock and clean objects on teardown. Seed explicit small fixtures (two customers, admin, products with known inventory, addresses). Use controlled clock/short reservation duration or injectable clock for expiry tests. Do not use external real UPI transfer. Keep UTR/screenshots fake and synthetic.

## Regression Gates to Add

- Run backend `npm test` in CI immediately.
- Add integration suite for transactional reservation and order concurrency using PostgreSQL.
- Add API contract tests for exact status/response validation and RBAC; include guest price omission test.
- Add Playwright checkout/payment-review/refund flow and notification redirect test.
- Add storage upload MIME/size/content tests and compensation/orphan test.
- Add migration smoke test: blank DB plus prior release schema → current release; verify rollback compatibility.
- Gate deployment on CI and explicit migration/staging approval; preserve test logs and request IDs.

Tests should assert invariants and public behavior rather than private SQL implementation. Every state-changing path should verify both DB rows and user-visible API/UI outcome.
