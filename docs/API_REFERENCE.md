# API Reference

Base path: `/api`; there is no version prefix. JSON calls use `Content-Type: application/json`; product/avatar/order proof uploads use `multipart/form-data`. Authenticated calls use `Authorization: Bearer <15-minute-access-token>`. Refresh uses the HttpOnly `refresh_session` cookie. CORS supports credentials and responses expose `x-request-id`.

Response casing is inconsistent: product/cart/auth DTOs are mostly camelCase, while order/address/inventory rows include database-style PascalCase fields. Validation errors generally return HTTP 400 with `{success:false,message,errors:[{field,message}]}`. Common statuses: 400 invalid input/business rule, 401 missing/invalid auth, 403 denied role/disabled user, 404 missing or owner-inaccessible row, 409 state/stock conflict, 500 unexpected/database error, 503 health DB failure.

## System and Authentication

| Method and route | Auth | Request and validation | Success / notable failure |
| --- | --- | --- | --- |
| `GET /health` | None | None | `200 {status:"ok",database:"postgresql",version,inventory,environment,timestamp}`; `503` if database unavailable. |
| `GET /auth/oauth/providers` | None | None | `{google:boolean,github:boolean}` from configured credentials. |
| `GET /auth/oauth/:provider` | None | Provider `google` or `github`; optional `clientOrigin` must be allowed. | Redirect to OAuth provider; unavailable provider redirects to login error. |
| `GET /auth/oauth/:provider/callback` | OAuth state/code | Signed state expires after 10 minutes. | Sets refresh cookie and redirects to `/oauth/callback`; failure redirects to login. |
| `POST /auth/register` | None; rate-limited 20/15 min | `{fullName,displayName,email,mobileNumber,password,confirmPassword}`. Names 2–80 and 2–40; email valid; mobile 7–15 digits; password 8+ with upper/lower/number/symbol; confirmation exact. | `201 {token,user}` and refresh cookie; duplicate email/username 409. Always USER; username is email. Mobile is not DB-unique despite the error wording. |
| `POST /auth/login` | None; rate-limited 20/15 min | `{identifier,password,rememberMe?}`; identifier >=3 chars, password >=8; matches username/email/mobile. | `{token,user}` and cookie; invalid 401, disabled 403. |
| `POST /auth/refresh` | Refresh cookie | Valid signed refresh token and persisted non-expired `RefreshSessions` row. | `{token,user}` and rotated cookie; invalid/expired 401. |
| `POST /auth/logout` | None | Optional refresh cookie. | `204`; revokes session if valid and clears cookie. |
| `GET /auth/me` | Any bearer-authenticated user | None | `{user}`; 404 if user row disappeared. |
| `PUT /auth/settings` | Any authenticated user | Multipart/form fields `fullName`, `displayName`, `email` required; optional `mobileNumber`, `preferences` JSON string, `removeAvatar`, `avatar`. Avatar min 100x100. | `{user}`; 400 validation, 404 missing user, 409 duplicate email. |
| `PUT /auth/password` | Any authenticated user | `{currentPassword,newPassword,confirmPassword}`; current >=8, new 10–128, confirmation exact. | `{message}`; current-password mismatch 400. |

Example login:

```http
POST /api/auth/login
Content-Type: application/json

{"identifier":"customer","password":"<configured-password>","rememberMe":true}
```

## Products, Categories, Inventory

| Method and route | Auth | Request and validation | Success / notable failure |
| --- | --- | --- | --- |
| `GET /products/public` | Optional bearer | Query `q?`, `category?`, `featured?` boolean, `sort?` = `price_asc|price_desc|alpha_asc`. | `{products:[...]}` active rows only. **Guest response currently contains numeric `price`, `originalPrice`, `discountedPrice` despite `canViewPrice:false`; API price privacy is broken.** |
| `GET /products/public/:id` | Optional bearer | Positive integer ID. | `{product}` active only; 404 otherwise; same price exposure. |
| `GET /products/admin` | ADMIN | None | `{products:[...]}`, includes inactive items and inventory. |
| `GET /products/admin/summary` | ADMIN | None | `{totalProducts,activeProducts,lowStockProducts}`; low is 1–5 available units. |
| `GET /products/admin/audit` | ADMIN | None | `{audits:[...]}`. |
| `POST /products/admin` | ADMIN | Multipart required `productName` (2+), `description` (10+), `category` (2+), `price>=0`, `quantity>=0` integer; optional `discountedPrice<=price`, `isActive`, `isFeatured`, textile fields, rating 0–5, `image`, `images`. Multer permits one `image` plus eight `images`; handler does not enforce a combined eight-image cap. | `201 {product}`; discount errors 400; initial Inventory inserted transactionally. |
| `PUT /products/admin/:id` | ADMIN | Positive ID; same core fields, required boolean `isActive`/`isFeatured`; optional existing image list/new image(s). | `{product}`; 400 invalid values, 404 missing, 409 stock reduction below reservation. Inventory and `Products.Quantity` mirror update together. |
| `DELETE /products/admin/:id` | ADMIN | Positive ID | `204`; 404 missing; deletes product after attempting image removal. |
| `GET /categories/public` | None | None | `{categories:[category DTO]}` active only with active product count. |
| `GET /categories` | ADMIN | None | Same DTO, includes inactive rows. |
| `POST /categories` | ADMIN | `{categoryName}` 2–80; optional description <=300, `isActive` boolean. | `201 {category}`; duplicate 409. |
| `PUT /categories/:id` | ADMIN | Positive ID; name 2–80; optional description; required `isActive`. | `{category}`; rename updates product category strings. Missing 404. |
| `DELETE /categories/:id` | ADMIN | Positive ID | `204`; missing 404. Product category is a string, so deleting can leave products without a category row. |
| `GET /inventory` | ADMIN | None | `{products:[inventory DTO]}`; each row logs VIEWED audit. |
| `GET /inventory/low-stock` | ADMIN | None | `{inventory:[...]}` for available 1–5; zero excluded. |
| `GET /inventory/:id` | ADMIN | Positive product ID | `{inventory}`; 404 missing. |
| `PUT /inventory/:id` | ADMIN | `{stock}` non-negative integer; path ID is ProductId. | `{success,message,inventory}`; below active reservations 409. |
| `POST /inventory/update-stock` | ADMIN | Legacy `{productId,stock}` | Same inventory response. |
| `POST /inventory/restock` | ADMIN | `{productId,quantity}`; positive integer. | Adds quantity to current stock. |

Product DTO inventory values are `quantity`/`availableQuantity`, `currentStock`, `reservedQuantity`, `temporarilyReserved`, and a display availability status. Stock conflict errors include `availableStock`, `reservedStock`, and `currentStock` so clients can reconcile stale product controls. Product edit enforces at most eight merged images, unlike create. Guest requests currently receive price values; do not treat a frontend sign-in prompt as data protection.

## Cart, Addresses, Checkout

| Method and route | Auth | Request and validation | Success / notable failure |
| --- | --- | --- | --- |
| `GET /cart` | USER | None | `{cartId,items,totals,activePaymentSession}`; creates a cart if absent. |
| `POST /cart/items` | USER | `{productId,quantity}` positive integers; existing product quantity is incremented. | `201` refreshed cart; 404 unavailable; 409 insufficient stock or `ACTIVE_PAYMENT_SESSION`. |
| `PUT /cart/items/:id` | USER | Positive cart-item ID, `{quantity}` positive integer. | Refreshed cart; 404 item, 409 stock/session lock. |
| `DELETE /cart/items/:id` | USER | Positive cart-item ID | Refreshed cart; 404 item, 409 session lock. |
| `DELETE /cart` | USER | None | Refreshed empty cart; 409 session lock. |
| `GET /addresses` | USER | None | `{addresses:[...]}` caller-owned. |
| `GET /addresses/default` | USER | None | `{address}` or 404. |
| `POST /addresses` | USER | Required name/mobile/address line 1/city/state/postal code; optional line 2/country/default. | `201 {success,address}`; first address becomes default. |
| `PUT /addresses/:id` | USER | Positive ID and address fields as above. | `{success,address}`; 404 missing/not owned. |
| `DELETE /addresses/:id` | USER | Positive ID | `{success,message}`; 409 if referenced by an order; default reassigned where possible. |
| `GET /checkout/summary` | USER | None | Cart items and originalSubtotal, subtotal, zero shipping, discount, grandTotal. |
| `POST /checkout/validate` | USER | Optional `{addressId}` positive integer. | `{success:true,valid,addressId,items,...totals}`; 400 empty cart/stock, 404 address/product. |
| `POST /checkout/reserve` | USER | Optional `addressId`; required `sessionId` length 10–100. | `201 {success,reservation,reservationMinutes}`. Snapshot/stock hold; active same-session call resumes current hold. |
| `GET /checkout/reservations/:id` | USER | Reservation ID (no express-validator UUID rule). | `{reservation,reservationMinutes}` or 404; triggers expiry processing. |
| `POST /checkout/reservations/:id/release` | USER | Caller-owned reservation ID. | `{success,reservation}` or 404. |

Cart and checkout calculations are server-owned. Reservation item prices/quantities are snapshotted; active reservation blocks cart mutations. Conflict response includes `code:"ACTIVE_PAYMENT_SESSION"` and `activePaymentSession`.

## Orders and Admin

| Method and route | Auth | Request and validation | Success / notable failure |
| --- | --- | --- | --- |
| `GET /orders` | USER | None | `{orders:[caller-owned orders]}`. |
| `GET /orders/:id` | USER | Positive order ID | `{order}` with items/address/history/lifecycle; payment proof URL/key are omitted; 404 if not owned. |
| `POST /orders` | USER | Multipart `addressId`, `paymentMethod=UPI_MANUAL`, `paymentReference`, `paymentScreenshot`; `Idempotency-Key` and `Checkout-Reservation-Id` headers. | `201 {success,message,order}`; snapshots delivery mobile and stores only private `PaymentScreenshotKey`. Customer response omits proof URL/key. Missing idempotency 400, missing proof 400, missing reservation 409, expired/inconsistent stock 409. Idempotent per user/key. |
| `POST /orders/:id/payment-proof` | USER | Multipart `paymentReference` matching 6–64 allowed chars plus `paymentScreenshot`. | `{success,message,order}` only for REJECTED, not-cancelled order; otherwise 409. |
| `POST /orders/:id/cancel` | USER | `{reason}` 3–300 chars. | `{success,message,refundMessage,order}`; only PENDING/PROCESSING/PACKED; 404 not-owned, 409 disallowed/already canceled. |
| `GET /admin/orders` | ADMIN | `q?`, `status?` valid order status. | `{orders,statuses}`; implementation loads/filter orders in process memory. |
| `GET /admin/orders/:id` | ADMIN | Positive ID | `{order,statuses,allowedTransitions}`; 404 missing. |
| `PATCH /admin/orders/:id/status` | ADMIN | `{status}` in PENDING, PROCESSING, PACKED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, REFUNDED. | `{success,message,order,allowedTransitions}`; 409 invalid transition or payment not verified. |
| `PATCH /admin/orders/:id/payment` | ADMIN | `{paymentStatus:"VERIFIED"|"REJECTED",rejectionReason?}`; rejection reason 3–500 and required on reject. | `{success,message,order}`; 409 reviewed/missing. Verification may progress fulfillment; rejection on reservation-backed order cancels/releases stock. |
| `POST /admin/orders/:id/cancel` | ADMIN | `{reason}` 3–300 chars. | `{success,message,order,allowedTransitions:[]}`; same cancellable states and refund case rules. |
| `PATCH /admin/orders/:id/refund` | ADMIN | `{refundStatus:"PROCESSING"|"COMPLETED"|"FAILED",refundReference?}`; reference <=120. | `{success,message,order,allowedTransitions}`; only verified payment and allowed refund state, else 409. |

ADMIN order detail and mutation responses include `PaymentScreenshotUrl` only as a five-minute signed URL when a private key exists. Admin order-list responses omit screenshot URLs and keys. Legacy rows without a private key report `paymentProofMigrationPending:true` and return no URL.

Example proof submission:

```bash
curl -X POST "$API/api/orders" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: $RESERVATION_UUID" \
  -H "Checkout-Reservation-Id: $RESERVATION_UUID" \
  -F "addressId=12" -F "paymentMethod=UPI_MANUAL" \
  -F "paymentReference=123456789012" \
  -F "paymentScreenshot=@proof.png"
```

## Wishlist, Notifications, Translation, Settings, Admin Users

| Method and route | Auth | Request | Success / notable failure |
| --- | --- | --- | --- |
| `GET /wishlists` | Authenticated | None | `{products:[saved products + availability]}` for caller. |
| `GET /wishlists/:productId` | Authenticated | Positive ID | `{saved:boolean}`. |
| `POST /wishlists/:productId` | Authenticated | Active product ID | `201 {saved:true,message}`; duplicate 409, inactive/missing 404. |
| `DELETE /wishlists/:productId` | Authenticated | Positive ID | `{saved:false,message}`; absent removal is idempotent. |
| `POST /notifications/subscriptions/:productId` | Authenticated | Active, currently unavailable product | `201 {message,unreadCount}`; available 400, duplicate active subscription 409, missing/inactive 404. |
| `GET /notifications/subscriptions/:productId` | Authenticated | Positive ID | `{subscribed:boolean}`. |
| `GET /notifications` | Authenticated | None | `{notifications:[latest 50 + linked state],unreadCount}`. |
| `PATCH /notifications/:notificationId/read` | Authenticated | Positive ID | `{success,unreadCount}`; 404 not owned/found. |
| `PUT /notifications/:notificationId/read` | Authenticated, legacy | Positive ID | `204`; 404 not owned/found. |
| `PATCH /notifications/read-all` | Authenticated | None | `{success,updated,unreadCount}`. |
| `PUT /notifications/read-all` | Authenticated, legacy | None | `204`. |
| `DELETE /notifications/:notificationId` | Authenticated | Positive ID; must already be read. | `{success,unreadCount}`; unread 409, missing 404. |
| `DELETE /notifications/read` | Authenticated | None | `{success,deleted,unreadCount}`. |
| `POST /translations` | None | `{text}` 1–5000 chars, `targetLanguage` `en` or `te`. | `{text,cached,provider}`; actual output currently source text. |
| `GET /settings/store` | ADMIN | None | `{settings}`. |
| `PUT /settings/store` | ADMIN | Store name 2–120, tagline <=180, valid email, phone 7–30, address 3–300, business description <=1000. | `{settings,message}` singleton upsert. |
| `GET /admin/users` | ADMIN | None | `{users:[ADMIN accounts only]}`. |
| `POST /admin/users` | ADMIN | username 3–80; full/display names; valid email; strong password 10+; optional mobile. | `201 {user}`; duplicate username/email 409. Creates ADMIN only. Mobile is not unique in the schema. |
| `PUT /admin/users/:id` | ADMIN | Positive ID; names/email/isEnabled required; mobile/newPassword optional. | `{user}`; self-disable 400; disabling or resetting password revokes refresh sessions; missing 404, duplicate 409. |
| `DELETE /admin/users/:id` | ADMIN | Positive ID; cannot delete self. | `204`; deletes ADMIN only; missing 404. |

## Not Implemented

There is no standalone `/users`, `/collections`, `/search`, `/reports`, or `/profile` API. Collections are catalog/category views; reports are computed in the frontend; profile uses `/auth/me` and `/auth/settings`. No Razorpay endpoint/payment callback exists. There is no pagination contract. Reconcile this reference with route files when APIs change; the Postman collection is separately maintained.
