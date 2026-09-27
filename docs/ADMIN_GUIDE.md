# Admin Guide
## Access

Use the shared `/login` page with an ADMIN account. `/admin/*` frontend routes wait for session restoration and reject non-admin roles; backend admin APIs also require bearer JWT plus `ADMIN`. Customer accounts cannot elevate themselves through registration/OAuth. Production credentials are supplied through configured backend environment variables and must be rotated from examples.

## Dashboard

`/admin/dashboard` loads `/products/admin/summary` and `/products/admin` to present catalog and stock-derived totals. It is not a sales/revenue dashboard and no reports service exists. `/admin/reports` computes its view client-side from product data. Use order APIs for actual order/payment state.

## Products and Images

`/admin/products` (component `AdminDashboardPage`) supports list/create/edit/delete, active visibility, featured flag, category assignment, price/discount, textile attributes, rating and image upload. The UI is designed for up to eight retained images. Backend edit enforces eight merged images; create's per-field Multer caps permit one `image` plus eight `images` without a combined cap. Creation initializes Inventory from entered quantity. Edit updates product and stock transactionally. Product images are uploaded to configured S3-compatible object storage; replacing/removing images attempts old object deletion. Validate final image count and render before saving.

Rules:

- Original price >=0; discounted price is optional and cannot exceed original.
- Active flag controls customer catalog visibility. Featured flag is an additional catalog filter, not an in-stock guarantee.
- Product category is a string; changing a category name updates matching products. Deleting a category does not delete/reassign products.
- Product delete is destructive for current catalog/inventory links; historical order lines preserve snapshots but lose ProductId reference. Product images are deleted best-effort.
- Public product DTO currently exposes price fields to guests; do not treat guest UI masking as a privacy boundary.

Audit: `/admin/product-audit` calls `/products/admin/audit`. Audit JSON snapshots are serialized in ProductAuditLog. The backend also provides view/update audit for inventory.

## Inventory

`/admin/inventory` lists stock and supports absolute stock updates via `PUT /api/inventory/:productId`. API provides low-stock list and restock additive endpoint, though the visible page currently uses list + absolute update. `CurrentStock` is total physical on-hand, `ReservedStock` held in active payment sessions, and `AvailableStock=CurrentStock-ReservedStock` is sellable. `Products.Quantity` is a mirror.

Do not reduce stock below active reservations. For discrepancy, inspect Inventory, active CheckoutReservations/items and audit before applying a correction. Each inventory list logs VIEWED events for all returned rows; repeated visits add audit volume. Back-in-stock notifications fire only on available 0→positive.

## Orders and Payments
Proof screenshot links are generated as five-minute signed URLs for ADMIN order detail/actions only. Admin list results do not contain proof links or object keys. If the order shows `paymentProofMigrationPending`, complete the legacy proof migration; do not request or share the old public URL.

`/admin/orders` supports search/status filter, order inspection, payment review, fulfillment status, cancellation, and refund-state recording. Review uploaded proof and UTR before setting VERIFIED. Reject with an actionable reason; reservation-backed rejection cancels order/restores stock and cannot be resubmitted on that canceled order. Payment approval advances a pending order to PROCESSING; later fulfillment stages must follow the allowed linear transition.

Cancellation only from PENDING/PROCESSING/PACKED. If payment evidence exists, refund starts PENDING; action becomes possible only after payment is verified. Record external money movement via refund status and reference. This admin panel records/communicates refund state; it does not initiate bank/UPI refund.

## Categories

`/admin/categories` lists all categories, product counts, add/edit/activate/deactivate/delete. Public list includes active categories. Deactivate to hide category filter entry without deleting the row. Rename propagates string category values to Products. Delete only when the catalog has been cleaned up or re-categorized; the API does not block dangling product category text.

## Store Settings

`/admin/settings` edits singleton StoreSettings fields: store name, tagline, email, phone, address and business description. Current About/Contact page content is static frontend text; changing the setting row does not necessarily update those pages.

## Admin User Management and Notifications

Backend has ADMIN-only `/api/admin/users` list/create/update/delete endpoints. Create another admin, update identity/enabled state/password, or delete another admin. You cannot disable/delete your own account. These APIs revoke refresh sessions on disable/password reset, but there is no dedicated admin-user management route/page in `App.jsx`.

Notification routes are authenticated generically and can technically be called by an ADMIN token, but the application UI has no admin notification center. Domain-generated customer notifications are created from order/payment/inventory events; no admin notification management module is exposed.

## Safe Operating Checklist

- Confirm target environment and API health before any mutation.
- Check active reservation holds before stock correction.
- Review order payment status before fulfillment/refund actions.
- Use reason fields for rejection/cancellation and preserve customer communications.
- Verify images after uploads; object deletion is best-effort.
- Keep database and storage backup/change records before destructive product/user operations.
- Never put customer payment screenshots or UTR values into tickets/logs outside approved systems.
