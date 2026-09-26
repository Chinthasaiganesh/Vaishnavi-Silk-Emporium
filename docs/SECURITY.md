# Security Review

This is a source-based review, not a penetration test. No production environment, cloud policy, traffic capture, or secrets were inspected. Verify provider settings and conduct authorized security testing before production reliance.

## Authentication and Session Security

Implemented: bcryptjs password hashes (cost 12), short-lived 15-minute signed JWTs, persisted/rotated seven-day refresh sessions, HttpOnly refresh cookie, secure cookie in production, role claims, disabled-user checks at login/refresh, OAuth signed state with 10-minute expiry, login/register rate limiter (20 per 15 minutes), logout revocation.

Risks and recommendations:

- Access token and user snapshot live in session/local storage; XSS can exfiltrate them. Keep output escaped, avoid unsafe HTML, add CSP, dependency checks and XSS tests; consider BFF/HttpOnly access session architecture.
- Existing access JWT is not checked against `IsEnabled` after issuance. Recheck enabled status or support revocation/version claims for sensitive actions.
- Customer password change does not revoke refresh sessions; revoke all existing sessions after password update.
- No MFA, email/mobile verification, password reset/recovery or login anomaly controls.
- Refresh cookie is `SameSite=None` in production. CORS exact-origin checks are useful but not a complete CSRF control; add CSRF token/origin checks for cookie-authenticated mutation routes and verify credentialed cross-origin behavior.
- Shared JWT secret signs access, refresh and OAuth state; use managed secret, rotation plan and separate signing keys/purposes where practical.
- Production config requires seeded ADMIN and USER credentials; avoid permanent shared/default demo identities and remove demo customer account if not operationally required.

## Authorization and Access Control

Backend `authRequired` and `adminOnly` protect admin resources; customer routers verify USER; user-owned queries generally scope by authenticated ID. Registration/OAuth assigns USER. Frontend route guards are convenience only; backend checks are authoritative.

Confirmed defect: public product mapper returns price fields even when caller is guest and `canViewPrice=false`. Filter fields from DTO server-side and add tests that assert no price-related properties for guest requests.

Other review items: `/auth/settings`, password, wishlist and notifications accept any authenticated role; decide whether ADMIN access is intended. Order address/user relation is validated in checkout code but not composite DB constraint. Verify no admin endpoint accepts arbitrary user IDs for customer operations. Add authorization matrix tests across guest/USER/ADMIN.

## Input and API Security

- `express-validator` is used for many routes but not consistently. Validate lengths, enums, numeric bounds and content for every mutation; initial `POST /orders` UTR validation is weaker/absent compared with resubmission route.
- Parameterized queries are used through `db.prepare`; `db.js` performs identifier quoting/placeholder normalization. Keep user values in parameters, never interpolate user-controlled SQL identifiers.
- JSON body limited to 1 MB. Add general per-IP/user rate limits and abuse controls for login, registration, uploads, translation and high-cost list calls.
- CORS is configured with exact origins and credentials. Keep production allowlist narrow; `VERCEL_PROJECT_SLUG` preview regex broadens trust to matching preview hostnames.
- Helmet is enabled, but CSP policy is not explicitly defined. Review CSP, HSTS (if TLS termination does not supply), frame/content-type/referrer policies and proxy trust.
- Error messages normalize common DB failures; request logs include URLs, user IDs and some payload/query details. Redact PII and never log credentials/tokens/payment references/screenshots. Confirm request URLs do not carry secrets.

## SQL Injection, XSS, CSRF, Rate Limits

| Risk | Current assessment | Action |
| --- | --- | --- |
| SQL injection | Most data values use parameter placeholders. SQL compatibility adapter regex-quotes known identifiers; bespoke raw SQL remains a review surface. | Keep parameterization, test adapter with edge SQL, avoid dynamic identifiers and add static rules. |
| XSS | React escapes normal text by default; no evidence of `dangerouslySetInnerHTML` in reviewed flows, but full dependency/content review not performed. | Search unsafe HTML sinks, sanitize rich content, CSP and DOM-based XSS tests. |
| CSRF | Most protected API requests use JS Bearer token; refresh relies on cookie and credentials. No CSRF token middleware exists. | Validate Origin/Referer and add CSRF defense for cookie-authenticated mutations; assess OAuth callback separately. |
| Rate limiting | Login/register only (20 requests/15 min). | Apply sensible route-aware limits and storage-backed shared limiter for multiple instances. |
| Authentication bypass | Backend verifies signed JWT, but valid token role is trusted until expiry; disabled status is not checked per request. | Test expired/forged/wrong-role/disabled-token cases and implement revocation policy. |
| Authorization bypass | Role middleware and owner-scoped queries exist; composite ownership constraints are application logic. | Automated negative tests for every admin route and cross-user IDs, including addresses/orders/notifications. |

## File Upload Security

Multer holds files in memory, limits each to 5 MB and allows JPG/PNG/WEBP based on request MIME. Avatar dimensions are decoded and must be >=100x100. Product/payment images are not all decoded/virus-scanned; client MIME can be spoofed. Random UUID object names reduce path traversal, and user paths do not select storage keys.

Recommendations: inspect magic bytes/fully decode, enforce pixel/dimension limits for all image types, malware scan where needed, apply upload rate limits, set private bucket access for payment proofs, use signed read URLs scoped to admin/customer, define retention/erasure, and protect against memory exhaustion. Confirm Supabase public bucket strategy: current service builds public URLs for every folder, potentially exposing payment evidence to anyone with URL. Avoid deleting object until DB update succeeds; schedule orphan reconciliation.

## Secrets and Third Parties

Do not commit `.env`, OAuth secrets, database URLs, S3 credentials or production UPI configuration. Use provider secret stores, least-privilege bucket/database credentials and rotation. `VITE_*` values are public build-time configuration. `DATABASE_URL` required at import. S3 env variables are not startup-validated. OAuth provider API calls use TLS `fetch`; add timeouts/retry limits and provider outage tests. No payment gateway integration exists.

## Data Protection and Logging

Order address, email/mobile, payment reference, screenshots, and profile data are sensitive. Define retention and access policy. Logs may include user ID/request metadata; central error handler attempts to mask `paymentReference` but not all code paths provide uniform redaction. Restrict log access/retention and add structured scrubbing. `Notifications.OrderId` lacks a FK and direct cleanup can orphan logical references.

## Production Security Checklist

- Long random secret, rotated demo credentials, no committed secrets.
- Exact HTTPS CORS origins, secure cookie, OAuth callbacks, HSTS at edge.
- Private handling for payment proof; test anonymous object URL access.
- Fix guest price leak and add role/owner authorization tests.
- Run dependency audit and secret scanner; review lockfiles and image upload dependencies.
- Rate limit APIs; add CSRF/XSS/CSP controls and security headers review.
- Backups encrypted and access-controlled; logs scrubbed and retention configured.
- External error monitoring with redaction and alerting; incident/credential rotation procedure.
