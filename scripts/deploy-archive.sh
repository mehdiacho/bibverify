#!/usr/bin/env bash
# Build a self-contained production archive and upload it to GCS for a
# Cloud Run "deploy from archive" (no Cloud Build needed).
set -euo pipefail

PROJECT="open-sauce-499812"
REGION="us-central1"
BUCKET="open-sauce-499812-bibverify-deploy"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

echo "==> Building frontend"
npm run build

echo "==> Assembling production bundle"
rm -rf .deploy
mkdir -p .deploy/bundle
cp -r server dist .deploy/bundle/
cat > .deploy/bundle/package.json <<'JSON'
{
  "name": "bibverify",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "scripts": { "start": "node server/index.js" },
  "dependencies": { "express": "^4.21.2" }
}
JSON

( cd .deploy/bundle && npm install --omit=dev --no-package-lock )

echo "==> Creating archive"
( cd .deploy/bundle && tar czf ../bibverify.tar.gz . )

echo "==> Ensuring bucket exists (labelled used-by=cloudrun)"
gcloud storage buckets create "gs://$BUCKET" \
  --project "$PROJECT" --location "$REGION" 2>/dev/null || true
gcloud storage buckets update "gs://$BUCKET" \
  --update-labels=used-by=cloudrun --project "$PROJECT"

echo "==> Uploading archive"
gcloud storage cp .deploy/bibverify.tar.gz "gs://$BUCKET/bibverify.tar.gz" --project "$PROJECT"

echo
echo "Archive ready at gs://$BUCKET/bibverify.tar.gz"
echo "Deploy it from Cloud Run with: base image nodejs24, command 'node server/index.js'."
