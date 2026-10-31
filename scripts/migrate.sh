#!/usr/bin/env bash
# Apply supabase/migrations to the database in SUPABASE_DB_URL (or DATABASE_URL).
# Does not print the URI. --dry-run lists files and does not connect.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node scripts/migrate.mjs "$@"
