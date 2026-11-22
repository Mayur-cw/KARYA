# Function-first starter — replace with project-specific title

## Problem
Describe the specific challenge and actors from the Blueprint.
## Features
Connect each implemented capability to a requirement identifier.
## Architecture
React/Vite client, Express API, shared zod contracts, repository adapter, Cloud Run.
## Run
Use Node 26. Create a project-resolved lockfile by running `npm install` **once in an online, trusted environment**, then commit the resulting `package-lock.json`. Run `npm ci`, `npm run dev`.
## Test
Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run build` and `bash scripts/check-repo.sh`.
## Security
Default-deny, server ownership checks, secure cookie session (added by T-03), CSP, rate limits and input validation.
## Accessibility
Semantic regions, skip link, visible focus, keyboard-first components and page axe tests.
## Efficiency
Route lazy loading, indexed queries, pagination, gzip and measured route bundles.
## Google services
Cloud Run deployment; Firestore/Secret Manager only with genuine project need and configuration.
## Deployment
Run `scripts/deploy.sh PROJECT_ID REGION SERVICE_NAME` after all gates pass.
## Requirement table
| Requirement | Feature | Code | Test |
|---|---|---|---|
| REQ-BOOT | Health endpoint | src/server/app.ts | tests/integration/health.test.ts |
