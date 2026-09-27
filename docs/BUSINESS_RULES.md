# Business Rules Handbook

This file states rules implemented in the current code. Where behavior is incomplete or differs from older documentation, the implementation note is explicit.

## Product and Catalog

- A product is visible in public catalog/detail only when `Products.IsActive=1`.
- Categories have their own active flag; public category list includes active categories and counts active products. Product category is a string, not a foreign key.
- Product price must be non-negative; discounted price, when supplied, cannot exceed original price. Effective price is the discounted price only when it is lower than original.
- Product creation inserts inventory using supplied quantity; product edit updates inventory and product fields in one transaction. Product edit requires visibility/featured booleans.
- Admin product CRUD supports up to eight retained/uploaded images. Deletion of product removes images best-effort; order item snapshot remains with ProductId null if deleted.
- Public product DTO currently returns prices for guests despite intended price-protection behavior. This is a discrepancy/security defect, not a rule to rely on.
- Featured selection means `IsFeatured=1` among active catalog rows. Backend public filter does not additionally require positive inventory; older README text saying featured must be in stock was incorrect.

## Inventory

- Source of truth is `Inventory`; `Products.Quantity` mirrors CurrentStock only.
- `AvailableStock + ReservedStock = CurrentStock`; all quantities are non-negative integers.
- Available is the sellable quantity. Zero available with positive reserved is displayed as temporarily unavailable; zero available and zero reserved is out of stock.
- Low stock is available 1–5 inclusive; out-of-stock zero is not returned by low-stock endpoint.
- Admin stock reduction below ReservedStock is rejected. Restock adds to CurrentStock.
- Product missing inventory fails closed as no available stock; reconcile rather than assuming Products.Quantity is correct.
- Reservation decreases AvailableStock and increases ReservedStock; order conversion decreases CurrentStock and ReservedStock; release/expiry decreases ReservedStock and increases AvailableStock.
- Eligible cancellation and reservation-backed payment rejection return ordered quantity to CurrentStock and AvailableStock once. Refund state change does not return stock again.
- Back-in-stock alerts trigger only on AvailableStock zero-to-positive transition for active subscriptions.

## Cart and Checkout

- Cart belongs to a USER; one cart per user and one line per product.
- Add existing product increments quantity. Cart/API prices and totals are recomputed from Products; client-submitted price is not trusted.
- Cart item quantity must be positive and cannot exceed current AvailableStock.
- Cart mutations are rejected with HTTP 409 `ACTIVE_PAYMENT_SESSION` while an active reservation exists.
- Checkout requires a non-empty cart and an address belonging to the requesting user (or default address when omitted).
- Reservation snapshot fixes product name, price, original price and quantity for checkout. Same active session resumes the hold rather than changing items/quantity.
- Reservation defaults to five minutes; config minimum is one minute. Expiry releases reserved stock. Cart lock is tied to active reservation.
- Shipping is currently zero/free. Subtotal is discounted line total; `DiscountAmount` captures savings; grand total equals subtotal.
- A reservation/order retry reuses idempotency key for same intent. New checkout should have a new reservation key.

## Orders and Payment

- Storefront order creation expects `UPI_MANUAL`, reference/UTR, screenshot and active reservation headers. It begins PaymentStatus PENDING and OrderStatus PENDING.
- Payment verification is manual; order proof upload is not evidence of successful settlement.
- Admin must verify payment before fulfillment transitions. VERIFIED on pending order automatically advances to PROCESSING.
- REJECTED requires a reason. For reservation-backed order, rejection cancels and returns stock; proof resubmission route is unavailable once that order is cancelled. Existing rejected non-cancelled order can resubmit proof, resetting status to PENDING.
- Order status transitions are strictly PENDING→PROCESSING→PACKED→SHIPPED→OUT_FOR_DELIVERY→DELIVERED; no skipping/backtracking. Cancellation allowed only from PENDING, PROCESSING, PACKED.
- Customers can cancel only their own order; admins may cancel any order within cancellable states.
- Order number and item prices/name/image are snapshots; product edits do not revise historic order details.

## Refunds

- Cancellation with no submitted payment evidence leaves refund NOT_APPLICABLE.
- Cancellation after payment evidence sets refund PENDING, including while payment awaits verification.
- Refund action is only available after PaymentStatus VERIFIED.
- Allowed refund paths: PENDING→PROCESSING or FAILED; PROCESSING→COMPLETED or FAILED; FAILED→PROCESSING. No transition from COMPLETED.
- COMPLETED sets order status REFUNDED. App records admin status/reference; actual external transfer is not performed or confirmed by software.
- Payment verified after cancellation starts a pending refund case.

## Notifications

- Notifications are durable database inbox items, not websocket events.
- Order/payment/fulfillment/refund changes create in-app notifications; they do not constitute authoritative order state.
- Unread rows can be marked one/all read. Deletion is permitted only once read.
- Back-in-stock subscription is per user/product/type and sends once then deactivates.
- Reservation timer notifications are best-effort process timer events. Current reservation-notification deduplication ignores reservation ID and can suppress a later identical message.

## User and Admin

- Registration/OAuth only creates USER; ADMIN creation/edit/delete requires ADMIN.
- `IsEnabled=0` blocks login and refresh; existing access JWT can remain valid until expiration.
- Product/category/inventory/order/payment/refund/store settings/admin user management require ADMIN.
- A user cannot delete or disable their own ADMIN account through admin user API.
- Addresses are user-owned and cannot be deleted while referenced by an order; deleting a default address selects another if available.
- Preferences are stored as serialized JSON text. UI English/Telugu labels are partial; translation API is currently identity fallback.

## Configuration and External Services

- `DATABASE_URL` required to start.
- Production requires a 32+ character JWT secret and explicit admin/customer demo account credentials.
- `VITE_UPI_ID` required to generate UPI payment QR; it is frontend build-time configuration.
- Product/avatar/payment proof objects require S3-compatible config. Production startup validates the S3 endpoint, region, credentials, public media bucket, and distinct payment-proof bucket; development may omit storage settings until an upload is attempted.
- OAuth only appears usable when provider client ID and secret are configured; no provider credentials are committed.
