#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_ID="my-journaly"
SERVICE_NAME="myjournaly-api"
REGION="us-central1"
SECRETS_FILE=".secrets"

# ── Pin gcloud to the My Journaly identity so a deploy never borrows another
#    gcloud config's account/project/quota (e.g. a Delectable work profile).
#    Every command already passes --project explicitly; these additionally pin
#    the *account* and the *quota* project. The Service Usage API enforces the
#    caller's quota project — that mismatch is what broke cross-profile deploys.
DEPLOY_ACCOUNT="patrick.hoeffel@acornbrownministries.org"
export CLOUDSDK_CORE_ACCOUNT="$DEPLOY_ACCOUNT"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export CLOUDSDK_BILLING_QUOTA_PROJECT="$PROJECT_ID"

# ── Required secrets in GCP Secret Manager ──
REQUIRED_SECRETS=(
  "JOURNALY_ANTHROPIC_API_KEY"
  "JOURNALY_GOOGLE_CLIENT_ID"
  "JOURNALY_GOOGLE_CLIENT_SECRET"
)

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  API Deploy — ${SERVICE_NAME}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Check .secrets file exists ──
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo -e "${RED}✗ Missing ${SECRETS_FILE} — copy from .secrets.example and fill in values${NC}"
  exit 1
fi

# ── 2. Bump version ──
CURRENT_VERSION=$(sed -n 's/^VERSION = "\(.*\)"/\1/p' app/main.py)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

echo -e "${YELLOW}Version: ${CURRENT_VERSION} → ${NEW_VERSION}${NC}"

sed -i '' "s/^VERSION = \"${CURRENT_VERSION}\"/VERSION = \"${NEW_VERSION}\"/" app/main.py
sed -i '' "s/^version = \"${CURRENT_VERSION}\"/version = \"${NEW_VERSION}\"/" pyproject.toml

# ── 3. Check secrets in GCP Secret Manager ──
echo ""
echo "Checking GCP Secret Manager..."
MISSING=0

# Verify gcloud is authenticated and API is reachable
if ! gcloud secrets list --project="$PROJECT_ID" --limit=1 &>/dev/null; then
  echo -e "${RED}✗ Cannot reach Secret Manager. Check:${NC}"
  echo "  - gcloud auth list                 (are you authenticated?)"
  echo "  - gcloud config get-value project   (correct project?)"
  echo "  - gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID"
  # Revert version bump
  sed -i '' "s/^VERSION = \"${NEW_VERSION}\"/VERSION = \"${CURRENT_VERSION}\"/" app/main.py
  sed -i '' "s/^version = \"${NEW_VERSION}\"/version = \"${CURRENT_VERSION}\"/" pyproject.toml
  exit 1
fi

source "$SECRETS_FILE"

for SECRET_NAME in "${REQUIRED_SECRETS[@]}"; do
  # Check if secret exists in Secret Manager
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    # Get the latest version's value
    CLOUD_VALUE=$(gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT_ID" 2>/dev/null || true)
    LOCAL_VALUE="${!SECRET_NAME:-}"

    if [[ -z "$CLOUD_VALUE" ]]; then
      echo -e "${RED}  ✗ ${SECRET_NAME} — exists but has no accessible version${NC}"
      MISSING=1
    elif [[ -z "$LOCAL_VALUE" ]]; then
      echo -e "${RED}  ✗ ${SECRET_NAME} — in cloud but missing from ${SECRETS_FILE}${NC}"
      MISSING=1
    elif [[ "$CLOUD_VALUE" != "$LOCAL_VALUE" ]]; then
      echo -e "${YELLOW}  ⚠ ${SECRET_NAME} — local value differs from cloud${NC}"
      read -rp "    Update cloud value to match local? [y/N] " yn
      if [[ "$yn" =~ ^[Yy]$ ]]; then
        printf '%s' "$LOCAL_VALUE" | gcloud secrets versions add "$SECRET_NAME" \
          --data-file=- --project="$PROJECT_ID"
        echo -e "${GREEN}    ✓ Updated${NC}"
      fi
    else
      echo -e "${GREEN}  ✓ ${SECRET_NAME}${NC}"
    fi
  else
    LOCAL_VALUE="${!SECRET_NAME:-}"
    if [[ -z "$LOCAL_VALUE" ]]; then
      echo -e "${RED}  ✗ ${SECRET_NAME} — missing from both cloud and ${SECRETS_FILE}${NC}"
      MISSING=1
    else
      echo -e "${YELLOW}  ⚠ ${SECRET_NAME} — not in cloud, creating...${NC}"
      gcloud secrets create "$SECRET_NAME" --project="$PROJECT_ID" --replication-policy="automatic"
      printf '%s' "$LOCAL_VALUE" | gcloud secrets versions add "$SECRET_NAME" \
        --data-file=- --project="$PROJECT_ID"
      echo -e "${GREEN}    ✓ Created${NC}"
    fi
  fi
done

if [[ $MISSING -ne 0 ]]; then
  echo -e "\n${RED}✗ Fix missing secrets before deploying${NC}"
  # Revert version bump
  sed -i '' "s/^VERSION = \"${NEW_VERSION}\"/VERSION = \"${CURRENT_VERSION}\"/" app/main.py
  sed -i '' "s/^version = \"${NEW_VERSION}\"/version = \"${CURRENT_VERSION}\"/" pyproject.toml
  exit 1
fi

# ── 4. Ensure required APIs and permissions ──
echo ""
echo "Ensuring required APIs and permissions..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com --project="$PROJECT_ID" --quiet

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Cloud Build uses the default compute SA — grant it all needed roles
for ROLE in roles/storage.admin roles/artifactregistry.writer roles/run.admin roles/iam.serviceAccountUser roles/logging.logWriter roles/secretmanager.secretAccessor roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="$ROLE" \
    --quiet &>/dev/null
done

# ── 5. Deploy to Cloud Run ──
echo ""
echo "Deploying to Cloud Run..."

if ! gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-secrets="JOURNALY_ANTHROPIC_API_KEY=JOURNALY_ANTHROPIC_API_KEY:latest,JOURNALY_GOOGLE_CLIENT_ID=JOURNALY_GOOGLE_CLIENT_ID:latest,JOURNALY_GOOGLE_CLIENT_SECRET=JOURNALY_GOOGLE_CLIENT_SECRET:latest" \
  --set-env-vars="^||^JOURNALY_PROJECT_ID=${PROJECT_ID}||JOURNALY_ENVIRONMENT=production||JOURNALY_STORAGE_BUCKET=myjournaly-assets||JOURNALY_CORS_ORIGINS=[\"https://myjournaly.ai\",\"https://admin.myjournaly.ai\",\"https://myjournaly-app.web.app\",\"https://myjournaly-admin.web.app\"]"; then
  echo -e "${RED}✗ Deploy failed — reverting version bump${NC}"
  sed -i '' "s/^VERSION = \"${NEW_VERSION}\"/VERSION = \"${CURRENT_VERSION}\"/" app/main.py
  sed -i '' "s/^version = \"${NEW_VERSION}\"/version = \"${CURRENT_VERSION}\"/" pyproject.toml
  exit 1
fi

echo ""
echo -e "${GREEN}✓ API deployed — v${NEW_VERSION}${NC}"
