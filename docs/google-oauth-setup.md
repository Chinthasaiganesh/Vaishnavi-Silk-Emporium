# Google Sign-In Setup

Google Sign-In requires credentials in the backend environment. The frontend button checks `/api/auth/oauth/providers` before redirecting to Google.

## Google Cloud Console

Create or select a Google OAuth 2.0 Web application client and add this exact Authorized redirect URI:

```text
https://vaishnavi-silk-emporium.onrender.com/api/auth/oauth/google/callback
```

For local development, also add:

```text
http://localhost:4000/api/auth/oauth/google/callback
```

The URI must match `PUBLIC_API_ORIGIN` exactly. Do not use the frontend URL as the OAuth callback; the backend exchanges the authorization code and creates the session cookie.

## Render

In the `vaishnavi-silk-emporium-api` service, add the values from Google Cloud Console:

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
PUBLIC_API_ORIGIN=https://vaishnavi-silk-emporium.onrender.com
CLIENT_ORIGIN=https://your-vercel-domain.vercel.app
```

Redeploy the backend after saving the variables. Verify the provider is enabled:

```text
GET https://vaishnavi-silk-emporium.onrender.com/api/auth/oauth/providers
```

Expected response:

```json
{"google":true,"github":false}
```

## Local development

Put the same Google client values in `backend/.env` and use:

```text
NODE_ENV=development
PUBLIC_API_ORIGIN=http://localhost:4000
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Run both services:

```text
cd backend && npm start
cd frontend && npm run dev
```

Then open `http://localhost:5173/login` and select **Continue with Google**.

## Troubleshooting

- `Social Sign-In is unavailable`: the frontend cannot reach the backend. Check that the backend is running and that `VITE_API_URL` points to the correct API.
- `Google Sign-In is not configured correctly`: the backend is reachable, but one or both Google variables are missing.
- `redirect_uri_mismatch`: the callback URL in Google Cloud Console does not exactly match `PUBLIC_API_ORIGIN + /api/auth/oauth/google/callback`.
- `authentication_failed`: inspect the backend logs for token exchange, database, cookie, or email errors.

Never commit client secrets. Rotate any credential that has been exposed in source control, logs, screenshots, or chat.
