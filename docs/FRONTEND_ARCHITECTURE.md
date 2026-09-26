# Frontend Architecture

## Runtime and State

React 18 SPA built by Vite. `main.jsx` mounts `App` under BrowserRouter and providers in this order: AuthProvider, ThemeProvider, LanguageProvider, CartProvider, NotifierProvider. `App.jsx` owns React Router routes, public/admin route guards, title/scroll effects and Vercel Analytics/Speed Insights.

`api.js` creates the shared Axios client, normalizes `VITE_API_URL` to `/api`, enables credentials, injects access JWT, and refreshes/retries one protected 401. Default production API host is `vaishnavi-silk-emporium.onrender.com`.

| State | Owner/persistence |
| --- | --- |
| Authentication | AuthContext. Access JWT/user in sessionStorage by default or localStorage with Remember Me; refresh token HttpOnly cookie. |
| Cart | CartContext backed by API; refreshes while visible and on focus. |
| Theme/language | ThemeContext and LanguageContext; localStorage plus user preferences restoration. Static Telugu dictionary is partial. |
| Dialogs | NotifierContext in-memory queue rendered by NotificationModal. |
| Products/orders/wishlist/addresses/notifications | Page/component state; backend source of truth. |
| Recently viewed | Browser-local `customerData.js`, not server-backed. |
| Checkout | Reservation lives in API; session ID in localStorage; QR snapshot in sessionStorage keyed by reservation ID. |
| Forms/filters/loading | Route component state. No Redux, React Query, or shared query cache. |

## Layouts and Shared Components

- `PublicLayout`: Header, nested route via Outlet, Footer.
- `AdminLayout`: admin header, collapsible/mobile navigation, session warning, logout confirmation and nested route.
- Shared UI: ProductCard, ProductCardActions, ProductMediaCarousel, ProductPrice, RatingBadge, AddToCartButton, CategoryCombobox, Avatar, BrandLoader, PaymentSessionNotice, NotificationModal.
- Shared hooks: `useAuth`, `useCart`, `useTheme`, `useLanguage`, `useNotifier`.
- Helpers: `currency.js`, `image.js`, `notificationPresets.js`, `upi.js`, `customerData.js`.

## Routes

All routes are in `frontend/src/App.jsx`. PublicOnlyRoute redirects authenticated ADMIN users to `/admin/dashboard`; it does not authenticate USER routes globally. Checkout/orders use ProtectedCustomerRoute; some feature/profile pages guard internally.

| Route | Purpose/component tree | Data source and dependencies |
| --- | --- | --- |
| `/` | PublicLayout > HomePage | `GET /products/public?featured=true`; product cards/actions. |
| `/products` | PublicLayout > ProductsPage | Public products with q/category/sort; categories API. |
| `/collections` | Alias to ProductsPage | Same catalog; no distinct collection backend resource. |
| `/categories` | PublicLayout > CategoryPage | `GET /categories/public`. |
| `/products/:id` | PublicLayout > ProductDetailPage | `GET /products/public/:id`; cart, wishlist, availability subscription, images. |
| `/profile` | PublicLayout > ProfilePage | Auth context and notification API; page handles anonymous state. |
| `/settings/account` | PublicLayout > AccountSettingsPage | `PUT /auth/settings`, multipart avatar and preferences. |
| `/settings/security` | PublicLayout > SecurityPage | `PUT /auth/password`; page-level identity handling. |
| `/wishlist` | PublicLayout > CustomerFeaturePage(wishlist) | `GET /wishlists`, `DELETE /wishlists/:productId`; non-USER redirected home. |
| `/cart` | PublicLayout > CartPage | CartContext/API; guest empty state, USER mutations. |
| `/checkout` | Customer guard > CheckoutPage | Summary/address APIs, reserve/poll/release, local QR, multipart order. |
| `/recently-viewed` | CustomerFeaturePage(recentlyViewed) | Browser-local history. |
| `/orders` | Customer guard > OrdersPage | `GET /orders`. |
| `/orders/:id` | Customer guard > OrderDetailPage | `GET /orders/:id`, cancel and payment-proof endpoints. |
| `/notifications` | CustomerFeaturePage(notifications) | Notification list/read/delete API and product/order links. |
| `/about`, `/contact` | Public static pages | Content is not dynamically sourced from StoreSettings. |
| `/privacy`, `/terms` | PlaceholderPage | “Content will be published soon”; no policy content. |
| `/login` | AdminLoginPage | Login/register, OAuth provider status and redirect flow. Shared entry for roles. |
| `/oauth/callback` | OAuthCallbackPage | Restores API-established session. |
| `/admin/login` | Redirect | Redirects to `/login`. |
| `/admin` | Admin guard + AdminLayout | Redirects to dashboard after ADMIN session restoration. |
| `/admin/dashboard` | AdminOverviewPage | Product summary/list APIs. |
| `/admin/products` | AdminDashboardPage | Product CRUD, categories, summary, uploads/inventory sync. |
| `/admin/inventory` | AdminInventoryPage | Inventory list/update APIs. |
| `/admin/orders` | AdminOrdersPage | Admin order list/detail/status/payment/cancel/refund. |
| `/admin/categories` | AdminCategoriesPage | Admin category CRUD. |
| `/admin/reports` | AdminReportsPage | Client-derived from `/products/admin`; no reports API. |
| `/admin/product-audit` | AdminProductAuditPage | Product audit API. |
| `/admin/settings` | AdminSettingsPage | Store settings GET/PUT. |
| `*` | Navigate to `/` | No dedicated not-found page. |

## Data Refresh and Events

Cart refreshes every 30 seconds while visible and on focus. Header notification count polls every five seconds for USER. Home/catalog/product pages refresh about every 15 seconds where configured. Wishlist refreshes every 30 seconds. `notifications:received` and `notifications:changed` are in-tab CustomEvents; OrderDetail refetches relevant order data. These are polling/browser events, not realtime delivery.

## Constraints

- Backend product DTO currently includes price fields for guests even with `canViewPrice=false`; frontend sign-in masking is not data protection. See [SECURITY.md](SECURITY.md).
- Some route guards are page-level rather than centrally consistent.
- Translation API returns source text; Telugu label coverage is partial.
- No frontend unit/component/E2E tests, no accessibility test script, and no route-level code splitting is configured.
