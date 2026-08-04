#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_ID="my-journaly"
HOSTING_TARGET="app"
SECRETS_FILE=".secrets"

# ── Pin gcloud to the My Journaly identity so a deploy never borrows another
#    gcloud config's account/project/quota (e.g. a Delectable work profile).
#    Every gcloud command already passes --project explicitly; these additionally
#    pin the *account* and the *quota* project. The Service Usage API enforces the
#    caller's quota project — that mismatch is what broke cross-profile deploys.
#    (Firebase CLI has its own auth and ignores these; it selects via --project.)
DEPLOY_ACCOUNT="patrick.hoeffel@acornbrownministries.org"
export CLOUDSDK_CORE_ACCOUNT="$DEPLOY_ACCOUNT"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export CLOUDSDK_BILLING_QUOTA_PROJECT="$PROJECT_ID"
API_URL="https://myjournaly-api-566393669956.us-central1.run.app"  

# ── Required secrets in GCP Secret Manager ──
REQUIRED_SECRETS=(
  "VITE_FIREBASE_API_KEY"
  "VITE_FIREBASE_APP_ID"
  "VITE_FIREBASE_MESSAGING_SENDER_ID"
)

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  UI Deploy — myjournaly-app"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Check .secrets file exists ──
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo -e "${RED}✗ Missing ${SECRETS_FILE} — copy from .secrets.example and fill in values${NC}"
  exit 1
fi

# ── 2. Bump version ──
CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

echo -e "${YELLOW}Version: ${CURRENT_VERSION} → ${NEW_VERSION}${NC}"

# Update package.json
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version >/dev/null

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
  npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version >/dev/null
  exit 1
fi

source "$SECRETS_FILE"

for SECRET_NAME in "${REQUIRED_SECRETS[@]}"; do
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
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
  npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version >/dev/null
  exit 1
fi

# ── 4. Build with production env ──
echo ""
echo "Building..."

source "$SECRETS_FILE"

VITE_APP_VERSION="$NEW_VERSION" \
VITE_FIREBASE_AUTH_DOMAIN="${PROJECT_ID}.firebaseapp.com" \
VITE_FIREBASE_PROJECT_ID="$PROJECT_ID" \
VITE_FIREBASE_STORAGE_BUCKET="${PROJECT_ID}.firebasestorage.app" \
VITE_API_URL="$API_URL" \
npm run build

# ── 5. Deploy to Firebase Hosting ──
echo ""
echo "Deploying to Firebase Hosting..."

cd ..
firebase deploy --only "hosting:${HOSTING_TARGET}" --project "$PROJECT_ID"

echo ""
echo -e "${GREEN}✓ UI deployed — v${NEW_VERSION}${NC}"
