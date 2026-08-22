#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"

target="development"
if [[ "${1:-}" == "--target" ]]; then
  if (( $# < 2 )); then
    echo "--target requires development or production" >&2
    exit 2
  fi
  target="$2"
  shift 2
fi

if [[ ! "$SUPABASE_PROJECT_ID" =~ ^[a-z]{20}$ ]]; then
  echo "refusing invalid Supabase project ref" >&2
  exit 2
fi

case "$target" in
  development)
    expected_project_id="ekmoiepalelqpmemvrkl"
    ;;
  production)
    expected_project_id="iegcixcevvkryfwfotqz"
    ;;
  *)
    echo "refusing invalid hosted test target: $target" >&2
    exit 2
    ;;
esac
if [[ "$SUPABASE_PROJECT_ID" != "$expected_project_id" ]]; then
  echo "refusing hosted test target/project mismatch" >&2
  exit 2
fi

policy_script="scripts/hosted-database-test-policy.mjs"
if (( $# == 0 )); then
  test_files=()
  manifest_selection="$(node "$policy_script" list "$target")"
  while IFS= read -r test_file; do
    [[ -n "$test_file" ]] && test_files+=("$test_file")
  done <<<"$manifest_selection"
else
  node "$policy_script" assert-allowed "$target" "$@"
  test_files=("$@")
fi

if (( ${#test_files[@]} == 0 )); then
  echo "hosted test manifest selected no files for target: $target" >&2
  exit 2
fi

for test_file in "${test_files[@]}"; do

  response_file="$(mktemp "${TMPDIR:-/tmp}/camnook-hosted-test.XXXXXX")"
  cleanup_response() {
    rm -f "$response_file"
  }
  trap cleanup_response EXIT

  http_status="$({
    jq -n --rawfile query "$test_file" '{query: $query}' |
      curl -sS \
        -o "$response_file" \
        -w '%{http_code}' \
        -X POST \
        "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/database/query" \
        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        -H 'Content-Type: application/json' \
        --data-binary @-
  })"

  if [[ "$http_status" != "200" && "$http_status" != "201" ]]; then
    echo "hosted database test failed: $(basename "$test_file") (HTTP $http_status)" >&2
    exit 1
  fi
  if ! jq -e '
    type == "array" and
    length > 0 and
    any(.[]; any(.[]; type == "string" and startswith("ok ")))
  ' "$response_file" >/dev/null; then
    echo "hosted database test did not return a passing TAP assertion: $(basename "$test_file")" >&2
    exit 1
  fi

  cleanup_response
  trap - EXIT
  echo "ok - hosted $(basename "$test_file")"
done
