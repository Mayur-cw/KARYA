# KARYA — Institutional workspace

## Problem
Institutional applications often move through scattered instructions, documents, and approvals. KARYA brings those steps into one role-based workspace for administrators, students, and reviewers.

## Features
- Administrators create workflows from text or text-based PDFs, configure application fields and review stages, confirm uncertainties, and publish to selected students.
- Students complete assigned applications, upload supporting documents, save drafts, and respond to requested changes.
- Reviewers inspect assigned submissions and record sequential approvals, rejections, or correction requests.
- Separate dashboards, notifications, searchable workflows, process monitoring, audit events, and CSV exports keep progress visible.
- All 19 routes use a responsive workspace shell, accessible form labels, keyboard focus handling, and shared status styles.

## Architecture
React 19 and Vite serve the client. Express and Zod provide the API. SQLite stores workflow versions, assignments, submissions, notifications, and audit records. Uploaded evidence stays in private local storage. Routes are loaded on demand.

## Run
Use Node 26 (`nvm use` reads `.nvmrc`), then install dependencies with `npm ci`.

```sh
npm run dev
```

Open [the local workspace](http://127.0.0.1:5173). The API runs on port 8080. Five server-allowlisted demo accounts cover administrator, two students, faculty mentor, and final reviewer. No identity-provider password is required in explicit demo mode. Presentation data includes six clearly labelled fictional workflows, valid sample PDFs, drafts, corrections, pending reviews, completed approvals, notifications, and audit events generated through actual domain transitions. Repeated startup preserves edits. Set `DEMO_SEED=false` to opt out.

Demo sign-in is disabled by default. Set environment variables in your shell when running the app; `.env.example` documents supported settings. This project does not automatically load `.env` files. External institutional identity-provider sign-in is not implemented.

```sh
npm run build
SESSION_SECRET="$(openssl rand -hex 32)" DEMO_MODE=true DEMO_SEED=true npm start
```

The production build is served at [localhost:8080](http://localhost:8080). Keep existing `.data/` and `.karya_storage/` directories to preserve local records and evidence.

## Test
```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run build
bash scripts/check-repo.sh
```

Integration tests explicitly enable demo mode and use isolated databases. `npm run test:security` and `npm run test:presentation` verify security boundaries and idempotent sample scenarios. Regression checks cover demo-mode gating, CSRF protection, profile persistence, binary PDF intake, safe sign-in redirects, and paginated collection loading.

## Security
The server enforces roles, department scope, submission ownership, reviewer assignment, optimistic versions, and CSRF checks. Sessions are stored as token digests in SQLite, expire after 24 hours, survive process restarts on persistent storage, and are revoked for inactive accounts. Database failures deny access. Session cookies are HttpOnly and SameSite=Lax, with Secure enabled in production. Demo login accepts only seeded, active accounts and requires `DEMO_MODE=true`. A saved profile is read from the database when authenticating an existing session. Private attachment references are validated against the submission before it can be submitted. Exact origin allowlisting, timing-safe CSRF comparison, bounded body sizes, rate limits, generic errors with request IDs, and append-only audit triggers protect the API. Optional `DEMO_ACCESS_PASSWORD` adds an outer presentation gate (username `presenter`).

## Accessibility
Semantic landmarks, a skip link, visible focus, labelled fields, live status messages, modal focus trapping and restoration, reduced-motion support, and mobile layouts support keyboard and assistive-technology use. Browser checks supplement component tests; jsdom cannot verify rendered color contrast.

## Efficiency
Lazy route loading keeps individual views separate. SQL applies role scope, search, count, and pagination before hydration; list pages are capped at 50 items. Submission attachments are loaded in one batch per page, avoiding per-row database queries. Query indexes cover common department, recipient, submission, and session lookups. Hashed static assets are cached immutably; session/API responses are not cached. Client-side filters load every API page so dashboard counts and search results include the complete scoped collection. Detail tables scroll within their containers on narrow screens.

## Google services
The proposal adapter can use a configured Gemini API key. Without a key, it provides an explicit manual workflow proposal; administrators must verify requirements before publication. No cloud service is required for local development.

## Deployment
The current presentation deploys the full Docker app on Render. See [Render setup](docs/DEPLOYMENT.md). `render.yaml` also describes a free demo service, and `vercel.json` optionally serves the frontend on Vercel with API rewrites to the existing Render host. The app uses SQLite and private local attachment storage; Render free storage is ephemeral, so redeploys reset records and regenerate fictional presentation samples. Use a persistent volume and an institutional identity provider before real institutional use. `scripts/deploy.sh` is an optional Cloud Run alternative, not required for Render.

## Requirement table
| Requirement | Implementation | Verification |
|---|---|---|
| Role separation and session access | Auth context, route guards, server authorization | Auth and UI regression integration tests |
| Workflow creation and publishing | Intake studio, workflow editor, publish gate | T-05, T-06 and page tests |
| Student applications and evidence | Submission workspace, private uploads | T-08, T-10 and page tests |
| Sequential review | Reviewer inbox and workbench | T-09 and page tests |
| Notifications, metrics, audit and reports | Shared notifications and admin views | T-11, T-12 and page tests |
