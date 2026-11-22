# Security
- Report vulnerabilities privately to the repository maintainer; do not publish exploit details in issues.
- Authentication, session cookies, object-level authorization, CORS, CSP and rate limiting are mandatory before public release.
- Bootstrap repository has no user signup or production session implementation; do not treat `/healthz` success as security acceptance.
- Production secrets must be provided at deployment from Secret Manager, never tracked in Git.
