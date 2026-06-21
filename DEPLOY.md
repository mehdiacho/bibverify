# Deploying BibVerify (Google Cloud Run)

**Live:** https://bibverify-951543067173.us-central1.run.app

| Setting | Value |
| --- | --- |
| Project | `open-sauce-499812` |
| Region | `us-central1` |
| Service | `bibverify` |
| Access | Public (unauthenticated) |
| Scaling | Scales to zero (pay-per-use; free tier covers light use) |
| Env | `CROSSREF_MAILTO=mehdiacho@gmail.com` (CrossRef "polite pool") |

The app is a single Node service: Express (`server/index.js`) serves the built
Vite frontend from `dist/` **and** the `/api/doi` proxy on one port. Cloud Run
injects `PORT`; the server reads `process.env.PORT`.

---

## Redeploy — option A: `gcloud run deploy` (simplest)

Buildpacks run `npm run build` then start the server. Requires the Cloud Build
and Artifact Registry APIs (gcloud will offer to enable them the first time).

```bash
gcloud run deploy bibverify \
  --source . \
  --project open-sauce-499812 \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars CROSSREF_MAILTO=mehdiacho@gmail.com
```

## Redeploy — option B: prebuilt archive (no Cloud Build)

This is how it was first shipped (via the Cloud Run MCP). It builds locally and
uploads a self-contained `.tar.gz` (with `node_modules`) to GCS, then deploys
from that archive against the `nodejs24` runtime base image.

```bash
./scripts/deploy-archive.sh
```

Then deploy the uploaded archive from Cloud Run, pointing at:
`gs://open-sauce-499812-bibverify-deploy/bibverify.tar.gz`
with start command `node server/index.js`, base image `nodejs24`.

---

## Notes

- The GCS bucket `open-sauce-499812-bibverify-deploy` carries the required
  `used-by=cloudrun` label.
- To take the service offline: `gcloud run services delete bibverify --region us-central1 --project open-sauce-499812`.
- Custom domain: map it under Cloud Run → Manage Custom Domains, or front it with
  a load balancer.
