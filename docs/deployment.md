# Deployment Guide

## Architecture

```mermaid
flowchart LR
  Browser -->|HTTPS| Vercel[React frontend on Vercel]
  Vercel -->|HTTPS REST API| Render[Express API on Render]
  Render -->|TLS| Supabase[(Supabase PostgreSQL)]
```

## 1. Supabase Database

1. Create a Supabase project and copy the **transaction pooler** connection string.
2. Set `DATABASE_URL` in Render to that connection string. Do not commit it.
3. Apply `docs/supabase-schema.sql` in the Supabase SQL editor.
4. Keep Row Level Security enabled for direct client access; this application accesses the database only through Render.

### Migration Gate

The currently implemented backend uses Node's synchronous `node:sqlite` driver and `?` SQLite query placeholders. It cannot connect to PostgreSQL merely by setting `DATABASE_URL`. Before production Supabase cutover, migrate `backend/src/db.js` and all route queries to an async PostgreSQL adapter such as `pg`, use `$1` placeholders, and run integration tests. Until that migration is complete, deploy the existing backend with a persistent SQLite disk or complete the adapter work first.

## 2. Render Backend

1. Push `main` to GitHub and create a **Web Service** from the repository, or use the included `render.yaml` Blueprint.
2. Set root directory to `backend`, build command `npm ci`, and start command `npm start`.
3. Configure secrets:

```dotenv
NODE_ENV=production
CLIENT_ORIGIN=https://your-vercel-project.vercel.app
VERCEL_PROJECT_SLUG=your-vercel-project
PUBLIC_API_ORIGIN=https://your-render-service.onrender.com
JWT_SECRET=<at-least-32-random-characters>
DATABASE_URL=<supabase-connection-string-after-postgres-migration>
GOOGLE_CLIENT_ID=<optional>
GOOGLE_CLIENT_SECRET=<optional>
GITHUB_CLIENT_ID=<optional>
GITHUB_CLIENT_SECRET=<optional>
```

4. Verify `GET /api/health` returns `200` and configure this route as Render's health check.
5. For OAuth, add these Render callbacks to Google/GitHub provider settings:

```text
https://your-render-service.onrender.com/api/auth/oauth/google/callback
https://your-render-service.onrender.com/api/auth/oauth/github/callback
```

## 3. Vercel Frontend

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `frontend` and framework to Vite.
3. Add:

```dotenv
VITE_API_URL=https://your-render-service.onrender.com/api
```

4. Deploy. The included `frontend/vercel.json` preserves React Router deep links.
5. Update Render `CLIENT_ORIGIN` with the deployed Vercel domain, then redeploy Render.

### CORS Validation

`CLIENT_ORIGIN` accepts comma-separated exact origins. `VERCEL_PROJECT_SLUG` additionally permits matching Vercel preview deployments such as `https://your-vercel-project-git-main-account.vercel.app`. Local `localhost` and `127.0.0.1` development origins are accepted automatically. Render handles `OPTIONS` preflight with credentials, `Authorization`, and `Content-Type` support.

## Production Checklist

- [ ] HTTPS URLs configured in `CLIENT_ORIGIN`, `PUBLIC_API_ORIGIN`, and `VITE_API_URL`
- [ ] Long random `JWT_SECRET`; no `.env` file committed
- [ ] OAuth redirect URIs updated to production HTTPS URLs
- [ ] Render health check is green at `/api/health`
- [ ] Supabase adapter migration and integration tests complete before `DATABASE_URL` cutover
- [ ] Upload storage migrated from local Render disk to object storage (Supabase Storage/S3) for durable product and avatar images
- [ ] Postman Development/UAT/Production environments updated with deployed API URLs
- [ ] GitHub Actions build workflow passes on `main`