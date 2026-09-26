# Notification System

## Delivery Model

Notifications are persisted in PostgreSQL `Notifications` and queried by authenticated API calls. The browser header polls `GET /api/notifications` every five seconds for USER accounts, updates unread count/recent five items, and may display browser notifications and a sound after permission/user enablement. The notification center loads the latest 50 once on entry. This is polling, not real-time push; no websocket, SSE, email sender, mobile push, or background queue is present.

Fields include `NotificationId`, `UserId`, optional `ProductId`, optional `OrderId`, `Type`, `Title`, `Message`, `IsRead`, `ReadDate`, `CreatedDate`. API enriches rows with product/order names and order/payment/refund statuses. Unread count covers all unread rows, not only the latest 50.

## Types and Generation

| Event type | Generated when | Target/redirect |
| --- | --- | --- |
| `AVAILABILITY_SUBSCRIPTION` | User enables a back-in-stock subscription. | Product if linked; otherwise notification center. |
| `BACK_IN_STOCK` | Available inventory transitions from zero to positive for product with active subscription. One notification per subscription; subscription marked sent/inactive. | Product detail. |
| `RESERVATION_STARTED` | Checkout begins reservation. | No linked order/product, so center. |
| `RESERVATION_EXPIRING` | Reservation cleanup discovers expiry within next two minutes. | Center. |
| `RESERVATION_EXPIRED` | Cleanup releases expired reservation. | Center. |
| `ORDER_PLACED` | Order submission succeeds; possible savings notice also created. | Order detail. |
| `PAYMENT_STATUS` | Proof submitted/resubmitted or admin verifies/rejects. | Order detail. |
| `ORDER_STATUS` | Admin fulfillment state changes (processing through delivery) or cancellation. | Order detail. |
| `REFUND_STATUS` | Refund opened or admin changes status. | Order detail. |

`notification.service.js` owns retrieval, unread counters, mark-read, delete-read and generation helpers. Order notification helper checks user/order/type/title/message before inserting to reduce duplicate delivery; availability subscription uniqueness is user/product/type. Reservation notification helper accepts a reservation ID but does not store it in a dedicated column or include it in the deduplication query. Consequently identical reservation messages can deduplicate across separate sessions for the same user; this is a known limitation.

## Read, Delete, and Redirect Behavior

- `PATCH /notifications/:id/read` marks only caller-owned row read and sets `ReadDate` once. Legacy PUT returns 204.
- `PATCH /notifications/read-all` marks all unread; legacy PUT returns 204.
- A row can only be deleted after it is read. `DELETE /notifications/read` clears all read rows.
- Header bell links to `/orders/:orderId` if linked to an order, else `/products/:productId` when product-linked, else `/notifications`.
- Notification-center action uses same order/product preference; clicking unread content also marks it read.
- Client emits `notifications:received` for newly observed header rows, `notifications:changed` after read/delete actions, and order details refetch when relevant notifications arrive. These events are in-tab only; cross-tab changes are discovered by polling.

## Operational Characteristics and Risks

- Header makes one notifications request every five seconds per open authenticated tab. At scale, lower polling frequency, add conditional requests or server push.
- API list is capped at 50 with no pagination; a very old unread item may affect count but not appear in the list.
- Notification subscriptions are one-shot. They are reactivated only when the user calls subscription endpoint again after a prior alert.
- Reservation expiry notifications depend on the backend timer and are not guaranteed promptly while the service is stopped.
- There is no cleanup/retention job; read rows can accumulate indefinitely.
- Browser push permission and sound are browser/device settings, not guaranteed delivery; in-app row remains canonical.
- Reservation alerts do not have a reservation link/foreign key, and current dedupe is too broad.

## Future Real-Time Design

Keep `Notifications` as durable inbox, and add an outbox or event queue so domain transactions commit before asynchronous delivery. Use SSE/WebSocket for active clients, with polling fallback and reconnect cursor based on notification ID/created timestamp. Add pagination, retention policy, tenant/user scoping, dedupe idempotency key tied to domain event, delivery attempts, provider feedback, and metrics. Email/push providers should receive only minimal notification content and must not leak payment evidence.
