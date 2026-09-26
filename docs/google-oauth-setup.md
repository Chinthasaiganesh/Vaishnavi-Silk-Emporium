# Google Sign-In Setup

Google Sign-In requires credentials in the backend environment. The frontend button checks `/api/auth/oauth/providers` before redirecting to Google.

For the complete session and role model, see [AUTHENTICATION.md](AUTHENTICATION.md); for hosted environment and callback deployment steps, see [DEPLOYMENT.md](DEPLOYMENT.md).

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

Run these in separate terminals:

```text
cd backend
npm start
```

```text
cd frontend
npm run dev
```

Then open `http://localhost:5173/login` and select **Continue with Google**.

## Troubleshooting

- `Social Sign-In is unavailable`: the frontend cannot reach the backend. Check that the backend is running and that `VITE_API_URL` points to the correct API.
- `Google Sign-In is not configured correctly`: the provider-status endpoint returned `google:false`; one or both Google credentials are missing, or the running backend has not been redeployed with them.
- `provider_not_configured`: the API OAuth start route received a direct request without both Google credentials configured. The login UI normally stops earlier after `/auth/oauth/providers` reports `google:false`; verify Render variables and redeploy.
- `redirect_uri_mismatch`: the callback URL in Google Cloud Console does not exactly match `PUBLIC_API_ORIGIN + /api/auth/oauth/google/callback`.
- `authentication_failed`: the frontend message is intentionally generic. Find the backend `OAuth callback failed` log by request/time and inspect its `stage` (state validation, provider profile, user persistence, last-login update, session creation, or redirect). The backend requires a provider subject and email; it reports a generic UI error if either provider exchange or persistence fails.

Never commit client secrets. Rotate any credential that has been exposed in source control, logs, screenshots, or chat.
