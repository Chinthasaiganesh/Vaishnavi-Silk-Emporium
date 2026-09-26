# Performance Analysis

## Current Findings

No production traces, Lighthouse report, bundle report, database EXPLAIN output, or load test results are present. This is a source-level assessment; do not interpret recommendations as measured latency findings.

### Frontend

- Vite builds a client-rendered React SPA. No SSR/SSG or route-level lazy loading is visible in `App.jsx`; all route pages are statically imported.
- Vercel Analytics and Speed Insights are enabled. No bundle budget/analyzer or performance CI gate exists.
- Current local production build emits a 539.61 kB minified JavaScript entry chunk (169.17 kB gzip); Vite warns that the chunk exceeds its 500 kB advisory threshold. This is a build observation, not a runtime performance measurement.
- Home/catalog/detail pages use periodic fetches around 15 seconds; cart/wishlist refresh 30 seconds; header notifications every five seconds per signed-in tab. Visibility/focus guards limit some background work, but notification polling is frequent.
- Page/API state is mostly component-owned; there is no query cache/deduplication layer beyond some local in-flight guards.
- Images are served from object storage with one-year immutable cache header and UUID keys. No image resizing, responsive srcset, format negotiation or frontend lazy-image audit documented here.

### Backend/API

- Public products query all active rows, joins Inventory, then filters/searches/sorts in Node. Response size and CPU grow with catalog size.
- Admin order listing reads all joined orders and filters search/status in JavaScript. No pagination/limit contract.
- Inventory listing records one VIEWED audit row per product, making read operation write-amplifying.
- Notification list uses limit 50 plus separate unread count. Other list APIs often load all rows.
- Reservation cleanup uses process timer every 30 seconds and executes a transaction; horizontal instances duplicate scans (row locks mitigate concurrent release).
- PostgreSQL pool uses library defaults; no pool sizing, query timeout, slow-query instrumentation or pool saturation metrics are configured.

### Database

Explicit indexes cover common user/order/product/audit access, but no evidence of query-plan review or production cardinality. Search uses lowercased string filtering in app memory rather than indexed full-text/trigram search. Product category is text. Several wide aggregate joins do counts in SQL; listAllOrders still transfers all results.

### Caching

Only translation responses are cached in `TranslationCache`, but actual provider is identity fallback. No API/CDN cache headers for catalog are defined by route code. S3 objects set `Cache-Control: public,max-age=31536000,immutable`. Checkout QR cache is tab session storage keyed by reservation UUID, not shared API cache.

## Likely Bottlenecks

1. Product/order full scans and process-memory filtering as data grows.
2. Per-tab polling, especially five-second notification requests and multiple open tabs.
3. Large image bytes and full-resolution media on product pages.
4. PostgreSQL connection exhaustion as Render instances/traffic scale without explicit pool configuration.
5. Schema DDL/startup, timer duplication and concurrency behavior across horizontal replicas.
6. Audit table growth, especially inventory VIEWED records and notification retention absence.

## Optimization Sequence

1. Measure first: bundle report, Core Web Vitals, API p50/p95, pool metrics, query EXPLAIN, response sizes, reservation cleanup lag.
2. Add limit/cursor pagination and server-side filtering/sorting for products/orders/notifications/audits; enforce maximum page size.
3. Add DB indexes matching measured filters; consider PostgreSQL full-text/trigram for product search and normalized category ID.
4. Replace five-second polling with longer adaptive interval/ETag or SSE/WebSocket; batch unread count with notification retrieval where appropriate.
5. Remove view-audit write per listed inventory item or aggregate telemetry separately; add retention/archive for audit and notification data.
6. Configure bounded pg Pool size, connection timeout, statement timeout and graceful shutdown; tune against provider pooler mode.
7. Generate responsive optimized images and lazy load below-fold images; preserve immutable content URLs.
8. Add route-level code splitting and set Vite bundle size budget; inspect dependencies before adding larger libraries.
9. Separate scheduler/cleanup ownership or use a queue/DB advisory lock for multi-instance operation.

## Scaling Strategy

Current deployment is a stateless-ish API with durable state in PostgreSQL/object storage, which can scale horizontally only after startup migrations and scheduled cleanup are made concurrency-safe. Move notifications and reservation cleanup to an outbox/worker, use distributed job coordination, add pagination, and measure DB connections before increasing Render instances. Add caching only for truly public, non-sensitive responses and purge on admin updates. Keep user-specific cart/order/payment responses private and non-cacheable.

Performance acceptance should include representative catalog size, concurrent reservations for last units, order list pagination, image-heavy mobile load, multi-tab notification load, DB failover and API cold-start tests.
