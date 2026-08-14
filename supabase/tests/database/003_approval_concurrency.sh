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
for executable in initdb pg_ctl psql; do
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
session_a_pid=""
accessory_approval_pid=""
accessory_writer_pid=""
verification_approval_pid=""
verification_writer_pid=""
catalog_archive_a_pid=""
catalog_archive_b_pid=""
catalog_publish_archive_pid=""
catalog_publish_pid=""

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
    "$catalog_publish_pid"; do
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

for migration in "$repo_root"/supabase/migrations/*.sql; do
  echo "applying $(basename "$migration")"
  "$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

echo "running domain and authorization invariants"
"$postgres_bin/psql" \
  "$database_url" \
  -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/tests/database/001_domain_invariants.sql"

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

cat >"$verification_approval_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
select api.approve_booking('23000000-0000-4000-8000-000000000004');
\! touch "$verification_ready_file"
\! barrier_count=0; while [ ! -f "$verification_release_file" ] && [ "\$barrier_count" -lt 400 ]; do sleep 0.025; barrier_count=\$((barrier_count + 1)); done
commit;
SQL

cat >"$verification_writer_sql" <<SQL
\set ON_ERROR_STOP on
begin;
set application_name = '$verification_writer_application_name';
insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  decided_at,
  decided_by,
  rejection_reason,
  supersedes_id
) values (
  '25000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003',
  'rejected',
  'passport',
  statement_timestamp(),
  '20000000-0000-4000-8000-000000000001',
  'Concurrent verification decision',
  (
    select id
    from public.verification_records
    where user_id = '20000000-0000-4000-8000-000000000003'
      and status = 'verified'
  )
);
commit;
SQL

"$postgres_bin/psql" "$database_url" -f "$verification_approval_sql" >"$verification_approval_log" 2>&1 &
verification_approval_pid=$!

for _ in {1..200}; do
  [[ -f "$verification_ready_file" ]] && break
  if ! kill -0 "$verification_approval_pid" 2>/dev/null; then
    wait "$verification_approval_pid" || true
    cat "$verification_approval_log" >&2
    echo "verification approval exited before reaching its transaction barrier" >&2
    exit 1
  fi
  sleep 0.025
done

if [[ ! -f "$verification_ready_file" ]]; then
  cat "$verification_approval_log" >&2
  echo "timed out waiting for verification approval transaction barrier" >&2
  exit 1
fi

"$postgres_bin/psql" "$database_url" -f "$verification_writer_sql" >"$verification_writer_log" 2>&1 &
verification_writer_pid=$!

verification_lock_observed="false"
for _ in {1..200}; do
  if ! kill -0 "$verification_writer_pid" 2>/dev/null; then
    wait "$verification_writer_pid" || true
    cat "$verification_writer_log" >&2
    cat "$verification_approval_log" >&2
    echo "verification writer exited before PostgreSQL reported its blocked relation lock" >&2
    exit 1
  fi

  if [[ "$("$postgres_bin/psql" "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select exists (
      select 1
      from pg_catalog.pg_locks as lock
      join pg_catalog.pg_stat_activity as activity on activity.pid = lock.pid
      where activity.application_name = '$verification_writer_application_name'
        and lock.locktype = 'relation'
        and lock.relation = 'public.verification_records'::regclass
        and lock.mode = 'RowExclusiveLock'
        and not lock.granted
    );
  ")" == "t" ]]; then
    verification_lock_observed="true"
    break
  fi

  sleep 0.025
done

if [[ "$verification_lock_observed" != "true" ]]; then
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
    where activity.application_name = '$verification_writer_application_name';
  " >&2
  cat "$verification_writer_log" >&2
  cat "$verification_approval_log" >&2
  echo "PostgreSQL did not report the writer's ungranted RowExclusiveLock on verification_records" >&2
  exit 1
fi

touch "$verification_release_file"
wait "$verification_approval_pid"
verification_approval_pid=""
wait "$verification_writer_pid"
verification_writer_pid=""

"$postgres_bin/psql" "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1
    from public.bookings
    where id = '23000000-0000-4000-8000-000000000004'
      and state = 'CONTRACT_PENDING'
      and approved_at is not null
      and current_contract_version_id is not null
  )
    or (select count(*) from public.contract_versions
        where booking_id = '23000000-0000-4000-8000-000000000004') <> 1
    or (select count(*) from public.availability_blocks
        where booking_id = '23000000-0000-4000-8000-000000000004') <> 1
  then
    raise exception 'verification-stable approval did not commit one complete aggregate';
  end if;

  if not exists (
    select 1
    from public.verification_records
    where id = '25000000-0000-4000-8000-000000000001'
      and user_id = '20000000-0000-4000-8000-000000000003'
      and status = 'rejected'
  ) then
    raise exception 'verification writer did not commit after approval';
  end if;

  if (
    select status
    from public.verification_records
    where user_id = '20000000-0000-4000-8000-000000000003'
    order by submitted_at desc, id desc
    limit 1
  ) <> 'rejected' then
    raise exception 'concurrent rejected verification is not the latest decision';
  end if;
end;
$$;
SQL

echo "ok - approval stabilizes verification membership against concurrent decisions"

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
