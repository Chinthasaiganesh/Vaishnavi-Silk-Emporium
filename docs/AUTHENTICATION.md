# Authentication and Authorization

## Identity Model

`Users.Role` has two values: `USER` and `ADMIN`. Public registration and OAuth account creation always assign `USER`; only startup-configured demo accounts and ADMIN-only user-management APIs create administrators. `IsEnabled` is checked during login and refresh. Authorization is role-based, not permission/feature based.

## Registration and Login

Registration at `POST /api/auth/register` validates full/display name, email, mobile number format, strong password and confirmation, hashes with bcryptjs cost 12, creates USER with username equal to email, issues access and refresh tokens, and returns the profile DTO. Email/username uniqueness is enforced; mobile is not unique in the schema despite the duplicate-account error text. Login at `/api/auth/login` accepts username, email, or mobile identifier and password. Login/register share a limiter (20 requests per 15-minute window). Successful login updates `LastLogin`.

OAuth is a browser redirect flow for Google and GitHub. A signed state JWT contains provider and allowed client origin, lasts 10 minutes, and is validated on callback. The backend exchanges authorization code, fetches provider profile/email, links an existing email or creates USER, then issues the normal app session. Provider credentials are optional; UI checks availability first. OAuth does not create ADMINs.

## JWT and Refresh Sessions

```mermaid
sequenceDiagram
  participant Browser
  participant API as Express auth routes
  participant DB as PostgreSQL
  Browser->>API: POST /auth/login or /register
  API->>DB: Find/create user; bcrypt verify/hash
  API->>DB: Insert RefreshSessions UUID + expiry
  API-->>Browser: 15-minute access JWT + HttpOnly refresh_session cookie
  Browser->>API: Protected API with Authorization: Bearer JWT
  API->>API: jwt.verify + route role check
  Browser->>API: POST /auth/refresh when access token expires
  API->>DB: Validate old session; delete it; insert replacement
  API-->>Browser: New access JWT + rotated cookie
  Browser->>API: POST /auth/logout
  API->>DB: Delete persisted session; clear cookie
```

Access JWT is signed with `JWT_SECRET`, includes `userId`, `username`, and `role`, and expires after 15 minutes. Refresh JWT is also signed with that secret, contains session UUID/type/remember-me flag, and expires after seven days. The UUID must also exist in `RefreshSessions` and be unexpired. Refresh deletes the old session and issues a new UUID. Cookie name is `refresh_session`, HttpOnly, path `/api/auth`; production uses Secure and SameSite=None, development SameSite=Lax. `rememberMe` controls cookie max-age; the server-side refresh lifetime remains seven days.

Frontend keeps access token/user in session storage by default; Remember Me uses local storage. The refresh token is not readable by JavaScript. Axios refreshes a protected non-auth 401 once and retries. Startup validates access token (`/auth/me`) then tries refresh. Logout clears frontend storage, calls API to revoke session, and broadcasts logout to other tabs.

## Permissions Matrix

| Capability | Guest | USER | ADMIN |
| --- | --- | --- | --- |
| Browse active products/categories | Yes | Yes | Yes, but public-shell guard redirects admins to portal |
| Product price access | API currently returns prices to all visitors, despite intended guest masking | Yes | Yes |
| Cart/checkout/addresses/customer orders | No | Yes | No (customer-only route middleware) |
| Wishlist/notifications | No | Yes | Authenticated ADMIN technically passes generic auth routes too; UI is customer-focused |
| Admin products/inventory/categories/orders/settings/users | No | No | Yes |
| Register account | Yes; creates USER only | N/A | N/A |
| Storefront customer login | Yes | Yes | Shared `/login`; authenticated admin is redirected to admin dashboard |

Backend authorization is authoritative. `authRequired` accepts a valid Bearer JWT; `optionalAuth` ignores an invalid token and continues as guest. `adminOnly` checks the role claim. Customer-only routers require role USER. Resource queries generally scope by `req.user.userId`. Frontend `ProtectedAdminRoute` waits for startup session restoration then redirects non-admin users to `/`; protected customer routes redirect to `/login`.

## Protected Paths

Backend: `/products/admin*`, `/inventory*`, admin category root/mutations, `/admin/orders*`, `/settings/store`, `/admin/users*` are ADMIN-only. `/cart*`, `/addresses*`, `/checkout*`, `/orders*` are USER-only. `/auth/me`, profile/password, wishlist and notification endpoints require a signed user token except product/category public and translation routes.

Frontend: `/admin/*` requires ADMIN; `/checkout`, `/orders`, `/orders/:id` use a USER route wrapper; wishlist and notifications are guarded inside `CustomerFeaturePage`. `/cart`, `/profile`, account/security pages render public shell and handle identity in page logic. `/login` is shared login/registration entry.

## Session Revocation and Known Gaps

- Logout revokes the current refresh session, not every session for the account.
- Admin disable/password reset deletes that user's refresh sessions. Customer `PUT /auth/password` does not delete refresh sessions.
- Existing access JWTs are stateless; disabling an account does not invalidate already-issued access JWTs until expiry, and `authRequired` does not re-query `IsEnabled`.
- No MFA, email verification, account recovery/reset flow, per-device session management, or audit trail for login attempts is implemented.
- User/account data is returned with profile fields; password hashes are not included in mapped DTOs.
- Cookie refresh is cross-site in production (`SameSite=None`); configure exact CORS origins and consider CSRF defense as part of production hardening.
- Current browser access token is stored in web storage and is accessible to same-origin script; XSS prevention remains important.

For deployment secrets and rotation, see [DEPLOYMENT.md](DEPLOYMENT.md); for a broader threat review, see [SECURITY.md](SECURITY.md).
