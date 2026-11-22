# Security
- Report vulnerabilities privately to the repository maintainer; do not publish exploit details in issues.
- Authentication, session cookies, object-level authorization, CORS, CSP and rate limiting are mandatory before public release.
- Bootstrap repository has no user signup or production session implementation; do not treat `/healthz` success as security acceptance.
- Production secrets must be provided at deployment from Secret Manager, never tracked in Git.


## Runtime boundaries

SQLite sessions use hashed bearer tokens, expire after 24 hours, and are revoked for inactive users. Authentication fails closed on storage errors. Session cookies are HttpOnly, SameSite=Lax, and Secure in production. Mutations require CSRF, role, ownership, stage and version checks. Exact CORS allowlisting avoids trusting unrelated cloud tenants. API responses are no-store and errors are redacted. Audit records are append-only at the SQLite boundary.

`DEMO_MODE=true` deliberately enables allowlisted fictional demo identities. This is not institutional identity verification. Restrict a private presentation with `DEMO_ACCESS_PASSWORD`; disable demo identities and integrate an identity provider before processing real student records. A free Render instance has ephemeral storage. Database and evidence must both use durable storage for real use.
