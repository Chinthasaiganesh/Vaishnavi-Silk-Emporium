# Maintenance Guide

This is an operational recommendation set. The repository does not currently define a maintenance calendar, backup schedule, retention policy or on-call runbook; confirm operational owners and provider capabilities before execution.

## Daily

- Check Vercel/Render deployment status and backend `/api/health` from an external monitor.
- Review Render startup/fatal/5xx/503 logs and API durations by request ID; avoid logging/accessing payment proof unless authorized.
- Review payment verification queue, canceled paid orders and refunds awaiting action; communicate externally processed refund references.
- Review low-stock products and stock anomalies; check active reservation age before stock corrections.
- Check S3 upload failures and public object accessibility using non-sensitive product image only.

## Weekly

- Review failed login/rate-limit and OAuth errors, CORS rejects, DB latency/connection pool, storage usage and provider alerts.
- Reconcile `Products.Quantity` mirror with `Inventory.CurrentStock` and validate `AvailableStock+ReservedStock=CurrentStock`.
- Review stale ACTIVE reservations, stuck payment sessions and order/payment/refund state consistency.
- Review audit/notification table growth, product image failures and broken URLs.
- Confirm source-control CI is green and provider deployment matches intended commit.

## Database Maintenance

Runtime DDL happens at startup. Before any schema-affecting deploy:

1. Snapshot/backup the database and verify restore access.
2. Test startup migration against a copy of the current production schema/data.
3. Confirm additive compatibility with currently running application version and rollout order.
4. Deploy and inspect startup migration logs/health before traffic shift.
5. Verify row counts, constraints, stock invariants and critical order history.

No vacuum/analyze schedule is defined in source; use Supabase/provider-managed maintenance where applicable and inspect bloat/query plans via authorized operations. Do not apply `docs/schema.sql` or `docs/supabase-schema.sql` as if either were runtime source.

## Inventory Reconciliation

Read-only invariant query is documented in [INVENTORY_MANAGEMENT.md](INVENTORY_MANAGEMENT.md). For each exception, inspect reservation rows, order transitions and audit logs before changing stock. Inventory is authoritative; adjust through API or reviewed transaction, synchronize Product.Quantity, preserve active reservation floor, and record reason. Never run bulk stock “fix” based only on the legacy Product.Quantity column.

## Logs and Incident Monitoring

Backend logs to stdout/stderr; Render retains logs according to external plan/settings. Vercel Analytics/Speed Insights collect frontend metrics. No external error-tracker or log-retention policy is configured. Restrict log access, establish provider retention/alerts, redact identifiers/PII/payment references, and document incident request IDs, release SHA, environment and time window.

## Storage Cleanup and Orphan Images

There is no orphan-image cleanup job. Product/avatar update/delete attempts object removal; failed deletes are logged/swallowed; DB failure after upload can create orphans. Payment proof objects are stored in a separate key prefix and should have stricter access/retention than public product imagery.

Recommended controlled procedure: export/list object keys, compare product image/avatar/payment proof URLs from DB, produce a candidate report, wait a review period, then delete only confirmed unreferenced objects. Never delete payment proof solely because order appears missing; reconcile payment/order state first. Enable bucket backup/versioning/lifecycle after confirming legal and business retention requirements.

## Notification and Audit Cleanup

No retention/archival task exists. Notifications can grow without bound despite API listing only latest 50. Cart, order, product and inventory audit records also have no purge API. Define retention by legal/operational requirements, archive before deletion, keep evidence for order/payment/refund disputes, and test FK behavior. Fix reservation dedupe/ownership before relying on notification history for incident reconstruction.

## Backup and Recovery

Provider backup/PITR availability is not encoded in the repository. Configure encrypted Supabase backups/PITR and independent copy; separately back up/version object storage and configuration. Test restore on a schedule. Record RPO/RTO explicitly. For recovery steps and caveats, see [DEPLOYMENT.md](DEPLOYMENT.md): restore DB to isolated target, validate schema/orders/inventory, verify objects, cut over carefully, reconcile external UPI movements.

## Disaster Recovery Checklist

- Declare owner/incident scope and stop unsafe writes/payments if necessary.
- Preserve current DB/storage snapshot and logs before repair.
- Select known-good application revision and compatible schema; avoid blind whole-DB restore.
- Restore to isolated DB, validate row counts and stock/order invariants, test API and storage URLs.
- Cut over only after approval; monitor health, errors, reservations and payment/refund states.
- Reconcile transactions processed outside application and communicate customer impact.
- Document timeline, data loss, root cause, and prevention actions.
