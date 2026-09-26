# Customer Guide

## Account and Profile

Use `/login` to sign in or register. Registration creates a USER account; login accepts username, email or mobile. Google/GitHub buttons are available only when configured. Profile settings update name, email, mobile, avatar and JSON-backed preferences; security page changes password after current password verification. English/Telugu labels and light/dark theme can be selected, but translation coverage is partial.

Recent views are browser-local. Wishlist, cart, addresses, orders and notifications are server-persisted for signed-in users. Protect shared devices: Remember Me determines whether local access state persists across browser restarts; sign out to revoke refresh session.

## Browse Products

Home shows product rows marked featured. `/products` and `/collections` show the catalog, search by product description/category/fabric/colour/occasion/weave, filter by category, and sort where available. `/categories` lists active categories. Product details include description, images, availability and textile attributes. Inactive items are not publicly visible. Out-of-stock items can remain listed.

Current discrepancy: storefront may show a sign-in prompt for price, but the public product API currently includes price fields for guest requests. Do not consider price hidden from network clients.

## Wishlist and Availability

Sign in to save/remove products in Wishlist. Wishlist is stored on the server. For an active out-of-stock product, choose Notify Me to enable a one-shot back-in-stock notification. When available stock transitions from zero to positive, the app creates an in-app notification. Availability alerts do not guarantee inventory will still be available when you return.

## Cart and Checkout

Cart is tied to your account. Adding a product validates current server availability; quantities and prices recalculate server-side. Checkout requires a saved delivery address. Address may be added/edited/deleted from checkout; an address referenced by an existing order cannot be deleted.

At checkout, the server reserves the selected cart items for five minutes by default. While active, cart changes are locked. The QR amount and item summary come from the reservation snapshot. Canceling the session releases stock. Do not cancel after you have made an external UPI payment; if the timer has expired, contact store support with payment evidence rather than submitting another payment.

Payment is manual UPI. Scan the generated QR using a UPI app, pay the shown amount, then enter the transaction reference/UTR and upload a JPG/PNG/WEBP screenshot (max 5 MB). The app does not independently verify the transfer. Do not share your UPI PIN, OTP, card password, or banking credentials.

## Orders, Cancellation, Refunds

`/orders` lists order and payment state; order detail shows item snapshot and lifecycle events. Payment begins under review and fulfillment begins only after admin verification. If payment proof is rejected and order remains eligible, submit corrected reference and screenshot from the order detail.

Cancellation is available only before shipping (PENDING, PROCESSING, PACKED). Cancellation after submitted payment opens a refund tracking case; a refund can only be processed after payment verification. The software records status and an optional reference; it does not transfer refund money. There is no independent product-return workflow, return label, RMA, or return eligibility engine in the current application. Contact the store for return requests outside the implemented cancellation/refund path.

## Notifications

The header bell and `/notifications` show persisted in-app alerts, latest 50 messages and unread state. Order/payment/refund alerts link to order details; product alerts link to product details; unlinked reservation alerts open notification center. Mark one/all read; only read notifications can be deleted. Optional browser notification/audio requires permission and remains subject to browser settings. Header checks for new notifications about every five seconds while signed in.

## Access and Support

Admin routes are separate from customer workflows. If checkout says stock is temporarily unavailable, another customer may hold the remaining quantity; retry after session release. If proof upload fails, preserve the UTR and do not repeat an external payment until the order/payment state is checked. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for service-side investigation guidance.
