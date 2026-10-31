#!/usr/bin/env bash
# Build teams/dist/virtual-office-teams.zip. Does not upload or ask for admin consent.
#   ./scripts/package-teams.sh https://<preview-host>
#   STAGING_URL=https://<preview-host> ./scripts/package-teams.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
URL="${1:-${STAGING_URL:-}}"
exec node scripts/package-teams.mjs "$URL"
