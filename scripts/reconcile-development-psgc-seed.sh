#!/usr/bin/env bash

set -euo pipefail

readonly expected_project_id="ekmoiepalelqpmemvrkl"
readonly seed_version="20260902220100"

if [[ "${SUPABASE_PROJECT_ID:-}" != "$expected_project_id" ]]; then
  echo "Refusing PSGC reconciliation for an unexpected Supabase project" >&2
  exit 1
fi

migration_history="$(supabase migration list --linked)"
if awk -v version="$seed_version" '
  index($0, version) {
    line = $0
    count = gsub(version, "", line)
    if (count >= 2) found = 1
  }
  END { exit found ? 0 : 1 }
' <<<"$migration_history"; then
  echo "PSGC seed migration history is already recorded"
  exit 0
fi

# Release run 33721082661 committed the seed transaction before RESET ROLE
# returned the CLI session to its unprivileged temporary login. Validate the
# complete durable result before recording only that interrupted history row.
supabase db query --linked --file scripts/verify-development-psgc-seed-recovery.sql
supabase migration repair --linked --status applied --yes "$seed_version"

migration_history="$(supabase migration list --linked)"
awk -v version="$seed_version" '
  index($0, version) {
    line = $0
    count = gsub(version, "", line)
    if (count >= 2) found = 1
  }
  END { exit found ? 0 : 1 }
' <<<"$migration_history"
