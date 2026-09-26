# Data Flow Diagrams

## Product Creation and Images

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Admin product form
  participant API as Express /products/admin
  participant S3 as S3-compatible storage
  participant DB as PostgreSQL
  Admin->>UI: Enter product/price/stock and choose images
  UI->>API: multipart POST (Bearer ADMIN)
  API->>API: Validate fields and image limits
  API->>S3: Upload image buffers using random keys
  API->>DB: Transaction: insert Product + Inventory
  API->>DB: Product audit
  API-->>UI: Product DTO + availability/images
```

If the database transaction fails after successful image upload, the create route does not consistently compensate/delete those uploaded objects; identify potential orphan keys during recovery.

## Catalog and Stock Read

```mermaid
flowchart LR
  Admin[Admin updates stock] --> InvTx[Inventory transaction]
  InvTx --> Inv[(Inventory)]
  InvTx --> Mirror[Products.Quantity mirror]
  InvTx --> Audit[Inventory/Product audit logs]
  Inv --> API[Public product/cart/checkout API]
  API --> UI[Frontend component]
  UI --> Availability[In Stock / Temporarily Unavailable / Out of Stock]
```

## Cart to Order and Payment

```mermaid
sequenceDiagram
  actor Customer
  participant UI
  participant API
  participant DB
  participant UPI as External UPI app
  participant Admin
  Customer->>UI: Add products, choose address
  UI->>API: Cart reads/mutations
  API->>DB: Verify active product and AvailableStock
  Customer->>UI: Begin checkout
  UI->>API: POST /checkout/reserve
  API->>DB: Lock cart; Available -= qty; Reserved += qty; snapshot
  API-->>UI: Reservation + expiry + locked prices
  UI->>UPI: Locally rendered QR URI (customer scans/pays)
  Customer->>UI: Enter UTR and select screenshot
  UI->>API: POST /orders with idempotency/reservation headers
  API->>DB: Atomic order creation; Current -= qty; Reserved -= qty; clear cart
  Admin->>API: Review payment status
  API->>DB: Persist verified/rejected state, timeline and notification
```

## Reservation Release / Expiration

```mermaid
flowchart TD
  Start[Active hold expires or user cancels] --> Lock[Lock reservation row]
  Lock --> Lines[Read reservation snapshot]
  Lines --> Restore[Available += qty; Reserved -= qty; Current unchanged]
  Restore --> State[Mark EXPIRED or RELEASED]
  State --> Notify[Optional persisted notification]
  Start2[Order conversion] --> Consume[Current -= qty; Reserved -= qty; Available unchanged]
  Consume --> Converted[Mark CONVERTED_TO_ORDER]
```

## Notifications

```mermaid
flowchart LR
  Event[Order/payment/refund/stock event] --> Service[notification.service.js]
  Service --> DB[(Notifications table)]
  DB --> Poll[Header polls every 5 seconds]
  DB --> Center[Notification center fetches latest 50]
  Poll --> Bell[Unread count / browser notification]
  Center --> Read[Mark read or delete read item]
  Read --> Changed[notifications:changed browser event]
  Changed --> Refetch[Header/order detail refresh]
  Center -->|orderId| OrderPage[/orders/:id]
  Center -->|productId| ProductPage[/products/:id]
```

## Authentication

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant DB
  Browser->>API: Login or OAuth callback
  API->>DB: Verify/link user and create refresh session
  API-->>Browser: Short-lived JWT + HttpOnly refresh cookie
  Browser->>API: Bearer-protected resource call
  API->>DB: Execute owner-scoped request
  API-->>Browser: JSON response
  Browser->>API: Refresh with cookie on expired access token
  API->>DB: Revoke old session and rotate session row
  API-->>Browser: New JWT + cookie
```

## Data Ownership Summary

Product details/images reside in Products plus external object storage. Inventory resides in Inventory. Current cart resides in Carts/CartItems. Checkout snapshot and active holds reside in CheckoutReservations/Items. Purchase truth and historical line details reside in Orders/OrderItems. Notification message/read state resides in Notifications; browser poll state is transient. See [ENTITY_RELATIONSHIPS.md](ENTITY_RELATIONSHIPS.md) and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).
