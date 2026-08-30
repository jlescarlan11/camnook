#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "refusing caller-supplied DATABASE_URL; this test provisions its own disposable cluster" >&2
  exit 2
fi

if ! postgresql_prefix="$(brew --prefix postgresql@17 2>/dev/null)"; then
  echo "Homebrew postgresql@17 is required" >&2
  exit 2
fi

postgres_bin="$postgresql_prefix/bin"
for executable in initdb pg_ctl pg_dump psql; do
  if [[ ! -x "$postgres_bin/$executable" ]]; then
    echo "missing PostgreSQL 17 executable: $postgres_bin/$executable" >&2
    exit 2
  fi
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
temporary_base="${TMPDIR:-/tmp}"
test_dir="$(mktemp -d "$temporary_base/camnook-approval-race.XXXXXX")"
if [[ "$test_dir" != "$temporary_base"/camnook-approval-race.* ]]; then
  echo "unsafe disposable cluster directory: $test_dir" >&2
  exit 1
fi

data_dir="$test_dir/data"
socket_dir="$test_dir/socket"
postgres_log="$test_dir/postgres.log"
session_a_log="$test_dir/session-a.log"
session_b_log="$test_dir/session-b.log"
session_a_sql="$test_dir/session-a.sql"
session_b_sql="$test_dir/session-b.sql"
ready_file="$test_dir/session-a-ready"
accessory_approval_log="$test_dir/accessory-approval.log"
accessory_writer_log="$test_dir/accessory-writer.log"
accessory_approval_sql="$test_dir/accessory-approval.sql"
accessory_writer_sql="$test_dir/accessory-writer.sql"
accessory_ready_file="$test_dir/accessory-approval-ready"
accessory_release_file="$test_dir/accessory-approval-release"
accessory_writer_application_name="camnook-accessory-writer-$$"
verification_approval_log="$test_dir/verification-approval.log"
verification_writer_log="$test_dir/verification-writer.log"
verification_approval_sql="$test_dir/verification-approval.sql"
verification_writer_sql="$test_dir/verification-writer.sql"
verification_ready_file="$test_dir/verification-approval-ready"
verification_release_file="$test_dir/verification-approval-release"
verification_writer_application_name="camnook-verification-writer-$$"
catalog_archive_a_log="$test_dir/catalog-archive-a.log"
catalog_archive_b_log="$test_dir/catalog-archive-b.log"
catalog_archive_a_sql="$test_dir/catalog-archive-a.sql"
catalog_archive_b_sql="$test_dir/catalog-archive-b.sql"
catalog_archive_ready_file="$test_dir/catalog-archive-a-ready"
catalog_archive_release_file="$test_dir/catalog-archive-a-release"
catalog_archive_b_application_name="camnook-catalog-archive-b-$$"
catalog_publish_archive_log="$test_dir/catalog-publish-archive.log"
catalog_publish_log="$test_dir/catalog-publish.log"
catalog_publish_archive_sql="$test_dir/catalog-publish-archive.sql"
catalog_publish_sql="$test_dir/catalog-publish.sql"
catalog_publish_ready_file="$test_dir/catalog-publish-archive-ready"
catalog_publish_release_file="$test_dir/catalog-publish-archive-release"
catalog_publish_application_name="camnook-catalog-publish-$$"
contract_sign_log="$test_dir/contract-sign.log"
contract_supersede_log="$test_dir/contract-supersede.log"
contract_sign_sql="$test_dir/contract-sign.sql"
contract_supersede_sql="$test_dir/contract-supersede.sql"
contract_sign_ready_file="$test_dir/contract-sign-ready"
contract_retry_a_log="$test_dir/contract-retry-a.log"
contract_retry_b_log="$test_dir/contract-retry-b.log"
contract_retry_a_sql="$test_dir/contract-retry-a.sql"
contract_retry_b_sql="$test_dir/contract-retry-b.sql"
contract_retry_ready_file="$test_dir/contract-retry-ready"
payment_submit_a_log="$test_dir/payment-submit-a.log"
payment_submit_b_log="$test_dir/payment-submit-b.log"
payment_submit_a_sql="$test_dir/payment-submit-a.sql"
payment_submit_b_sql="$test_dir/payment-submit-b.sql"
payment_submit_ready_file="$test_dir/payment-submit-ready"
payment_decision_a_log="$test_dir/payment-decision-a.log"
payment_decision_b_log="$test_dir/payment-decision-b.log"
payment_decision_a_sql="$test_dir/payment-decision-a.sql"
payment_decision_b_sql="$test_dir/payment-decision-b.sql"
payment_decision_ready_file="$test_dir/payment-decision-ready"
pickup_a_log="$test_dir/pickup-a.log"
pickup_b_log="$test_dir/pickup-b.log"
pickup_a_sql="$test_dir/pickup-a.sql"
pickup_b_sql="$test_dir/pickup-b.sql"
pickup_ready_file="$test_dir/pickup-a-ready"
pickup_photo_create_log="$test_dir/pickup-photo-create.log"
pickup_photo_finalize_log="$test_dir/pickup-photo-finalize.log"
pickup_photo_create_sql="$test_dir/pickup-photo-create.sql"
pickup_photo_finalize_sql="$test_dir/pickup-photo-finalize.sql"
pickup_photo_ready_file="$test_dir/pickup-photo-create-ready"
pickup_photo_release_file="$test_dir/pickup-photo-create-release"
pickup_photo_finalize_application_name="camnook-pickup-photo-finalize-$$"
return_a_log="$test_dir/return-a.log"
return_b_log="$test_dir/return-b.log"
return_a_sql="$test_dir/return-a.sql"
return_b_sql="$test_dir/return-b.sql"
return_ready_file="$test_dir/return-a-ready"
handoff_policy_a_log="$test_dir/handoff-policy-a.log"
handoff_policy_b_log="$test_dir/handoff-policy-b.log"
handoff_policy_a_sql="$test_dir/handoff-policy-a.sql"
handoff_policy_b_sql="$test_dir/handoff-policy-b.sql"
handoff_policy_ready_file="$test_dir/handoff-policy-a-ready"
session_a_pid=""
accessory_approval_pid=""
accessory_writer_pid=""
verification_approval_pid=""
verification_writer_pid=""
catalog_archive_a_pid=""
catalog_archive_b_pid=""
catalog_publish_archive_pid=""
catalog_publish_pid=""
contract_sign_pid=""
contract_retry_a_pid=""
payment_submit_a_pid=""
payment_decision_a_pid=""
pickup_a_pid=""
pickup_photo_create_pid=""
pickup_photo_finalize_pid=""
return_a_pid=""
handoff_policy_a_pid=""

cleanup() {
  set +e

  for child_pid in \
    "$session_a_pid" \
    "$accessory_approval_pid" \
    "$accessory_writer_pid" \
    "$verification_approval_pid" \
    "$verification_writer_pid" \
    "$catalog_archive_a_pid" \
    "$catalog_archive_b_pid" \
    "$catalog_publish_archive_pid" \
    "$catalog_publish_pid" \
    "$contract_sign_pid" \
    "$contract_retry_a_pid" \
    "$payment_submit_a_pid" \
    "$payment_decision_a_pid" \
    "$pickup_a_pid" \
    "$pickup_photo_create_pid" \
    "$pickup_photo_finalize_pid" \
    "$return_a_pid" \
    "$handoff_policy_a_pid"; do
    if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
      kill "$child_pid" 2>/dev/null
      wait "$child_pid" 2>/dev/null
    fi
  done

  if [[ -d "$data_dir" ]]; then
    "$postgres_bin/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1
  fi

  find "$test_dir" -depth -delete
}
trap cleanup EXIT

mkdir "$socket_dir"
"$postgres_bin/initdb" \
  -D "$data_dir" \
  -U postgres \
  --auth=trust \
  --no-locale \
  --encoding=UTF8 \
  >/dev/null
"$postgres_bin/pg_ctl" \
  -D "$data_dir" \
  -l "$postgres_log" \
  -o "-c listen_addresses='' -k $socket_dir" \
  -w start \
  >/dev/null

database_url="postgresql://postgres@localhost/postgres?host=$socket_dir"
template_database_url="postgresql://postgres@localhost/template1?host=$socket_dir"
legacy_guard_database_url="postgresql://postgres@localhost/camnook_legacy_guard?host=$socket_dir"
legacy_guard_log="$test_dir/legacy-guard-migration.log"
hosted_compat_database_url="postgresql://postgres@localhost/camnook_hosted_compat?host=$socket_dir"
hosted_compat_before_dump="$test_dir/hosted-compat-before.sql"
hosted_compat_after_dump="$test_dir/hosted-compat-after.sql"

dump_hosted_compat_rows() {
  local output_file="$1"

  "$postgres_bin/pg_dump" \
    "$hosted_compat_database_url" \
    --data-only \
    --column-inserts \
    --no-owner \
    --no-privileges \
    | sed \
      -e '/^SELECT pg_catalog\.setval(/d' \
      -e '/^\\restrict /d' \
      -e '/^\\unrestrict /d' \
    >"$output_file"
}

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema storage;
create schema extensions;

create table auth.users (
  id uuid primary key,
  email_confirmed_at timestamptz
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default statement_timestamp()
);

alter table storage.objects enable row level security;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant select, insert, update, delete
on storage.buckets, storage.objects
to anon, authenticated, service_role;
SQL

"$postgres_bin/psql" "$template_database_url" -v ON_ERROR_STOP=1 \
  -c 'create database camnook_legacy_guard template postgres' >/dev/null

for migration in "$repo_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$migration")" == \
    "20260816071918_add_audited_return_cancellation_resolution.sql" ]]; then
    break
  fi
  "$postgres_bin/psql" "$legacy_guard_database_url" \
    -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

"$postgres_bin/psql" "$legacy_guard_database_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
set session_replication_role = replica;
insert into public.booking_cancellation_requests (
  id,
  booking_id,
  requester_id,
  reason,
  disposition,
  decided_by,
  decided_at,
  decision_note
) values (
  '1f000000-0000-4000-8000-000000000001',
  '1f000000-0000-4000-8000-000000000002',
  '1f000000-0000-4000-8000-000000000003',
  'Legacy accepted cancellation.',
  'accepted',
  '1f000000-0000-4000-8000-000000000004',
  statement_timestamp(),
  'Legacy decision without a decision-linked record.'
);
set session_replication_role = origin;
SQL

set +e
"$postgres_bin/psql" "$legacy_guard_database_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/migrations/20260816071918_add_audited_return_cancellation_resolution.sql" \
  >"$legacy_guard_log" 2>&1
legacy_guard_status=$?
set -e

if [[ "$legacy_guard_status" -eq 0 ]] \
  || ! grep -Fq 'legacy_resolution_history_requires_reviewed_mapping' \
    "$legacy_guard_log"; then
  cat "$legacy_guard_log" >&2
  echo "Sprint 6 migration did not reject unmappable legacy outcomes" >&2
  exit 1
fi

if [[ "$("$postgres_bin/psql" "$legacy_guard_database_url" -Atq \
  -v ON_ERROR_STOP=1 \
  -c "select to_regprocedure('api.request_cancellation(uuid,text)') is not null;")" \
  != "t" ]]; then
  cat "$legacy_guard_log" >&2
  echo "legacy migration guard changed the old API before failing" >&2
  exit 1
fi

"$postgres_bin/psql" "$template_database_url" -v ON_ERROR_STOP=1 \
  -c 'drop database camnook_legacy_guard' >/dev/null
echo "ok - legacy resolution outcomes fail before the old API changes"

for migration in "$repo_root"/supabase/migrations/*.sql; do
  echo "applying $(basename "$migration")"
  "$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

echo "running domain and authorization invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/001_domain_invariants.sql"

echo "running pricing and approval invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/002_pricing_and_approval.sql"

echo "running retired verification surface invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/005_verification_policy_disabled.sql"

echo "running versioned contract lifecycle invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/008_contract_lifecycle.sql"

echo "running manual GCash reconciliation invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/009_manual_gcash_reconciliation.sql"

echo "running pickup and active-rental invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/010_pickup_active_rental.sql"

echo "running return, cancellation, and resolution invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/011_return_cancellation_resolution.sql"

echo "running owner operations and portfolio reporting invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/012_owner_operations_portfolio_reporting.sql"

echo "running camera handoff policy invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/013_camera_handoff_policies.sql"

echo "running handoff schedule booking invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/014_handoff_schedule_booking_flow.sql"

echo "running booking meetup plan invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/015_booking_meetup_plans.sql"

echo "running privacy email forwarding invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/016_privacy_email_forwarding.sql"

echo "running abandoned private upload cleanup invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/017_abandoned_private_upload_cleanup.sql"

"$postgres_bin/psql" "$template_database_url" -v ON_ERROR_STOP=1 \
  -c 'create database camnook_hosted_compat template postgres' >/dev/null

"$postgres_bin/psql" "$hosted_compat_database_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;

insert into auth.users (id) values
  ('16000000-0000-4000-8000-000000000001'),
  ('16000000-0000-4000-8000-000000000002');

insert into public.profiles (user_id, legal_name, phone, account_status) values
  (
    '16000000-0000-4000-8000-000000000001',
    'Hosted Compatibility Admin',
    '+639160000001',
    'active'
  ),
  (
    '16000000-0000-4000-8000-000000000002',
    'Hosted Compatibility Legacy Renter',
    '+639160000002',
    'active'
  );

insert into private.admin_accounts (user_id)
values ('16000000-0000-4000-8000-000000000001');

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  description,
  status,
  daily_rate,
  security_deposit,
  published_at
) values (
  '16100000-0000-4000-8000-000000000001',
  'hosted-compatibility-legacy-camera',
  'HOSTED-COMPATIBILITY-LEGACY-SERIAL',
  'Hosted Compatibility Legacy Camera',
  'Existing record with no handoff policy or meetup snapshot.',
  'published',
  500,
  2000,
  statement_timestamp()
);

set constraints all deferred;

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  pickup_at,
  return_at,
  intended_use,
  expected_location
) values (
  '16200000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  '16100000-0000-4000-8000-000000000001',
  '2099-11-01 01:00:00+00',
  '2099-11-03 01:00:00+00',
  'Legacy hosted compatibility fixture',
  'Cebu City'
);

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
) values (
  '16200000-0000-4000-8000-000000000001',
  null,
  'FOR_REVIEW',
  '16000000-0000-4000-8000-000000000002',
  'renter',
  'booking_requested'
);

set constraints all immediate;
commit;
SQL

dump_hosted_compat_rows "$hosted_compat_before_dump"

hosted_manifest_selection="$({
  node "$repo_root/scripts/hosted-database-test-policy.mjs" list development
})"

set +e
"$postgres_bin/psql" \
  "$hosted_compat_database_url" \
  -v ON_ERROR_STOP=1 \
  >/dev/null 2>&1 <<'SQL'
begin;
insert into auth.users (id)
values ('16f00000-0000-4000-8000-000000000001');
do $$
begin
  raise exception 'intentional hosted assertion failure';
end;
$$;
rollback;
SQL
hosted_failure_status=$?
set -e

if [[ "$hosted_failure_status" -eq 0 ]] || [[ "$(
  "$postgres_bin/psql" \
    "$hosted_compat_database_url" \
    -Atq \
    -v ON_ERROR_STOP=1 \
    -c "select count(*) from auth.users where id = '16f00000-0000-4000-8000-000000000001';"
)" != "0" ]]; then
  echo "failed hosted assertion left transaction-owned fixture data" >&2
  exit 1
fi
echo "ok - failed hosted assertion rolls back transaction-owned fixtures"

for hosted_compat_pass in 1 2; do
  echo "running production-shaped hosted manifest pass $hosted_compat_pass"
  while IFS= read -r hosted_test_file; do
    [[ -n "$hosted_test_file" ]] || continue
    "$postgres_bin/psql" \
      "$hosted_compat_database_url" \
      -v ON_ERROR_STOP=1 \
      -f "$repo_root/$hosted_test_file"
  done <<<"$hosted_manifest_selection"

  dump_hosted_compat_rows "$hosted_compat_after_dump"

  if ! cmp -s "$hosted_compat_before_dump" "$hosted_compat_after_dump"; then
    echo "hosted manifest changed the production-shaped baseline on pass $hosted_compat_pass" >&2
    exit 1
  fi
done

"$postgres_bin/psql" "$template_database_url" -v ON_ERROR_STOP=1 \
  -c 'drop database camnook_hosted_compat' >/dev/null
echo "ok - hosted manifest is repeatable and leaves production-shaped data unchanged"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
begin;

insert into auth.users (id) values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('20000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('20000000-0000-4000-8000-000000000001', 'Race Admin', '+639200000001'),
  ('20000000-0000-4000-8000-000000000002', 'Race Renter A', '+639200000002'),
  ('20000000-0000-4000-8000-000000000003', 'Race Renter B', '+639200000003');

insert into public.verification_records (
  user_id, status, id_type, document_expiration_date, decided_at, decided_by
) values
  (
    '20000000-0000-4000-8000-000000000002',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
    statement_timestamp(),
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
    statement_timestamp(),
    '20000000-0000-4000-8000-000000000001'
  );

insert into public.cameras (
  id, slug, serial_number, name, description, status, daily_rate, security_deposit, published_at
) values
  (
    '21000000-0000-4000-8000-000000000001',
    'race-camera',
    'PRIVATE-RACE-SERIAL',
    'Race Camera',
    'Published camera for the separate-session overlap race.',
    'published',
    1000.00,
    4000.00,
    statement_timestamp()
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    'accessory-race-camera',
    'PRIVATE-ACCESSORY-RACE-SERIAL',
    'Accessory Race Camera',
    'Published camera for the accessory membership race.',
    'published',
    1500.00,
    4500.00,
    statement_timestamp()
  );

insert into public.camera_accessories (
  id, camera_id, name, quantity, sort_position
) values (
  '24000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  'Initial battery',
  1,
  10
);

insert into public.contract_templates (
  id, version, schema_version, terms, content_sha256,
  created_by, approved_at, approved_by, activated_at
) values (
  '22000000-0000-4000-8000-000000000001',
  'race-template-v1',
  1,
  '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb,
  extensions.digest(
    convert_to('{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb::text, 'UTF8'),
    'sha256'
  ),
  '20000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  '20000000-0000-4000-8000-000000000001',
  statement_timestamp()
);

set constraints all deferred;

insert into public.bookings (
  id, renter_id, camera_id, pickup_at, return_at, intended_use, expected_location
) values
  (
    '23000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    '2099-08-01 00:00:00+00',
    '2099-08-03 00:00:00+00',
    'Race request A',
    'Makati City'
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000001',
    '2099-08-02 00:00:00+00',
    '2099-08-04 00:00:00+00',
    'Race request B',
    'Taguig City'
  ),
  (
    '23000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    '2099-09-01 00:00:00+00',
    '2099-09-02 00:00:00+00',
    'Accessory membership race',
    'Pasig City'
  ),
  (
    '23000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000002',
    '2099-10-01 00:00:00+00',
    '2099-10-02 00:00:00+00',
    'Verification membership race',
    'Quezon City'
  );

insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id, actor_type, reason_code
)
select id, null, 'FOR_REVIEW', renter_id, 'renter', 'booking_requested'
from public.bookings;

set constraints all immediate;

commit;
SQL

cat >"$session_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.approve_booking('23000000-0000-4000-8000-000000000001');
\! touch "$ready_file"
select pg_sleep(2);
commit;
SQL

cat >"$session_b_sql" <<'SQL'
\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.approve_booking('23000000-0000-4000-8000-000000000002');
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$session_a_sql" >"$session_a_log" 2>&1 &
session_a_pid=$!

for _ in {1..200}; do
  [[ -f "$ready_file" ]] && break
  if ! kill -0 "$session_a_pid" 2>/dev/null; then
    wait "$session_a_pid" || true
    cat "$session_a_log" >&2
    echo "session A exited before reaching its approval barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$ready_file" ]]; then
  cat "$session_a_log" >&2
  echo "timed out waiting for session A approval barrier" >&2
  exit 1
fi

set +e
"$postgres_bin/psql" "$database_url" -f "$session_b_sql" >"$session_b_log" 2>&1
session_b_status=$?
set -e

wait "$session_a_pid"
session_a_pid=""

if [[ "$session_b_status" -eq 0 ]]; then
  cat "$session_b_log" >&2
  echo "overlapping session B unexpectedly committed" >&2
  exit 1
fi

if ! grep -Fq '23P01: approval_overlap' "$session_b_log"; then
  cat "$session_b_log" >&2
  echo "session B did not return the stable overlap category" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from public.bookings
    where id = '23000000-0000-4000-8000-000000000001'
      and state = 'CONTRACT_PENDING'
      and billable_days_snapshot = 2
  ) then
    raise exception 'session A did not commit the winning approval';
  end if;

  if not exists (
    select 1 from public.bookings
    where id = '23000000-0000-4000-8000-000000000002'
      and state = 'FOR_REVIEW'
      and approved_at is null
      and approval_deadline_at is null
      and billable_days_snapshot is null
      and daily_rate_snapshot is null
      and rental_amount is null
      and security_deposit_amount is null
      and current_contract_version_id is null
  )
    or exists (
      select 1 from public.availability_blocks
      where booking_id = '23000000-0000-4000-8000-000000000002'
    )
    or exists (
      select 1 from public.contract_versions
      where booking_id = '23000000-0000-4000-8000-000000000002'
    )
    or exists (
      select 1 from public.booking_state_history
      where booking_id = '23000000-0000-4000-8000-000000000002'
        and to_state = 'CONTRACT_PENDING'
    )
    or exists (
      select 1 from private.audit_logs
      where action = 'approve_booking'
        and entity_id = '23000000-0000-4000-8000-000000000002'
        and outcome = 'success'
    )
  then
    raise exception 'losing session left a partial approval aggregate';
  end if;

  if (select count(*) from public.availability_blocks where booking_id in (
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002'
  )) <> 1 then
    raise exception 'race did not produce exactly one booking block';
  end if;
end;
$$;

set role authenticated;
set "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform api.approve_booking('23000000-0000-4000-8000-000000000001');
    raise exception 'repeated approval was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'approval_stale_booking_state' then raise; end if;
  end;

  begin
    perform api.reject_booking(
      '23000000-0000-4000-8000-000000000001',
      'Stale rejection boundary test'
    );
    raise exception 'rejection after approval was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'booking state changed or transition precondition failed' then
        raise;
      end if;
  end;
end;
$$;

reset role;
SQL

echo "ok - separate-session overlapping approvals produce one clean winner"

cat >"$accessory_approval_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.approve_booking('23000000-0000-4000-8000-000000000003');
\! touch "$accessory_ready_file"
\! barrier_count=0; while [ ! -f "$accessory_release_file" ] && [ "\$barrier_count" -lt 400 ]; do sleep 0.025; barrier_count=\$((barrier_count + 1)); done
commit;
SQL

cat >"$accessory_writer_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set application_name = '$accessory_writer_application_name';
insert into public.camera_accessories (
  id, camera_id, name, quantity, sort_position
) values (
  '24000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  'Concurrent tripod',
  1,
  20
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$accessory_approval_sql" >"$accessory_approval_log" 2>&1 &
accessory_approval_pid=$!

for _ in {1..200}; do
  [[ -f "$accessory_ready_file" ]] && break
  if ! kill -0 "$accessory_approval_pid" 2>/dev/null; then
    wait "$accessory_approval_pid" || true
    cat "$accessory_approval_log" >&2
    echo "accessory approval exited before reaching its transaction barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$accessory_ready_file" ]]; then
  cat "$accessory_approval_log" >&2
  echo "timed out waiting for accessory approval transaction barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$accessory_writer_sql" >"$accessory_writer_log" 2>&1 &
accessory_writer_pid=$!

accessory_lock_observed="false"
for _ in {1..200}; do
  if ! kill -0 "$accessory_writer_pid" 2>/dev/null; then
    wait "$accessory_writer_pid" || true
    cat "$accessory_writer_log" >&2
    cat "$accessory_approval_log" >&2
    echo "accessory writer exited before PostgreSQL reported its blocked relation lock" >&2
    exit 1
  fi

  if [[ "$("$postgres_bin/psql" "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select exists (
      select 1
      from pg_catalog.pg_locks as lock
      join pg_catalog.pg_stat_activity as activity on activity.pid = lock.pid
      where activity.application_name = '$accessory_writer_application_name'
        and lock.locktype = 'relation'
        and lock.relation = 'public.camera_accessories'::regclass
        and lock.mode = 'RowExclusiveLock'
        and not lock.granted
    );
  ")" == "t" ]]; then
    accessory_lock_observed="true"
    break
  fi

  sleep 0.025
done

if [[ "$accessory_lock_observed" != "true" ]]; then
  "$postgres_bin/psql" "$database_url" -x -v ON_ERROR_STOP=1 -c "
    select activity.pid,
           activity.application_name,
           activity.state,
           activity.wait_event_type,
           activity.wait_event,
           lock.locktype,
           lock.mode,
           lock.granted
    from pg_catalog.pg_stat_activity as activity
    left join pg_catalog.pg_locks as lock on lock.pid = activity.pid
    where activity.application_name = '$accessory_writer_application_name';
  " >&2
  cat "$accessory_writer_log" >&2
  cat "$accessory_approval_log" >&2
  echo "PostgreSQL did not report the writer's ungranted RowExclusiveLock on camera_accessories" >&2
  exit 1
fi

touch "$accessory_release_file"
wait "$accessory_approval_pid"
accessory_approval_pid=""
wait "$accessory_writer_pid"
accessory_writer_pid=""

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  snapshotted_accessories jsonb;
begin
  select version.snapshot #> '{camera,accessories}'
    into snapshotted_accessories
  from public.contract_versions as version
  where version.booking_id = '23000000-0000-4000-8000-000000000003';

  if snapshotted_accessories <> '[{"id":"24000000-0000-4000-8000-000000000001","name":"Initial battery","quantity":1}]'::jsonb then
    raise exception 'approval snapshot did not preserve its stable accessory set: %',
      snapshotted_accessories;
  end if;

  if not exists (
    select 1
    from public.camera_accessories
    where id = '24000000-0000-4000-8000-000000000002'
      and name = 'Concurrent tripod'
  ) then
    raise exception 'accessory writer did not commit after approval';
  end if;
end;
$$;
SQL

echo "ok - approval stabilizes accessory membership against concurrent inserts"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values (
  '26000000-0000-4000-8000-000000000001',
  'catalog-archive-race',
  'CATALOG-RACE-SERIAL',
  'Catalog Archive Race Camera',
  'Concurrency-only catalog fixture.',
  'published',
  1000,
  3000,
  statement_timestamp()
);

insert into private.catalog_photo_publications (
  id, camera_id, created_by, staging_object_path, public_object_path,
  alt_text, sort_position, expected_media_type, expected_byte_size,
  expected_sha256, status, source_verified_at, destination_verified_at,
  staging_removed_at
) values
  (
    '26000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'camera-listings/26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000002.png',
    '26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000002.png',
    'Catalog race photo A',
    0,
    'image/png',
    3,
    decode(repeat('a', 64), 'hex'),
    'published',
    statement_timestamp(),
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '26000000-0000-4000-8000-000000000003',
    '26000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'camera-listings/26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000003.png',
    '26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000003.png',
    'Catalog race photo B',
    1,
    'image/png',
    3,
    decode(repeat('b', 64), 'hex'),
    'published',
    statement_timestamp(),
    statement_timestamp(),
    statement_timestamp()
  );

insert into public.camera_photos (
  id, camera_id, object_path, alt_text, sort_position
)
select id, camera_id, public_object_path, alt_text, sort_position
from private.catalog_photo_publications
where camera_id = '26000000-0000-4000-8000-000000000001';
SQL

cat >"$catalog_archive_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.prepare_catalog_photo_archive(
  '26000000-0000-4000-8000-000000000002',
  '26000000-0000-4000-8000-000000000004'
);
\! touch "$catalog_archive_ready_file"
\! while [[ ! -f "$catalog_archive_release_file" ]]; do sleep 0.025; done
commit;
SQL

cat >"$catalog_archive_b_sql" <<SQL
\set ON_ERROR_STOP off
\set VERBOSITY terse
set application_name = '$catalog_archive_b_application_name';
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.prepare_catalog_photo_archive(
  '26000000-0000-4000-8000-000000000003',
  '26000000-0000-4000-8000-000000000005'
);
\if :ERROR
rollback;
\else
commit;
\endif
SQL

"$postgres_bin/psql" "$database_url" -f "$catalog_archive_a_sql" >"$catalog_archive_a_log" 2>&1 &
catalog_archive_a_pid=$!

for _ in {1..200}; do
  [[ -f "$catalog_archive_ready_file" ]] && break
  if ! kill -0 "$catalog_archive_a_pid" 2>/dev/null; then
    wait "$catalog_archive_a_pid" || true
    cat "$catalog_archive_a_log" >&2
    echo "catalog archive A exited before reaching its transaction barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$catalog_archive_ready_file" ]]; then
  cat "$catalog_archive_a_log" >&2
  echo "timed out waiting for catalog archive transaction barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$catalog_archive_b_sql" >"$catalog_archive_b_log" 2>&1 &
catalog_archive_b_pid=$!

catalog_archive_lock_observed="false"
for _ in {1..200}; do
  if ! kill -0 "$catalog_archive_b_pid" 2>/dev/null; then
    wait "$catalog_archive_b_pid" || true
    cat "$catalog_archive_b_log" >&2
    cat "$catalog_archive_a_log" >&2
    echo "catalog archive B exited before PostgreSQL reported its row lock wait" >&2
    exit 1
  fi

  if [[ "$("$postgres_bin/psql" "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = '$catalog_archive_b_application_name'
        and wait_event_type = 'Lock'
        and wait_event = 'transactionid'
    );
  ")" == "t" ]]; then
    catalog_archive_lock_observed="true"
    break
  fi
  sleep 0.025
done

if [[ "$catalog_archive_lock_observed" != "true" ]]; then
  cat "$catalog_archive_b_log" >&2
  cat "$catalog_archive_a_log" >&2
  echo "catalog archive B did not wait on the serialized camera row" >&2
  exit 1
fi

touch "$catalog_archive_release_file"
wait "$catalog_archive_a_pid"
catalog_archive_a_pid=""
wait "$catalog_archive_b_pid"
catalog_archive_b_pid=""

if ! grep -q "a published camera must retain at least one active photo" "$catalog_archive_b_log"; then
  cat "$catalog_archive_b_log" >&2
  echo "second concurrent catalog archive did not fail the last-photo precondition" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (
    select count(*)
    from public.camera_photos
    where camera_id = '26000000-0000-4000-8000-000000000001'
      and archived_at is null
  ) <> 1 then
    raise exception 'concurrent catalog archives did not preserve one active photo';
  end if;
end;
$$;
SQL

echo "ok - concurrent catalog archives preserve one active photo"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit
) values (
  '26000000-0000-4000-8000-000000000006',
  'catalog-publish-archive-race',
  'CATALOG-PUBLISH-RACE-SERIAL',
  'Catalog Publish Archive Race Camera',
  'Concurrency-only guarded publication fixture.',
  'draft',
  1000,
  3000
);

insert into private.catalog_photo_publications (
  id, camera_id, created_by, staging_object_path, public_object_path,
  alt_text, sort_position, expected_media_type, expected_byte_size,
  expected_sha256, status, source_verified_at, destination_verified_at,
  staging_removed_at
) values (
  '26000000-0000-4000-8000-000000000007',
  '26000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000001',
  'camera-listings/26000000-0000-4000-8000-000000000006/26000000-0000-4000-8000-000000000007.png',
  '26000000-0000-4000-8000-000000000006/26000000-0000-4000-8000-000000000007.png',
  'Catalog publish archive race photo',
  0,
  'image/png',
  3,
  decode(repeat('c', 64), 'hex'),
  'published',
  statement_timestamp(),
  statement_timestamp(),
  statement_timestamp()
);

insert into public.camera_photos (id, camera_id, object_path, alt_text, sort_position)
select id, camera_id, public_object_path, alt_text, sort_position
from private.catalog_photo_publications
where id = '26000000-0000-4000-8000-000000000007';

insert into storage.objects (bucket_id, name, owner)
values (
  'camera-listings',
  '26000000-0000-4000-8000-000000000006/26000000-0000-4000-8000-000000000007.png',
  '20000000-0000-4000-8000-000000000001'
);
SQL

cat >"$catalog_publish_archive_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.prepare_catalog_photo_archive(
  '26000000-0000-4000-8000-000000000007',
  '26000000-0000-4000-8000-000000000008'
);
\! touch "$catalog_publish_ready_file"
\! while [[ ! -f "$catalog_publish_release_file" ]]; do sleep 0.025; done
commit;
SQL

cat >"$catalog_publish_sql" <<SQL
\set ON_ERROR_STOP off
\set VERBOSITY terse
set application_name = '$catalog_publish_application_name';
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.publish_camera(
  '26000000-0000-4000-8000-000000000006',
  '26000000-0000-4000-8000-000000000009'
);
\if :ERROR
rollback;
\else
commit;
\endif
SQL

"$postgres_bin/psql" "$database_url" -f "$catalog_publish_archive_sql" >"$catalog_publish_archive_log" 2>&1 &
catalog_publish_archive_pid=$!

for _ in {1..200}; do
  [[ -f "$catalog_publish_ready_file" ]] && break
  if ! kill -0 "$catalog_publish_archive_pid" 2>/dev/null; then
    wait "$catalog_publish_archive_pid" || true
    cat "$catalog_publish_archive_log" >&2
    echo "catalog publish/archive fixture exited before its barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$catalog_publish_ready_file" ]]; then
  cat "$catalog_publish_archive_log" >&2
  echo "timed out waiting for catalog publish/archive transaction barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$catalog_publish_sql" >"$catalog_publish_log" 2>&1 &
catalog_publish_pid=$!

publish_lock_observed="false"
for _ in {1..200}; do
  if ! kill -0 "$catalog_publish_pid" 2>/dev/null; then
    wait "$catalog_publish_pid" || true
    cat "$catalog_publish_log" >&2
    echo "guarded camera publish exited before its lock wait" >&2
    exit 1
  fi
  if [[ "$("$postgres_bin/psql" "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select exists (
      select 1 from pg_catalog.pg_stat_activity
      where application_name = '$catalog_publish_application_name'
        and wait_event_type = 'Lock'
        and wait_event = 'transactionid'
    );
  ")" == "t" ]]; then
    publish_lock_observed="true"
    break
  fi
  sleep 0.025
done

if [[ "$publish_lock_observed" != "true" ]]; then
  cat "$catalog_publish_log" >&2
  cat "$catalog_publish_archive_log" >&2
  echo "guarded camera publish did not serialize on the camera row" >&2
  exit 1
fi

touch "$catalog_publish_release_file"
wait "$catalog_publish_archive_pid"
catalog_publish_archive_pid=""
wait "$catalog_publish_pid"
catalog_publish_pid=""

if ! grep -q "camera publication requires an active verified listing photo" "$catalog_publish_log"; then
  cat "$catalog_publish_log" >&2
  echo "guarded camera publish did not reject the concurrent photo archive" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from public.cameras
    where id = '26000000-0000-4000-8000-000000000006'
      and status = 'draft'
      and published_at is null
  ) then
    raise exception 'archive/publish race exposed an incomplete camera';
  end if;
end;
$$;
SQL

echo "ok - guarded camera publication loses safely to a concurrent last-photo archive"

cat >"$contract_sign_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
select *
from api.sign_contract(
  (
    select current_contract_version_id
    from public.bookings
    where id = '23000000-0000-4000-8000-000000000001'
  ),
  true
);
\! touch "$contract_sign_ready_file"
select pg_sleep(2);
commit;
SQL

cat >"$contract_supersede_sql" <<'SQL'
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.supersede_contract(
  '23000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  '2099-08-01 00:00:00+00',
  '2099-08-03 00:00:00+00'
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$contract_sign_sql" >"$contract_sign_log" 2>&1 &
contract_sign_pid=$!

for _ in {1..200}; do
  [[ -f "$contract_sign_ready_file" ]] && break
  if ! kill -0 "$contract_sign_pid" 2>/dev/null; then
    wait "$contract_sign_pid" || true
    cat "$contract_sign_log" >&2
    echo "contract signer exited before its transaction barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$contract_sign_ready_file" ]]; then
  cat "$contract_sign_log" >&2
  echo "timed out waiting for contract signing transaction barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$contract_supersede_sql" >"$contract_supersede_log" 2>&1
wait "$contract_sign_pid"
contract_sign_pid=""

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  current_version uuid;
begin
  select current_contract_version_id into current_version
  from public.bookings
  where id = '23000000-0000-4000-8000-000000000001';

  if not exists (
    select 1
    from public.bookings
    where id = '23000000-0000-4000-8000-000000000001'
      and state = 'CONTRACT_PENDING'
      and camera_id = '21000000-0000-4000-8000-000000000002'
      and approval_deadline_at = approved_at + interval '24 hours'
  )
    or (select count(*) from public.contract_versions
        where booking_id = '23000000-0000-4000-8000-000000000001') <> 2
    or (select count(*) from public.contract_signatures as signature
        join public.contract_versions as version
          on version.id = signature.contract_version_id
        where version.booking_id = '23000000-0000-4000-8000-000000000001') <> 1
    or not exists (
      select 1
      from public.contract_versions as version
      join public.contract_signatures as signature
        on signature.contract_version_id = version.id
      where version.booking_id = '23000000-0000-4000-8000-000000000001'
        and version.version_no = 1
        and version.status = 'superseded'
    )
    or not exists (
      select 1
      from public.contract_versions
      where id = current_version
        and version_no = 2
        and status = 'issued'
    )
    or exists (
      select 1 from public.contract_signatures
      where contract_version_id = current_version
    )
  then
    raise exception 'sign/supersede race did not serialize to one signed historical and one unsigned current version';
  end if;
end;
$$;
SQL

echo "ok - signing and supersession serialize without losing immutable history"

cat >"$contract_retry_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
select created
from api.sign_contract(
  (
    select current_contract_version_id
    from public.bookings
    where id = '23000000-0000-4000-8000-000000000001'
  ),
  true
);
\! touch "$contract_retry_ready_file"
select pg_sleep(2);
commit;
SQL

cat >"$contract_retry_b_sql" <<'SQL'
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
select created
from api.sign_contract(
  (
    select current_contract_version_id
    from public.bookings
    where id = '23000000-0000-4000-8000-000000000001'
  ),
  true
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$contract_retry_a_sql" >"$contract_retry_a_log" 2>&1 &
contract_retry_a_pid=$!

for _ in {1..200}; do
  [[ -f "$contract_retry_ready_file" ]] && break
  if ! kill -0 "$contract_retry_a_pid" 2>/dev/null; then
    wait "$contract_retry_a_pid" || true
    cat "$contract_retry_a_log" >&2
    echo "first contract retry exited before its transaction barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$contract_retry_ready_file" ]]; then
  cat "$contract_retry_a_log" >&2
  echo "timed out waiting for first contract retry barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$contract_retry_b_sql" >"$contract_retry_b_log" 2>&1
wait "$contract_retry_a_pid"
contract_retry_a_pid=""

if ! grep -Fxq 'f' "$contract_retry_b_log"; then
  cat "$contract_retry_a_log" >&2
  cat "$contract_retry_b_log" >&2
  echo "concurrent exact-version retry did not return the existing signature" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1
    from public.bookings
    where id = '23000000-0000-4000-8000-000000000001'
      and state = 'TO_PAY'
  )
    or (select count(*) from public.contract_signatures as signature
        join public.contract_versions as version
          on version.id = signature.contract_version_id
        where version.booking_id = '23000000-0000-4000-8000-000000000001'
          and version.version_no = 2) <> 1
  then
    raise exception 'concurrent exact-version signing created a duplicate or lost the transition';
  end if;
end;
$$;
SQL

echo "ok - concurrent exact-version signing retry is idempotent"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set constraints all deferred;

insert into public.bookings (
  id, renter_id, camera_id, state, pickup_at, return_at,
  intended_use, expected_location, requested_at, approved_at,
  approval_deadline_at, approved_by, billable_days_snapshot,
  daily_rate_snapshot, rental_amount, security_deposit_amount,
  current_contract_version_id
) values
  (
    '29000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    'TO_PAY',
    '2101-01-01 00:00:00+00',
    '2101-01-03 00:00:00+00',
    'Concurrent payment submission',
    'Makati City',
    statement_timestamp(),
    statement_timestamp(),
    statement_timestamp() + interval '24 hours',
    '20000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '29100000-0000-4000-8000-000000000001'
  ),
  (
    '29000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    'PAYMENT_REVIEW',
    '2101-02-01 00:00:00+00',
    '2101-02-03 00:00:00+00',
    'Concurrent payment decision',
    'Taguig City',
    statement_timestamp(),
    statement_timestamp(),
    statement_timestamp() + interval '24 hours',
    '20000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '29100000-0000-4000-8000-000000000002'
  );

insert into public.contract_versions (
  id, booking_id, version_no, template_id, snapshot,
  snapshot_schema_version, content_sha256, issued_by
) values
  (
    '29100000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001',
    1,
    '22000000-0000-4000-8000-000000000001',
    '{"pricing":{"rental_amount":2000,"security_deposit":4000,"total_due":6000,"currency":"PHP"}}'::jsonb,
    1,
    extensions.digest(convert_to('{"pricing":{"rental_amount":2000,"security_deposit":4000,"total_due":6000,"currency":"PHP"}}'::jsonb::text, 'UTF8'), 'sha256'),
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '29100000-0000-4000-8000-000000000002',
    '29000000-0000-4000-8000-000000000002',
    1,
    '22000000-0000-4000-8000-000000000001',
    '{"pricing":{"rental_amount":2000,"security_deposit":4000,"total_due":6000,"currency":"PHP"}}'::jsonb,
    1,
    extensions.digest(convert_to('{"pricing":{"rental_amount":2000,"security_deposit":4000,"total_due":6000,"currency":"PHP"}}'::jsonb::text, 'UTF8'), 'sha256'),
    '20000000-0000-4000-8000-000000000001'
  );

insert into public.contract_signatures (
  contract_version_id, renter_id, signature_intent, attestation_text,
  acknowledged_content_sha256
)
select
  version.id,
  '20000000-0000-4000-8000-000000000002',
  'electronic_signature',
  'I have reviewed and agree to this exact rental contract version.',
  version.content_sha256
from public.contract_versions as version
where version.id in (
  '29100000-0000-4000-8000-000000000001',
  '29100000-0000-4000-8000-000000000002'
);

insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id, actor_type, reason_code
)
select fixture.booking_id, fixture.from_state, fixture.to_state,
       fixture.actor_user_id, fixture.actor_type, fixture.reason_code
from (values
  ('29000000-0000-4000-8000-000000000001'::uuid, null::public.booking_state, 'FOR_REVIEW'::public.booking_state, '20000000-0000-4000-8000-000000000002'::uuid, 'renter'::public.booking_actor_type, 'booking_requested'),
  ('29000000-0000-4000-8000-000000000001'::uuid, 'FOR_REVIEW'::public.booking_state, 'CONTRACT_PENDING'::public.booking_state, '20000000-0000-4000-8000-000000000001'::uuid, 'admin'::public.booking_actor_type, 'booking_approved'),
  ('29000000-0000-4000-8000-000000000001'::uuid, 'CONTRACT_PENDING'::public.booking_state, 'TO_PAY'::public.booking_state, '20000000-0000-4000-8000-000000000002'::uuid, 'renter'::public.booking_actor_type, 'contract_signed'),
  ('29000000-0000-4000-8000-000000000002'::uuid, null::public.booking_state, 'FOR_REVIEW'::public.booking_state, '20000000-0000-4000-8000-000000000002'::uuid, 'renter'::public.booking_actor_type, 'booking_requested'),
  ('29000000-0000-4000-8000-000000000002'::uuid, 'FOR_REVIEW'::public.booking_state, 'CONTRACT_PENDING'::public.booking_state, '20000000-0000-4000-8000-000000000001'::uuid, 'admin'::public.booking_actor_type, 'booking_approved'),
  ('29000000-0000-4000-8000-000000000002'::uuid, 'CONTRACT_PENDING'::public.booking_state, 'TO_PAY'::public.booking_state, '20000000-0000-4000-8000-000000000002'::uuid, 'renter'::public.booking_actor_type, 'contract_signed'),
  ('29000000-0000-4000-8000-000000000002'::uuid, 'TO_PAY'::public.booking_state, 'PAYMENT_REVIEW'::public.booking_state, '20000000-0000-4000-8000-000000000002'::uuid, 'renter'::public.booking_actor_type, 'payment_submitted')
) as fixture(booking_id, from_state, to_state, actor_user_id, actor_type, reason_code);

insert into public.payment_transactions (
  id, booking_id, direction, amount, reference, counterparty_display_name,
  submitted_by, submission_attempt_id, contract_version_id,
  recipient_config_version, recipient_name_snapshot, recipient_account_snapshot
) values (
  '29200000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000002',
  'incoming',
  6000,
  'PAYMENT-DECISION-RACE',
  'Race Renter A',
  '20000000-0000-4000-8000-000000000002',
  '29200000-0000-4000-8000-000000000002',
  '29100000-0000-4000-8000-000000000002',
  1,
  'Race Recipient',
  '09171234567'
);

insert into public.payment_proofs (
  id, transaction_id, owner_user_id, object_path, media_type, byte_size,
  sha256, finalized_at
) values (
  '29200000-0000-4000-8000-000000000003',
  '29200000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '29200000-0000-4000-8000-000000000003/proof.png',
  'image/png',
  9,
  extensions.digest(convert_to('payment-decision-proof', 'UTF8'), 'sha256'),
  statement_timestamp()
);

set constraints all immediate;
commit;

set role authenticated;
set "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.configure_gcash_recipient(
  'Race Recipient',
  '09171234567',
  true,
  '29300000-0000-4000-8000-000000000001'
);
reset role;
SQL

cat >"$payment_submit_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
select api.submit_payment(
  '29000000-0000-4000-8000-000000000001',
  '29300000-0000-4000-8000-000000000002',
  'PAYMENT-SUBMIT-RACE'
);
\! touch "$payment_submit_ready_file"
select pg_sleep(1);
commit;
SQL

cat >"$payment_submit_b_sql" <<'SQL'
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
select api.submit_payment(
  '29000000-0000-4000-8000-000000000001',
  '29300000-0000-4000-8000-000000000002',
  'PAYMENT SUBMIT RACE'
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$payment_submit_a_sql" >"$payment_submit_a_log" 2>&1 &
payment_submit_a_pid=$!

for _ in {1..200}; do
  [[ -f "$payment_submit_ready_file" ]] && break
  if ! kill -0 "$payment_submit_a_pid" 2>/dev/null; then
    wait "$payment_submit_a_pid" || true
    cat "$payment_submit_a_log" >&2
    echo "first payment submission exited before its lock barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$payment_submit_ready_file" ]]; then
  cat "$payment_submit_a_log" >&2
  echo "timed out waiting for payment submission barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$payment_submit_b_sql" >"$payment_submit_b_log" 2>&1
wait "$payment_submit_a_pid"
payment_submit_a_pid=""

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select count(*) from public.payment_transactions where booking_id = '29000000-0000-4000-8000-000000000001' and direction = 'incoming') <> 1
    or not exists (
      select 1 from public.bookings
      where id = '29000000-0000-4000-8000-000000000001'
        and state = 'PAYMENT_REVIEW'
    )
  then
    raise exception 'concurrent identical submission retry created duplicates or lost state';
  end if;
end;
$$;
SQL

echo "ok - concurrent identical payment submission retry is idempotent"

cat >"$payment_decision_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.verify_payment(
  '29200000-0000-4000-8000-000000000001',
  '29200000-0000-4000-8000-000000000003',
  6000,
  'PAYMENT DECISION RACE',
  true,
  '29300000-0000-4000-8000-000000000003'
);
\! touch "$payment_decision_ready_file"
select pg_sleep(1);
commit;
SQL

cat >"$payment_decision_b_sql" <<'SQL'
\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.reject_payment(
  '29200000-0000-4000-8000-000000000001',
  'unconfirmed_transfer',
  '29300000-0000-4000-8000-000000000004'
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$payment_decision_a_sql" >"$payment_decision_a_log" 2>&1 &
payment_decision_a_pid=$!

for _ in {1..200}; do
  [[ -f "$payment_decision_ready_file" ]] && break
  if ! kill -0 "$payment_decision_a_pid" 2>/dev/null; then
    wait "$payment_decision_a_pid" || true
    cat "$payment_decision_a_log" >&2
    echo "payment verification exited before its lock barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$payment_decision_ready_file" ]]; then
  cat "$payment_decision_a_log" >&2
  echo "timed out waiting for payment decision barrier" >&2
  exit 1
fi

set +e
"$postgres_bin/psql" "$database_url" -f "$payment_decision_b_sql" >"$payment_decision_b_log" 2>&1
payment_decision_b_status=$?
set -e
wait "$payment_decision_a_pid"
payment_decision_a_pid=""

if [[ "$payment_decision_b_status" -eq 0 ]] || ! grep -Eq '40001|payment_rejection_retry_conflict' "$payment_decision_b_log"; then
  cat "$payment_decision_a_log" >&2
  cat "$payment_decision_b_log" >&2
  echo "competing payment rejection did not lose with an explicit stale outcome" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from public.bookings
    where id = '29000000-0000-4000-8000-000000000002'
      and state = 'CONFIRMED'
  )
    or not exists (
      select 1 from public.payment_transactions
      where id = '29200000-0000-4000-8000-000000000001'
        and status = 'verified'
    )
    or (select count(*) from public.payment_allocations where transaction_id = '29200000-0000-4000-8000-000000000001') <> 2
    or exists (
      select 1 from private.audit_logs
      where entity_type = 'payment_transaction'
        and entity_id = '29200000-0000-4000-8000-000000000001'
        and action = 'reject_payment'
        and outcome = 'success'
    )
  then
    raise exception 'competing payment decisions did not preserve one atomic winner';
  end if;
end;
$$;
SQL

echo "ok - competing payment verify/reject decisions preserve one atomic winner"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set constraints all deferred;

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values (
  '2a100000-0000-4000-8000-000000000001',
  'pickup-race-camera',
  'PRIVATE-PICKUP-RACE-SERIAL',
  'Pickup Race Camera',
  'Camera for the separate-session pickup race.',
  'published',
  1000,
  4000,
  statement_timestamp()
);

insert into public.camera_accessories (
  id, camera_id, name, quantity, sort_position
) values (
  '2a200000-0000-4000-8000-000000000001',
  '2a100000-0000-4000-8000-000000000001',
  'Race battery',
  1,
  10
);

insert into public.bookings (
  id, renter_id, camera_id, state, pickup_at, return_at,
  intended_use, expected_location, requested_at, approved_at,
  approval_deadline_at, approved_by, billable_days_snapshot,
  daily_rate_snapshot, rental_amount, security_deposit_amount,
  current_contract_version_id
) values (
  '2a000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '2a100000-0000-4000-8000-000000000001',
  'CONFIRMED',
  statement_timestamp() - interval '10 minutes',
  statement_timestamp() + interval '47 hours 50 minutes',
  'Concurrent pickup race',
  'Private pickup counter',
  statement_timestamp() - interval '3 days',
  statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '1 day',
  '20000000-0000-4000-8000-000000000001',
  2,
  1000,
  2000,
  4000,
  '2a300000-0000-4000-8000-000000000001'
);

insert into public.contract_versions (
  id, booking_id, version_no, template_id, snapshot,
  snapshot_schema_version, content_sha256, issued_at, issued_by
) values (
  '2a300000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000001',
  1,
  '22000000-0000-4000-8000-000000000001',
  '{
    "booking":{"id":"2a000000-0000-4000-8000-000000000001"},
    "renter":{"legal_name":"Race Renter A"},
    "camera":{
      "id":"2a100000-0000-4000-8000-000000000001",
      "serial_number":"PRIVATE-PICKUP-RACE-SERIAL",
      "accessories":[{
        "id":"2a200000-0000-4000-8000-000000000001",
        "name":"Race battery",
        "quantity":1
      }]
    }
  }'::jsonb,
  1,
  extensions.digest(convert_to('pickup-race-contract', 'UTF8'), 'sha256'),
  statement_timestamp() - interval '2 days',
  '20000000-0000-4000-8000-000000000001'
);

insert into public.contract_signatures (
  contract_version_id, renter_id, signature_intent,
  attestation_text, signed_at, acknowledged_content_sha256
) values (
  '2a300000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'electronic_signature',
  'I agree to this exact race contract.',
  statement_timestamp() - interval '1 day',
  extensions.digest(convert_to('pickup-race-contract', 'UTF8'), 'sha256')
);

insert into public.payment_transactions (
  id, booking_id, direction, status, amount, reference,
  counterparty_display_name, submitted_at, submitted_by, decided_at,
  decided_by, submission_attempt_id, contract_version_id,
  recipient_config_version, recipient_name_snapshot,
  recipient_account_snapshot
) values (
  '2a400000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000001',
  'incoming',
  'verified',
  6000,
  'PICKUP-RACE-PAYMENT',
  'Race Renter A',
  statement_timestamp() - interval '1 day',
  '20000000-0000-4000-8000-000000000002',
  statement_timestamp() - interval '12 hours',
  '20000000-0000-4000-8000-000000000001',
  '2a400000-0000-4000-8000-000000000002',
  '2a300000-0000-4000-8000-000000000001',
  1,
  'Approved Recipient',
  '09171234567'
);

insert into public.payment_allocations (
  transaction_id, booking_id, kind, amount
) values
  (
    '2a400000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001',
    'rental_payment',
    2000
  ),
  (
    '2a400000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001',
    'security_deposit',
    4000
  );

insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id,
  actor_type, reason_code, occurred_at
) values
  (
    '2a000000-0000-4000-8000-000000000001',
    null,
    'FOR_REVIEW',
    '20000000-0000-4000-8000-000000000002',
    'renter',
    'booking_requested',
    statement_timestamp() - interval '3 days'
  ),
  (
    '2a000000-0000-4000-8000-000000000001',
    'PAYMENT_REVIEW',
    'CONFIRMED',
    '20000000-0000-4000-8000-000000000001',
    'admin',
    'payment_verified',
    statement_timestamp() - interval '12 hours'
  );

set constraints all immediate;
commit;
SQL

cat >"$pickup_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.complete_pickup(
  '2a000000-0000-4000-8000-000000000001',
  statement_timestamp(), true, true, true,
  'PRIVATE-PICKUP-RACE-SERIAL',
  array['2a200000-0000-4000-8000-000000000001']::uuid[],
  'No visible damage; clean and functional.',
  '',
  '2a500000-0000-4000-8000-000000000001'
);
\! touch "$pickup_ready_file"
select pg_sleep(1);
commit;
SQL

cat >"$pickup_b_sql" <<'SQL'
\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.complete_pickup(
  '2a000000-0000-4000-8000-000000000001',
  statement_timestamp(), true, true, true,
  'PRIVATE-PICKUP-RACE-SERIAL',
  array['2a200000-0000-4000-8000-000000000001']::uuid[],
  'No visible damage; clean and functional.',
  '',
  '2a500000-0000-4000-8000-000000000002'
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$pickup_a_sql" >"$pickup_a_log" 2>&1 &
pickup_a_pid=$!

for _ in {1..200}; do
  [[ -f "$pickup_ready_file" ]] && break
  if ! kill -0 "$pickup_a_pid" 2>/dev/null; then
    wait "$pickup_a_pid" || true
    cat "$pickup_a_log" >&2
    echo "first pickup exited before its lock barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$pickup_ready_file" ]]; then
  cat "$pickup_a_log" >&2
  echo "timed out waiting for pickup barrier" >&2
  exit 1
fi

set +e
"$postgres_bin/psql" "$database_url" -f "$pickup_b_sql" >"$pickup_b_log" 2>&1
pickup_b_status=$?
set -e
wait "$pickup_a_pid"
pickup_a_pid=""

if [[ "$pickup_b_status" -eq 0 ]] || ! grep -Eq '40001|pickup_stale_booking_state' "$pickup_b_log"; then
  cat "$pickup_a_log" >&2
  cat "$pickup_b_log" >&2
  echo "competing pickup did not lose with an explicit stale outcome" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from public.bookings
    where id = '2a000000-0000-4000-8000-000000000001'
      and state = 'ACTIVE'
  )
    or (select count(*) from public.handoffs where booking_id = '2a000000-0000-4000-8000-000000000001' and type = 'pickup') <> 1
    or (select count(*) from public.condition_reports as report join public.handoffs as handoff on handoff.id = report.handoff_id where handoff.booking_id = '2a000000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.booking_state_history where booking_id = '2a000000-0000-4000-8000-000000000001' and to_state = 'ACTIVE') <> 1
  then
    raise exception 'competing pickups created partial or duplicate state';
  end if;
end;
$$;
SQL

echo "ok - competing pickups produce one atomic ACTIVE handoff"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
set role authenticated;
set "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';

do $$
declare
  created jsonb;
begin
  created := api.create_condition_photo_upload_intent(
    '2a600000-0000-4000-8000-000000000001',
    (
      select report.id
      from public.condition_reports as report
      join public.handoffs as handoff on handoff.id = report.handoff_id
      where handoff.booking_id = '2a000000-0000-4000-8000-000000000001'
        and handoff.type = 'pickup'
    ),
    'image/jpeg',
    4,
    repeat('ab', 32),
    '2a600000-0000-4000-8000-000000000002'
  );

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'condition-evidence',
    created ->> 'object_path',
    '20000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"4"}'::jsonb
  );
end;
$$;

reset role;
SQL

cat >"$pickup_photo_create_sql" <<SQL
\set ON_ERROR_STOP on
begin;
select id
from public.bookings
where id = '2a000000-0000-4000-8000-000000000001'
for update;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
\! touch "$pickup_photo_ready_file"
\! barrier_count=0; while [ ! -f "$pickup_photo_release_file" ] && [ "\$barrier_count" -lt 400 ]; do sleep 0.025; barrier_count=\$((barrier_count + 1)); done
select api.create_condition_photo_upload_intent(
  '2a600000-0000-4000-8000-000000000001',
  (
    select report.id
    from public.condition_reports as report
    join public.handoffs as handoff on handoff.id = report.handoff_id
    where handoff.booking_id = '2a000000-0000-4000-8000-000000000001'
      and handoff.type = 'pickup'
  ),
  'image/jpeg',
  4,
  repeat('ab', 32),
  '2a600000-0000-4000-8000-000000000003'
);
commit;
SQL

cat >"$pickup_photo_finalize_sql" <<SQL
\set ON_ERROR_STOP on
set application_name = '$pickup_photo_finalize_application_name';
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.finalize_condition_photo_upload(
  '2a600000-0000-4000-8000-000000000001',
  'image/jpeg',
  4,
  repeat('ab', 32),
  '2a600000-0000-4000-8000-000000000004'
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$pickup_photo_create_sql" >"$pickup_photo_create_log" 2>&1 &
pickup_photo_create_pid=$!

for _ in {1..200}; do
  [[ -f "$pickup_photo_ready_file" ]] && break
  if ! kill -0 "$pickup_photo_create_pid" 2>/dev/null; then
    wait "$pickup_photo_create_pid" || true
    cat "$pickup_photo_create_log" >&2
    echo "condition-photo create retry exited before its booking-row barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$pickup_photo_ready_file" ]]; then
  cat "$pickup_photo_create_log" >&2
  echo "timed out waiting for condition-photo create retry barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$pickup_photo_finalize_sql" >"$pickup_photo_finalize_log" 2>&1 &
pickup_photo_finalize_pid=$!

pickup_photo_finalize_wait_observed="false"
for _ in {1..200}; do
  if ! kill -0 "$pickup_photo_finalize_pid" 2>/dev/null; then
    wait "$pickup_photo_finalize_pid" || true
    cat "$pickup_photo_finalize_log" >&2
    echo "condition-photo finalization exited before its booking-row wait" >&2
    exit 1
  fi

  if [[ "$("$postgres_bin/psql" "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select exists (
      select 1 from pg_catalog.pg_stat_activity
      where application_name = '$pickup_photo_finalize_application_name'
        and wait_event_type = 'Lock'
        and wait_event = 'transactionid'
    );
  ")" == "t" ]]; then
    pickup_photo_finalize_wait_observed="true"
    break
  fi
  sleep 0.025
done

if [[ "$pickup_photo_finalize_wait_observed" != "true" ]]; then
  cat "$pickup_photo_finalize_log" >&2
  cat "$pickup_photo_create_log" >&2
  echo "condition-photo finalization did not wait on the booking row" >&2
  exit 1
fi

touch "$pickup_photo_release_file"
wait "$pickup_photo_create_pid"
pickup_photo_create_pid=""
wait "$pickup_photo_finalize_pid"
pickup_photo_finalize_pid=""

if grep -Fq '40P01' "$pickup_photo_create_log" "$pickup_photo_finalize_log"; then
  cat "$pickup_photo_create_log" >&2
  cat "$pickup_photo_finalize_log" >&2
  echo "condition-photo create/finalize lock order deadlocked" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1
    from private.condition_photo_upload_intents
    where id = '2a600000-0000-4000-8000-000000000001'
      and status = 'finalized'
  )
    or (
      select count(*)
      from public.condition_photos
      where upload_intent_id = '2a600000-0000-4000-8000-000000000001'
    ) <> 1
  then
    raise exception 'condition-photo create/finalize race did not commit one photo';
  end if;
end;
$$;
SQL

echo "ok - condition-photo create/finalize share one deadlock-free lock order"

cat >"$return_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.record_return_inspection(
  '2a000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  'PRIVATE-PICKUP-RACE-SERIAL',
  'Returned clean after the concurrent lifecycle test.',
  '[{"id":"2a200000-0000-4000-8000-000000000001","status":"returned"}]'::jsonb,
  false,
  '',
  '2a700000-0000-4000-8000-000000000001'
);
\! touch "$return_ready_file"
select pg_sleep(1);
commit;
SQL

cat >"$return_b_sql" <<'SQL'
\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.record_return_inspection(
  '2a000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  'PRIVATE-PICKUP-RACE-SERIAL',
  'Returned clean after the concurrent lifecycle test.',
  '[{"id":"2a200000-0000-4000-8000-000000000001","status":"returned"}]'::jsonb,
  false,
  '',
  '2a700000-0000-4000-8000-000000000002'
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$return_a_sql" >"$return_a_log" 2>&1 &
return_a_pid=$!

for _ in {1..200}; do
  [[ -f "$return_ready_file" ]] && break
  if ! kill -0 "$return_a_pid" 2>/dev/null; then
    wait "$return_a_pid" || true
    cat "$return_a_log" >&2
    echo "first return exited before its lock barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$return_ready_file" ]]; then
  cat "$return_a_log" >&2
  echo "timed out waiting for return barrier" >&2
  exit 1
fi

set +e
"$postgres_bin/psql" "$database_url" -f "$return_b_sql" >"$return_b_log" 2>&1
return_b_status=$?
set -e
wait "$return_a_pid"
return_a_pid=""

if [[ "$return_b_status" -eq 0 ]] || ! grep -Eq '40001|return_stale_booking_state' "$return_b_log"; then
  cat "$return_a_log" >&2
  cat "$return_b_log" >&2
  echo "competing return did not lose with an explicit stale outcome" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from public.bookings
    where id = '2a000000-0000-4000-8000-000000000001'
      and state = 'RETURN_REVIEW'
  )
    or (select count(*) from public.handoffs where booking_id = '2a000000-0000-4000-8000-000000000001' and type = 'return') <> 1
    or (select count(*) from public.condition_reports as report join public.handoffs as handoff on handoff.id = report.handoff_id where handoff.booking_id = '2a000000-0000-4000-8000-000000000001' and handoff.type = 'return') <> 1
    or (select count(*) from public.booking_state_history where booking_id = '2a000000-0000-4000-8000-000000000001' and to_state = 'RETURN_REVIEW') <> 1
  then
    raise exception 'competing returns created partial or duplicate state';
  end if;
end;
$$;
SQL

echo "ok - competing returns produce one atomic RETURN_REVIEW handoff"

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values (
  'b1100000-0000-4000-8000-000000000001',
  'handoff-policy-race',
  'PRIVATE-HANDOFF-RACE-SERIAL',
  'Handoff Policy Race',
  'Separate-session handoff policy fixture.',
  'published',
  1000,
  4000,
  statement_timestamp()
);

begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.replace_camera_handoff_policy(
  'b1100000-0000-4000-8000-000000000001', 0,
  'Cebu City', 'provider:cebu-city', 'PH', 10.31570, 123.88540,
  array[1, 3]::smallint[], array['09:00']::time[], true
);
commit;
SQL

cat >"$handoff_policy_a_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.replace_camera_handoff_policy(
  'b1100000-0000-4000-8000-000000000001', 1,
  'Mandaue City', 'provider:mandaue-city', 'PH', 10.32360, 123.92230,
  array[2, 4]::smallint[], array['10:00']::time[], true
);
\! touch "$handoff_policy_ready_file"
select pg_sleep(1);
commit;
SQL

cat >"$handoff_policy_b_sql" <<'SQL'
\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.replace_camera_handoff_policy(
  'b1100000-0000-4000-8000-000000000001', 1,
  'Lapu-Lapu City', 'provider:lapu-lapu-city', 'PH', 10.31030, 123.94940,
  array[1, 5]::smallint[], array['11:00']::time[], true
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$handoff_policy_a_sql" >"$handoff_policy_a_log" 2>&1 &
handoff_policy_a_pid=$!

for _ in {1..200}; do
  [[ -f "$handoff_policy_ready_file" ]] && break
  if ! kill -0 "$handoff_policy_a_pid" 2>/dev/null; then
    wait "$handoff_policy_a_pid" || true
    cat "$handoff_policy_a_log" >&2
    echo "first handoff policy edit exited before its lock barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$handoff_policy_ready_file" ]]; then
  cat "$handoff_policy_a_log" >&2
  echo "timed out waiting for handoff policy edit barrier" >&2
  exit 1
fi

set +e
"$postgres_bin/psql" "$database_url" -f "$handoff_policy_b_sql" >"$handoff_policy_b_log" 2>&1
handoff_policy_b_status=$?
set -e
wait "$handoff_policy_a_pid"
handoff_policy_a_pid=""

if [[ "$handoff_policy_b_status" -eq 0 ]] || ! grep -Eq '40001|handoff_policy_stale' "$handoff_policy_b_log"; then
  cat "$handoff_policy_a_log" >&2
  cat "$handoff_policy_b_log" >&2
  echo "competing handoff policy edit did not lose with an explicit stale outcome" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1
    from public.camera_handoff_policies
    where camera_id = 'b1100000-0000-4000-8000-000000000001'
      and city_label = 'Mandaue City'
      and version = 2
      and allowed_weekdays = array[2, 4]::smallint[]
  )
    or (
      select array_agg(to_char(local_time, 'HH24:MI') order by local_time)
      from public.camera_handoff_slots
      where camera_id = 'b1100000-0000-4000-8000-000000000001'
    ) <> array['10:00']::text[]
    or exists (
      select 1
      from private.camera_lender_city_anchors
      where camera_id = 'b1100000-0000-4000-8000-000000000001'
        and provider_city_id <> 'provider:mandaue-city'
    )
  then
    raise exception 'competing handoff edits produced mixed or duplicate state';
  end if;
end;
$$;
SQL

echo "ok - competing handoff policy edits produce one coherent version winner"
