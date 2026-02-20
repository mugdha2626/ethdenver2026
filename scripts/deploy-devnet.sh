#!/usr/bin/env bash
#
# ConfidentialConnect — DevNet Deployment Script
# Run this ON the DevNet machine (e.g., dev5@136.112.241.18)
#
# Usage:
#   scp scripts/deploy-devnet.sh dev5@136.112.241.18:~/
#   scp daml/.daml/dist/confidential-connect-0.1.0.dar dev5@136.112.241.18:~/
#   ssh dev5@136.112.241.18
#   chmod +x deploy-devnet.sh && ./deploy-devnet.sh
#
set -euo pipefail

# ── Configuration ──────────────────────────────────────
COMPOSE_DIR="${HOME}/splice-node/docker-compose/validator"
IMAGE_TAG="${IMAGE_TAG:-0.5.10}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-splice_$(whoami)}"
DAR_FILE="${HOME}/confidential-connect-0.1.0.dar"
JSON_API_URL="http://localhost:7575"
SV_URL="https://sv.sv-1.dev.global.canton.network.sync.global"
MAX_WAIT=120  # seconds to wait for services

# ── Colors ─────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*"; }

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     ConfidentialConnect — DevNet Deployer        ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Start validator containers ─────────────────
info "Step 1: Starting validator containers..."

if [ ! -d "$COMPOSE_DIR" ]; then
  error "Compose directory not found: $COMPOSE_DIR"
  error "Is splice-node installed? Check with: ls ~/splice-node/"
  exit 1
fi

cd "$COMPOSE_DIR"
export IMAGE_TAG
export COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT"

docker compose up -d 2>&1 | while read -r line; do echo "  $line"; done
info "Containers starting (project: $COMPOSE_PROJECT, tag: $IMAGE_TAG)"

# ── Step 2: Wait for JSON API to be ready ──────────────
info "Step 2: Waiting for JSON API at $JSON_API_URL ..."

elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  if curl -sf "${JSON_API_URL}/v2/version" > /dev/null 2>&1; then
    info "JSON API is ready!"
    break
  fi
  sleep 3
  elapsed=$((elapsed + 3))
  echo -n "."
done
echo ""

if [ $elapsed -ge $MAX_WAIT ]; then
  warn "JSON API not ready after ${MAX_WAIT}s — continuing anyway"
  warn "Check containers: docker compose -p $COMPOSE_PROJECT ps"
fi

# ── Step 3: Get onboarding secret ──────────────────────
info "Step 3: Requesting onboarding secret from SV..."

ONBOARD_RESPONSE=$(curl -sf -X POST \
  "${SV_URL}/api/sv/v0/devnet/onboard/validator/prepare" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1) || true

if [ -n "$ONBOARD_RESPONSE" ]; then
  info "Onboarding secret received:"
  echo "  $ONBOARD_RESPONSE" | head -c 200
  echo ""
else
  warn "Could not get onboarding secret (SV may be down)"
  warn "Ask Jatin at the Canton booth for manual onboarding"
fi

# ── Step 4: Upload DAR ─────────────────────────────────
info "Step 4: Uploading DAR to Canton..."

if [ ! -f "$DAR_FILE" ]; then
  error "DAR not found: $DAR_FILE"
  error "Copy it first: scp daml/.daml/dist/confidential-connect-0.1.0.dar $(whoami)@$(hostname):~/"
  exit 1
fi

DAR_RESPONSE=$(curl -sf -X POST "${JSON_API_URL}/v2/packages" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${DAR_FILE}" 2>&1) || true

if echo "$DAR_RESPONSE" | grep -qi "error\|INVALID_ARGUMENT"; then
  warn "DAR upload issue: ${DAR_RESPONSE:0:300}"
  warn ""
  warn "If rejected due to LF version mismatch, rebuild with SDK 3.x:"
  warn "  1. Install DPM or Daml SDK 3.x on this machine"
  warn "  2. Update daml.yaml sdk-version"
  warn "  3. Run: daml build (or dpm build)"
  warn "  4. Re-run this script"
else
  info "DAR uploaded successfully"
fi

# ── Step 5: Verify ─────────────────────────────────────
info "Step 5: Verifying deployment..."

echo ""
info "Container status:"
docker compose -p "$COMPOSE_PROJECT" ps 2>/dev/null | while read -r line; do echo "  $line"; done

echo ""
info "Checking packages endpoint..."
PKG_CHECK=$(curl -sf "${JSON_API_URL}/v2/packages" 2>&1 | head -c 500) || PKG_CHECK="(no response)"
echo "  $PKG_CHECK"

echo ""
info "Checking parties endpoint..."
PARTY_CHECK=$(curl -sf "${JSON_API_URL}/v2/parties" 2>&1 | head -c 500) || PARTY_CHECK="(no response)"
echo "  $PARTY_CHECK"

# ── Done ───────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║              Deployment Complete!                 ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
info "Next steps (from your laptop):"
echo ""
echo "  1. SSH tunnel:"
echo "     ssh -L 7575:localhost:7575 -N $(whoami)@$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<this-machine>')"
echo ""
echo "  2. Switch to DevNet config:"
echo "     cp .env.devnet .env"
echo ""
echo "  3. Start the bot:"
echo "     cd slack-bot && npm run dev"
echo ""
