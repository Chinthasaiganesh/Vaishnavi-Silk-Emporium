# Future Architecture Roadmap

Recommendations are options, not current features. Prioritize operational safety and data integrity before adding large new product capabilities.

## Immediate (0–1 month)

- Fix guest price DTO leak; add API tests for roles and order ownership.
- Run existing tests in CI; add PostgreSQL integration tests for stock reservation/order/refund state transitions.
- Add startup validation for S3 config and separate public catalog images from private payment proofs.
- Validate all order UTR/image fields consistently; revoke refresh sessions after customer password change and decide disabled-user JWT policy.
- Add database snapshots/PITR/storage recovery checks; document live Vercel/Render/Supabase settings and secret owner.
- Document and test a staging environment; block production release on successful migration/smoke validation.
- Make reservation-notification dedupe idempotent per reservation.

## Short Term (1–3 months)

- Adopt ordered PostgreSQL migrations, migration lock/version table and backward-compatible rollout policy. Reconcile old SQL files or label/archive them clearly.
- Add API pagination, database-side search/order filtering, request limits and response DTO schemas.
- Add admin UI/API for user management only if operationally needed; add inventory reservation visibility and audit query tools.
- Add Playwright critical journeys and accessibility/performance CI. Build regression suite for manual payment and refund edge cases.
- Add centralized logs/error tracking/uptime metrics with redaction; establish SLO, RPO/RTO and incident contact.
- Add durable event/outbox + worker for notification dispatch and reservation cleanup; use stable dedupe keys.
- Add image transformation/responsive sizes, storage lifecycle/backup, orphan reconciliation and payment-proof access policy.
- Implement actual approved translation provider behind adapter; keep fallback, timeout, cache versioning and QA review for Telugu content.

## Stage Environment

Separate Vercel Preview or staging frontend, Render staging API, Supabase staging DB, storage bucket, OAuth app/callback, UPI/test payment identity, and secrets. Seed only sanitized test data. Run schema migration and smoke tests; do not share production DB, user credentials, object bucket or JWT secret. Promote the verified immutable commit to production with manual approval.

## Production Environment

Add migration gate and rollback-compatible releases; connection-pool sizing; rate limits; database monitoring; backup/PITR validation; object storage versioning/lifecycle; WAF/edge abuse protection as justified; privacy/retention policies; tested incident response and external synthetic tests. Do not assume provider free-tier defaults satisfy uptime, backup or scaling needs.

## Mid-Term Product Capabilities

- **Razorpay:** server-side order creation, signed webhook validation, replay/idempotency controls, event ledger, reconciliation and tested refund callbacks. Preserve reservation locking and handle late payment after expiry.
- **Real-time notifications:** keep Notifications table canonical; deliver via SSE/WebSocket backed by outbox, with reconnect cursor and polling fallback.
- **Advanced search:** PostgreSQL full-text/trigram initially; add filters, pagination and sorting at API/database layer. Search inventory/visibility with same access contract.
- **Analytics platform:** append-only order/payment/inventory events and privacy-reviewed reporting warehouse; keep transactional DB workloads separate.
- **Loyalty program:** ledger-based points/adjustments with expiry, idempotency and refund reversal; avoid mutable balance-only accounting.
- **Recommendations:** begin with transparent category/popularity rules; introduce recommendation service only with enough clean behavioral data and consent.

## Long Term

- **Multi-vendor support:** tenant/vendor ownership on catalog, stock, orders, settings, permissions and object prefixes; strict isolation tests; fulfillment/refund splits and settlement ledger. This is a major data model change, not just a role addition.
- **Microservice migration:** do not split prematurely. First define module boundaries, domain events, contracts, migration ownership and observability. If scale/team ownership requires it, extract independent workloads such as media, notifications or search before core order/inventory.
- **WebSocket architecture:** add only for demonstrated interaction need; horizontally scale with managed pub/sub, auth refresh/reconnect policy, backpressure and durable notification catch-up.
- **Data platform:** event stream/warehouse with documented PII handling, retention and reconciliation against source-of-truth Orders/Inventory.

## Decision Gates

For each proposal, record user value, measured bottleneck/risk, data migration, failure mode, security/privacy impact, operational owner, cost, acceptance tests and rollback. Do not market a roadmap item as shipped until the implementation, documentation and tests agree.
