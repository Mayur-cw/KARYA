#!/bin/sh
set -eu
if [ "$#" -ne 3 ]; then echo "Usage: scripts/deploy.sh PROJECT REGION SERVICE" >&2; exit 2; fi
project=$1; region=$2; service=$3
command -v gcloud >/dev/null || { echo 'BLOCKED: gcloud missing' >&2; exit 1; }
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep . >/dev/null || { echo 'BLOCKED: no active gcloud identity' >&2; exit 1; }
[ -n "$project" ] && [ -n "$region" ] && [ -n "$service" ] || exit 1
npm run check
# Configure Secret Manager secret names in the deployment manifest; never print secret values.
url=$(gcloud run deploy "$service" --source . --project "$project" --region "$region" --allow-unauthenticated --format='value(status.url)')
[ -n "$url" ] || { echo 'FAIL: missing deployed URL' >&2; exit 1; }
curl --fail --silent --show-error "$url/healthz" >/dev/null
printf 'DEPLOYED URL: %s
' "$url"
