# Render presentation deployment

The current full-stack endpoint is https://karya-qtlk.onrender.com/. The Dockerfile builds client and server, copies SQL migrations, and runs with a non-root account.

1. In the existing Render service, deploy the latest commit from `main`. Use Docker, repository root as the root directory, and `/healthz` as the health check path.
2. Keep `NODE_ENV=production`, `DEMO_MODE=true`, and set `DEMO_SEED=true`. Set `SESSION_SECRET` to a generated random value of at least 32 characters. Do not change an existing valid secret unnecessarily.
3. `TRUST_PROXY_HOPS=1` is detected automatically on Render; explicitly setting it is also supported.
4. For private presentation access, optionally set `DEMO_ACCESS_PASSWORD` to a generated value of at least 16 characters. The browser asks for username `presenter` and that password. Supply those credentials to authorized judges if they need browser access. Leave it unset if the evaluation browser cannot authenticate.
5. The same Render origin works without additional CORS configuration. If using a separate frontend, set `ALLOWED_ORIGINS` to its exact HTTPS origin. Broad `*.vercel.app` or `*.onrender.com` trust is deliberately rejected.
6. Confirm `/healthz` returns `{"status":"ok"}`, open `/login`, and sign in as each demo role. The `X-Karya-Revision` response header identifies the Render commit when the platform supplies `RENDER_GIT_COMMIT`.

Render free instances can sleep after inactivity and lose local files on restart/redeploy. The clearly labelled presentation samples are regenerated on a fresh database. This is suitable for a fictional demo, not durable student records. Keep the service awake shortly before presentation by opening it. For durable use, mount a persistent disk for BOTH the SQLite database and attachments; this is not included in the free configuration.

## Optional Vercel frontend

Import the same GitHub repository in Vercel, use the Vite preset, `npm run build:client`, and output `dist/client`. The included `vercel.json` rewrites `/api/*` and `/healthz` to the existing Render service and other paths to the SPA. Add the resulting exact Vercel origin to Render's `ALLOWED_ORIGINS`. All browser API calls stay relative to the frontend origin. Render remains required for SQLite, private file streaming, sessions, and the API.

## Verification

Use Node 26, run `npm ci`, then `npm run check` and `npm audit`. CI independently runs lint, TypeScript, coverage thresholds, accessibility tests, build, repository checks, and Docker build. Do not interpret test coverage as an external evaluator score. No evaluator rating is guaranteed.
