# GatePass — Google Cloud (Cloud Build → Artifact Registry → Cloud Run)

Two independent Cloud Run services:

| Service        | Source config              | Public? | Port | Notes |
|----------------|----------------------------|---------|------|-------|
| `gatepass-api` | `cloudbuild.backend.yaml`  | yes     | 8080 | reads `process.env.PORT`; secrets from Secret Manager |
| `gatepass-web` | `cloudbuild.frontend.yaml` | yes     | 8080 | nginx serves the Vite bundle; `VITE_API_URL` baked at build time |

Nothing is hardcoded — every environment value is a Cloud Build substitution.

---

## 0. One-time project setup

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1
export REPO=gatepass

gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 1. Create the Artifact Registry (Docker) repository

```bash
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="GatePass container images"
```

## 2. Create the backend secrets (Secret Manager)

```bash
printf '%s' 'mongodb+srv://USER:PASS@CLUSTER.mongodb.net/gatepass?retryWrites=true&w=majority' \
  | gcloud secrets create MONGODB_URI --data-file=-

printf '%s' "$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  | gcloud secrets create JWT_ACCESS_SECRET --data-file=-

printf '%s' "$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  | gcloud secrets create JWT_REFRESH_SECRET --data-file=-
```

## 3. Grant IAM (runtime SA reads secrets; build SA deploys)

```bash
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export RUNTIME_SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com   # Cloud Run runtime SA
export BUILD_SA=$PROJECT_NUMBER@cloudbuild.gserviceaccount.com            # Cloud Build SA

# Runtime SA may read the three secrets
for S in MONGODB_URI JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor"
done

# Build SA may push images, deploy to Cloud Run, and act as the runtime SA
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$BUILD_SA" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$BUILD_SA" --role="roles/run.admin"
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member="serviceAccount:$BUILD_SA" --role="roles/iam.serviceAccountUser"
```
> If a build fails with a permissions error, your project may run builds as the
> **compute** SA (`$RUNTIME_SA`) instead of the cloudbuild SA. Re-run the three
> project/SA bindings above with `--member="serviceAccount:$RUNTIME_SA"`.

## 4. First deploy (manual) — backend first, then frontend

```bash
# 4a. Backend (CLIENT_URL is a temporary placeholder; fixed in 4d)
gcloud builds submit --config cloudbuild.backend.yaml \
  --substitutions=_REGION=$REGION,_REPOSITORY=$REPO,_SERVICE=gatepass-api,_CLIENT_URL=https://placeholder

# 4b. Capture the backend URL
export API_URL=$(gcloud run services describe gatepass-api --region=$REGION --format='value(status.url)')
echo "API: $API_URL"

# 4c. Frontend — bake the REAL backend URL into the Vite bundle
gcloud builds submit --config cloudbuild.frontend.yaml \
  --substitutions=_REGION=$REGION,_REPOSITORY=$REPO,_SERVICE=gatepass-web,_VITE_API_URL=$API_URL/api/v1

export WEB_URL=$(gcloud run services describe gatepass-web --region=$REGION --format='value(status.url)')
echo "WEB: $WEB_URL"

# 4d. Point the backend's CORS / email links at the real frontend URL
gcloud run services update gatepass-api --region=$REGION \
  --update-env-vars=CLIENT_URL=$WEB_URL
```

## 5. Cloud Build Triggers (auto-deploy on push to `main`)

Connect the GitHub repo once (Console → Cloud Build → Triggers → Connect Repository,
or `gcloud builds connections`), then:

```bash
# Backend trigger — only fires when backend files change
gcloud builds triggers create github \
  --name=gatepass-backend \
  --repo-name=gatepass --repo-owner=Alcoder0219 \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.backend.yaml \
  --included-files='backend/**,cloudbuild.backend.yaml' \
  --substitutions="_TAG=\$SHORT_SHA,_REGION=$REGION,_REPOSITORY=$REPO,_SERVICE=gatepass-api,_CLIENT_URL=$WEB_URL"

# Frontend trigger — only fires when frontend files change
gcloud builds triggers create github \
  --name=gatepass-frontend \
  --repo-name=gatepass --repo-owner=Alcoder0219 \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.frontend.yaml \
  --included-files='frontend/**,cloudbuild.frontend.yaml' \
  --substitutions="_TAG=\$SHORT_SHA,_REGION=$REGION,_REPOSITORY=$REPO,_SERVICE=gatepass-web,_VITE_API_URL=$API_URL/api/v1"
```
> `\$SHORT_SHA` is escaped so the literal `$SHORT_SHA` is STORED in the trigger and
> resolved at build time (tags each image with the commit for easy rollback); the
> other `$VARS` expand now. Manually re-run a trigger: `gcloud builds triggers run gatepass-backend --branch=main`.

## 6. Configurable knobs (override via `--substitutions`)

`_REGION`, `_REPOSITORY`, `_SERVICE`, `_TAG`, `_CPU`, `_MEMORY`,
`_MIN_INSTANCES`, `_MAX_INSTANCES` — plus backend `_CLIENT_URL`, `_API_PREFIX`,
`_CONCURRENCY`, and frontend `_VITE_API_URL`.

---

## Important: session cookies across two domains

The two services get separate `*.run.app` URLs, which the browser treats as
**different sites** (`run.app` is on the public-suffix list). The app's refresh
token is an httpOnly `SameSite=Lax` cookie, so it is **not** sent on cross-site
XHR — silent token refresh won't work and users would be logged out when the
15-minute access token expires. The access token itself works immediately.

Fix WITHOUT changing app code — put both services under **one** origin:

- **Custom domain (recommended):** map `app.yourdomain.com` → web and
  `api.yourdomain.com` → api. Same registrable domain = same site → the Lax
  cookie is sent. Rebuild the frontend with `_VITE_API_URL=https://api.yourdomain.com/api/v1`
  and set the backend `CLIENT_URL=https://app.yourdomain.com`.
- **Single external HTTPS Load Balancer** with path routing (`/api/*` → api,
  `/*` → web) so everything is same-origin; build the frontend with
  `_VITE_API_URL=/api/v1`.
