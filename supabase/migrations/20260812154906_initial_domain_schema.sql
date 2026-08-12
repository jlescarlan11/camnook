-- CamNook MVP domain schema.
-- Policy: docs/product/mvp-rental-policy-v0.1.md

create extension if not exists btree_gist with schema extensions;

create schema if not exists api;
create schema if not exists private;

revoke all on schema api from public;
revoke all on schema private from public;

create type public.account_status as enum ('active', 'suspended');
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'expired');
create type public.camera_status as enum ('draft', 'published', 'archived');
create type public.booking_state as enum (
  'FOR_REVIEW',
  'CONTRACT_PENDING',
  'TO_PAY',
  'PAYMENT_REVIEW',
  'CONFIRMED',
  'ACTIVE',
  'RETURN_REVIEW',
  'ISSUE_REVIEW',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);
create type public.booking_actor_type as enum ('renter', 'admin', 'system');
create type public.availability_block_kind as enum ('booking', 'maintenance', 'manual');
create type public.cancellation_disposition as enum ('pending', 'accepted', 'declined');
create type public.contract_version_status as enum ('issued', 'superseded', 'voided');
create type public.payment_direction as enum ('incoming', 'outgoing');
create type public.payment_status as enum ('submitted', 'verified', 'rejected');
create type public.payment_allocation_kind as enum (
  'rental_payment',
  'security_deposit',
  'deposit_refund'
);
create type public.deposit_settlement_status as enum ('pending', 'final', 'reversed');
create type public.handoff_type as enum ('pickup', 'return');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create function private.reject_update_or_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;

create table private.admin_accounts (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  legal_name text not null check (length(btrim(legal_name)) between 2 and 160),
  phone text not null check (length(btrim(phone)) between 7 and 32),
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create table public.verification_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete restrict,
  status public.verification_status not null default 'pending',
  id_type text not null check (length(btrim(id_type)) between 2 and 80),
  document_expiration_date date,
  submitted_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete restrict,
  rejection_reason text,
  supersedes_id uuid references public.verification_records (id) on delete restrict,
  check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status <> 'pending' and decided_at is not null and decided_by is not null)
  ),
  check (status <> 'verified' or document_expiration_date is not null),
  check (status <> 'rejected' or nullif(btrim(rejection_reason), '') is not null)
);

create unique index verification_records_one_current_per_user_idx
on public.verification_records (user_id)
where status in ('pending', 'verified');
create index verification_records_user_id_idx on public.verification_records (user_id);
create index verification_records_decided_by_idx on public.verification_records (decided_by);
create index verification_records_supersedes_id_idx on public.verification_records (supersedes_id);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_record_id uuid not null references public.verification_records (id) on delete restrict,
  owner_user_id uuid not null references public.profiles (user_id) on delete restrict,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  media_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 bytea not null check (octet_length(sha256) = 32),
  created_at timestamptz not null default statement_timestamp(),
  retention_until timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  verified_deleted_at timestamptz,
  supersedes_id uuid references public.verification_documents (id) on delete restrict,
  check (deleted_at is null or deletion_requested_at is not null),
  check (verified_deleted_at is null or deleted_at is not null)
);

create index verification_documents_record_id_idx
on public.verification_documents (verification_record_id);
create index verification_documents_owner_id_idx
on public.verification_documents (owner_user_id);
create index verification_documents_supersedes_id_idx
on public.verification_documents (supersedes_id);

create table public.cameras (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  serial_number text not null unique check (nullif(btrim(serial_number), '') is not null),
  name text not null check (length(btrim(name)) between 2 and 160),
  description text,
  status public.camera_status not null default 'draft',
  daily_rate numeric(12,2) check (daily_rate >= 0),
  security_deposit numeric(12,2) check (security_deposit >= 0),
  acquisition_cost numeric(12,2) check (acquisition_cost >= 0),
  replacement_value numeric(12,2) check (replacement_value >= 0),
  internal_notes text,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (
    status <> 'published'
    or (
      nullif(btrim(coalesce(description, '')), '') is not null
      and daily_rate is not null
      and security_deposit is not null
      and published_at is not null
      and archived_at is null
    )
  ),
  check (status <> 'archived' or archived_at is not null)
);

create trigger cameras_set_updated_at
before update on public.cameras
for each row execute function private.set_updated_at();

create table public.camera_photos (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras (id) on delete restrict,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  alt_text text not null check (length(btrim(alt_text)) between 2 and 240),
  sort_position integer not null check (sort_position >= 0),
  created_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz
);

create unique index camera_photos_active_position_idx
on public.camera_photos (camera_id, sort_position)
where archived_at is null;
create index camera_photos_camera_id_idx on public.camera_photos (camera_id);

create table public.camera_accessories (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 160),
  quantity integer not null check (quantity > 0),
  replacement_value numeric(12,2) check (replacement_value >= 0),
  sort_position integer not null default 0 check (sort_position >= 0),
  created_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz
);

create unique index camera_accessories_active_name_idx
on public.camera_accessories (camera_id, lower(name))
where archived_at is null;
create index camera_accessories_camera_id_idx on public.camera_accessories (camera_id);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  renter_id uuid not null references public.profiles (user_id) on delete restrict,
  camera_id uuid not null references public.cameras (id) on delete restrict,
  state public.booking_state not null default 'FOR_REVIEW',
  pickup_at timestamptz not null,
  return_at timestamptz not null,
  intended_use text not null check (length(btrim(intended_use)) between 2 and 1000),
  expected_location text not null check (length(btrim(expected_location)) between 2 and 500),
  operator_notes text,
  requested_at timestamptz not null default statement_timestamp(),
  approved_at timestamptz,
  approval_deadline_at timestamptz,
  approved_by uuid references auth.users (id) on delete restrict,
  daily_rate_snapshot numeric(12,2) check (daily_rate_snapshot >= 0),
  rental_amount numeric(12,2) check (rental_amount >= 0),
  security_deposit_amount numeric(12,2) check (security_deposit_amount >= 0),
  total_due numeric(12,2) generated always as (rental_amount + security_deposit_amount) stored,
  currency text not null default 'PHP' check (currency = 'PHP'),
  current_contract_version_id uuid,
  updated_at timestamptz not null default statement_timestamp(),
  check (pickup_at < return_at),
  check (
    (
      approved_at is null
      and approval_deadline_at is null
      and approved_by is null
      and daily_rate_snapshot is null
      and rental_amount is null
      and security_deposit_amount is null
    )
    or (
      approved_at is not null
      and approval_deadline_at = approved_at + interval '24 hours'
      and approved_by is not null
      and daily_rate_snapshot is not null
      and rental_amount is not null
      and security_deposit_amount is not null
    )
  ),
  check (
    state not in (
      'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED',
      'ACTIVE', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'COMPLETED', 'EXPIRED'
    )
    or approved_at is not null
  )
);

create index bookings_renter_id_idx on public.bookings (renter_id);
create index bookings_camera_id_idx on public.bookings (camera_id);
create index bookings_state_idx on public.bookings (state);
create index bookings_approval_deadline_idx
on public.bookings (approval_deadline_at)
where state in ('CONTRACT_PENDING', 'TO_PAY');

create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function private.set_updated_at();

create function private.protect_approved_booking_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.approved_at is not null and (
    old.camera_id is distinct from new.camera_id
    or old.pickup_at is distinct from new.pickup_at
    or old.return_at is distinct from new.return_at
    or old.intended_use is distinct from new.intended_use
    or old.expected_location is distinct from new.expected_location
    or old.requested_at is distinct from new.requested_at
    or old.approved_at is distinct from new.approved_at
    or old.approval_deadline_at is distinct from new.approval_deadline_at
    or old.approved_by is distinct from new.approved_by
    or old.daily_rate_snapshot is distinct from new.daily_rate_snapshot
    or old.rental_amount is distinct from new.rental_amount
    or old.security_deposit_amount is distinct from new.security_deposit_amount
    or old.currency is distinct from new.currency
  ) then
    raise exception 'approved booking facts and deadline are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger bookings_protect_approved_facts
before update on public.bookings
for each row execute function private.protect_approved_booking_facts();

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras (id) on delete restrict,
  booking_id uuid unique references public.bookings (id) on delete restrict,
  kind public.availability_block_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  period tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_by uuid not null references auth.users (id) on delete restrict,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  released_at timestamptz,
  released_by uuid references auth.users (id) on delete restrict,
  check (starts_at < ends_at),
  check (
    (kind = 'booking' and booking_id is not null)
    or (kind in ('maintenance', 'manual') and booking_id is null)
  ),
  check ((released_at is null and released_by is null) or released_at is not null)
);

alter table public.availability_blocks
add constraint availability_blocks_no_active_overlap
exclude using gist (camera_id with =, period with &&)
where (released_at is null);

create index availability_blocks_camera_id_idx on public.availability_blocks (camera_id);
create index availability_blocks_booking_id_idx on public.availability_blocks (booking_id);

create table public.booking_state_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  from_state public.booking_state,
  to_state public.booking_state not null,
  actor_user_id uuid references auth.users (id) on delete restrict,
  actor_type public.booking_actor_type not null,
  reason_code text not null check (nullif(btrim(reason_code), '') is not null),
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default statement_timestamp(),
  operation_id uuid not null default gen_random_uuid(),
  check ((from_state is null and to_state = 'FOR_REVIEW') or from_state is not null)
);

create index booking_state_history_booking_id_id_idx
on public.booking_state_history (booking_id, id desc);
create index booking_state_history_actor_user_id_idx
on public.booking_state_history (actor_user_id);
create index booking_state_history_operation_id_idx
on public.booking_state_history (operation_id);

create trigger booking_state_history_append_only
before update or delete on public.booking_state_history
for each row execute function private.reject_update_or_delete();

create table public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  requester_id uuid not null references auth.users (id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 2 and 1000),
  requested_at timestamptz not null default statement_timestamp(),
  disposition public.cancellation_disposition not null default 'pending',
  decided_by uuid references auth.users (id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  check (
    (disposition = 'pending' and decided_by is null and decided_at is null)
    or (disposition <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

create unique index cancellation_requests_one_pending_idx
on public.booking_cancellation_requests (booking_id)
where disposition = 'pending';
create index cancellation_requests_requester_id_idx
on public.booking_cancellation_requests (requester_id);
create index cancellation_requests_decided_by_idx
on public.booking_cancellation_requests (decided_by);

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  schema_version integer not null check (schema_version > 0),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references auth.users (id) on delete restrict,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete restrict,
  activated_at timestamptz,
  deactivated_at timestamptz,
  check ((approved_at is null) = (approved_by is null)),
  check (activated_at is null or approved_at is not null),
  check (deactivated_at is null or activated_at is not null)
);

create index contract_templates_created_by_idx on public.contract_templates (created_by);
create index contract_templates_approved_by_idx on public.contract_templates (approved_by);
create unique index contract_templates_one_active_idx
on public.contract_templates ((true))
where activated_at is not null and deactivated_at is null;

create function private.protect_contract_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.activated_at is not null then
    raise exception 'activated contract templates are immutable' using errcode = '55000';
  end if;
  if old.approved_at is not null and (
    old.version is distinct from new.version
    or old.schema_version is distinct from new.schema_version
    or old.terms is distinct from new.terms
    or old.content_sha256 is distinct from new.content_sha256
    or old.created_at is distinct from new.created_at
    or old.created_by is distinct from new.created_by
    or old.approved_at is distinct from new.approved_at
    or old.approved_by is distinct from new.approved_by
  ) then
    raise exception 'approved contract template content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger contract_templates_protect_content
before update on public.contract_templates
for each row execute function private.protect_contract_template();

create trigger contract_templates_no_delete
before delete on public.contract_templates
for each row execute function private.reject_update_or_delete();

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  version_no integer not null check (version_no > 0),
  status public.contract_version_status not null default 'issued',
  supersedes_id uuid references public.contract_versions (id) on delete restrict,
  template_id uuid not null references public.contract_templates (id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_schema_version integer not null check (snapshot_schema_version > 0),
  content_sha256 bytea not null check (octet_length(content_sha256) = 32),
  rendered_pdf_path text unique,
  issued_at timestamptz not null default statement_timestamp(),
  issued_by uuid not null references auth.users (id) on delete restrict,
  unique (booking_id, version_no)
);

create unique index contract_versions_one_issued_idx
on public.contract_versions (booking_id)
where status = 'issued';
create index contract_versions_supersedes_id_idx on public.contract_versions (supersedes_id);
create index contract_versions_template_id_idx on public.contract_versions (template_id);
create index contract_versions_issued_by_idx on public.contract_versions (issued_by);

alter table public.bookings
add constraint bookings_current_contract_version_fk
foreign key (current_contract_version_id)
references public.contract_versions (id)
on delete restrict
deferrable initially deferred;

create index bookings_current_contract_version_id_idx
on public.bookings (current_contract_version_id);

create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions (id) on delete restrict,
  renter_id uuid not null references public.profiles (user_id) on delete restrict,
  signature_intent text not null check (length(btrim(signature_intent)) between 2 and 500),
  attestation_text text not null check (length(btrim(attestation_text)) between 2 and 2000),
  signed_at timestamptz not null default statement_timestamp(),
  request_ip_digest bytea,
  user_agent_digest bytea,
  acknowledged_content_sha256 bytea not null check (octet_length(acknowledged_content_sha256) = 32),
  unique (contract_version_id, renter_id),
  check (request_ip_digest is null or octet_length(request_ip_digest) = 32),
  check (user_agent_digest is null or octet_length(user_agent_digest) = 32)
);

create index contract_signatures_renter_id_idx on public.contract_signatures (renter_id);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  direction public.payment_direction not null,
  method text not null default 'gcash_manual' check (method = 'gcash_manual'),
  status public.payment_status not null default 'submitted',
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  reference text not null check (length(btrim(reference)) between 4 and 120),
  reference_normalized text generated always as (lower(regexp_replace(reference, '[^[:alnum:]]', '', 'g'))) stored,
  counterparty_display_name text not null check (length(btrim(counterparty_display_name)) between 2 and 160),
  submitted_at timestamptz not null default statement_timestamp(),
  submitted_by uuid not null references auth.users (id) on delete restrict,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete restrict,
  rejection_reason text,
  reversal_of uuid references public.payment_transactions (id) on delete restrict,
  check (length(reference_normalized) >= 4),
  check (
    (status = 'submitted' and decided_at is null and decided_by is null)
    or (status <> 'submitted' and decided_at is not null and decided_by is not null)
  ),
  check (status <> 'rejected' or nullif(btrim(rejection_reason), '') is not null),
  check (reversal_of is null or status = 'verified')
);

create index payment_transactions_booking_id_idx on public.payment_transactions (booking_id);
create index payment_transactions_submitted_by_idx on public.payment_transactions (submitted_by);
create index payment_transactions_decided_by_idx on public.payment_transactions (decided_by);
create index payment_transactions_reversal_of_idx on public.payment_transactions (reversal_of);
create unique index payment_transactions_verified_reference_idx
on public.payment_transactions (method, direction, reference_normalized)
where status = 'verified';
create unique index payment_transactions_one_reversal_idx
on public.payment_transactions (reversal_of)
where reversal_of is not null;

create function private.validate_payment_reversal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reversal_of is null then
    return new;
  end if;

  if new.reversal_of = new.id or not exists (
    select 1
    from public.payment_transactions as original
    where original.id = new.reversal_of
      and original.status = 'verified'
      and original.booking_id = new.booking_id
      and original.direction <> new.direction
      and original.amount = new.amount
      and original.currency = new.currency
  ) then
    raise exception 'a reversal must offset one verified transaction for the same booking and amount'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_transactions_validate_reversal
before insert or update of reversal_of, booking_id, direction, amount, currency, status
on public.payment_transactions
for each row execute function private.validate_payment_reversal();

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.payment_transactions (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  kind public.payment_allocation_kind not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default statement_timestamp(),
  unique (transaction_id, kind)
);

create index payment_allocations_transaction_id_idx
on public.payment_allocations (transaction_id);
create index payment_allocations_booking_id_idx
on public.payment_allocations (booking_id);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.payment_transactions (id) on delete restrict,
  owner_user_id uuid not null references public.profiles (user_id) on delete restrict,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  media_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 bytea not null check (octet_length(sha256) = 32),
  created_at timestamptz not null default statement_timestamp(),
  retention_until timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  verified_deleted_at timestamptz,
  supersedes_id uuid references public.payment_proofs (id) on delete restrict,
  check (deleted_at is null or deletion_requested_at is not null),
  check (verified_deleted_at is null or deleted_at is not null)
);

create index payment_proofs_transaction_id_idx on public.payment_proofs (transaction_id);
create index payment_proofs_owner_user_id_idx on public.payment_proofs (owner_user_id);
create index payment_proofs_supersedes_id_idx on public.payment_proofs (supersedes_id);

create table public.deposit_settlements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  held_amount numeric(12,2) not null check (held_amount >= 0),
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  deduction_amount numeric(12,2) not null default 0 check (deduction_amount >= 0),
  deduction_reason text,
  status public.deposit_settlement_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete restrict,
  refund_transaction_id uuid references public.payment_transactions (id) on delete restrict,
  supersedes_id uuid references public.deposit_settlements (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  check (deduction_amount = 0 or nullif(btrim(coalesce(deduction_reason, '')), '') is not null),
  check (
    status <> 'final'
    or (
      decided_at is not null
      and decided_by is not null
      and refund_amount + deduction_amount = held_amount
      and (refund_amount = 0 or refund_transaction_id is not null)
    )
  )
);

create index deposit_settlements_booking_id_idx on public.deposit_settlements (booking_id);
create index deposit_settlements_decided_by_idx on public.deposit_settlements (decided_by);
create index deposit_settlements_refund_transaction_id_idx
on public.deposit_settlements (refund_transaction_id);
create index deposit_settlements_supersedes_id_idx on public.deposit_settlements (supersedes_id);
create unique index deposit_settlements_one_current_idx
on public.deposit_settlements (booking_id)
where status in ('pending', 'final');

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  type public.handoff_type not null,
  conducted_at timestamptz not null default statement_timestamp(),
  conducted_by uuid not null references auth.users (id) on delete restrict,
  named_renter_present boolean,
  original_id_checked boolean,
  original_id_matched boolean,
  camera_serial_checked boolean not null,
  accessory_checklist_completed boolean not null,
  actual_at timestamptz not null,
  notes text,
  unique (booking_id, type),
  check (original_id_matched is not true or original_id_checked is true),
  check (
    type <> 'pickup'
    or (
      named_renter_present is true
      and original_id_checked is true
      and original_id_matched is true
      and camera_serial_checked
      and accessory_checklist_completed
    )
  )
);

create index handoffs_conducted_by_idx on public.handoffs (conducted_by);

create table public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null unique references public.handoffs (id) on delete restrict,
  camera_condition_summary text not null check (length(btrim(camera_condition_summary)) between 2 and 2000),
  accessory_checklist_snapshot jsonb not null check (jsonb_typeof(accessory_checklist_snapshot) = 'array'),
  has_damage boolean not null default false,
  has_missing_items boolean not null default false,
  notes text,
  reported_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);

create index condition_reports_reported_by_idx on public.condition_reports (reported_by);

create table public.condition_photos (
  id uuid primary key default gen_random_uuid(),
  condition_report_id uuid not null references public.condition_reports (id) on delete restrict,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  media_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 bytea not null check (octet_length(sha256) = 32),
  evidence_category text not null check (length(btrim(evidence_category)) between 2 and 80),
  created_at timestamptz not null default statement_timestamp(),
  retention_until timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  verified_deleted_at timestamptz,
  supersedes_id uuid references public.condition_photos (id) on delete restrict,
  check (deleted_at is null or deletion_requested_at is not null),
  check (verified_deleted_at is null or deleted_at is not null)
);

create index condition_photos_report_id_idx
on public.condition_photos (condition_report_id);
create index condition_photos_supersedes_id_idx
on public.condition_photos (supersedes_id);

create table private.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default statement_timestamp(),
  actor_user_id uuid references auth.users (id) on delete restrict,
  session_id uuid,
  operation_id uuid not null default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  outcome text not null,
  purpose text,
  request_metadata_digest bytea,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (request_metadata_digest is null or octet_length(request_metadata_digest) = 32)
);

create index audit_logs_actor_user_id_idx on private.audit_logs (actor_user_id);
create index audit_logs_operation_id_idx on private.audit_logs (operation_id);
create index audit_logs_entity_idx on private.audit_logs (entity_type, entity_id);
create index audit_logs_occurred_at_idx on private.audit_logs (occurred_at desc);

create trigger audit_logs_append_only
before update or delete on private.audit_logs
for each row execute function private.reject_update_or_delete();

create view public.public_cameras
with (security_invoker = true)
as
select
  id,
  slug,
  name,
  description,
  daily_rate,
  security_deposit,
  published_at
from public.cameras
where status = 'published';

create view public.public_camera_photos
with (security_invoker = true)
as
select
  photo.id,
  photo.camera_id,
  photo.object_path,
  photo.alt_text,
  photo.sort_position
from public.camera_photos as photo
join public.cameras as camera on camera.id = photo.camera_id
where photo.archived_at is null
  and camera.status = 'published';

create view public.public_availability
with (security_invoker = true)
as
select
  camera_id,
  starts_at,
  ends_at,
  case when kind = 'booking' then 'booked'::text else 'unavailable'::text end as reason
from public.availability_blocks
where released_at is null;

create function private.validate_booking_history_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  latest_state public.booking_state;
begin
  select history.to_state
    into latest_state
  from public.booking_state_history as history
  where history.booking_id = new.id
  order by history.id desc
  limit 1;

  if latest_state is distinct from new.state then
    raise exception 'booking state must match append-only history'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger bookings_history_projection_guard
after insert or update of state on public.bookings
deferrable initially deferred
for each row execute function private.validate_booking_history_projection();

create function private.validate_verification_document_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.verification_records as record
    where record.id = new.verification_record_id
      and record.user_id = new.owner_user_id
  ) then
    raise exception 'verification document owner does not match record owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger verification_documents_owner_guard
before insert or update of verification_record_id, owner_user_id
on public.verification_documents
for each row execute function private.validate_verification_document_owner();

create function private.validate_contract_signature()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.contract_versions as version
    join public.bookings as booking on booking.id = version.booking_id
    where version.id = new.contract_version_id
      and version.status = 'issued'
      and booking.renter_id = new.renter_id
      and booking.current_contract_version_id = version.id
      and version.content_sha256 = new.acknowledged_content_sha256
  ) then
    raise exception 'signature must acknowledge the renter current contract version'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger contract_signatures_validate
before insert on public.contract_signatures
for each row execute function private.validate_contract_signature();

create trigger contract_signatures_append_only
before update or delete on public.contract_signatures
for each row execute function private.reject_update_or_delete();

create function private.protect_contract_version_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.booking_id is distinct from new.booking_id
    or old.version_no is distinct from new.version_no
    or old.supersedes_id is distinct from new.supersedes_id
    or old.template_id is distinct from new.template_id
    or old.snapshot is distinct from new.snapshot
    or old.snapshot_schema_version is distinct from new.snapshot_schema_version
    or old.content_sha256 is distinct from new.content_sha256
    or old.rendered_pdf_path is distinct from new.rendered_pdf_path
    or old.issued_at is distinct from new.issued_at
    or old.issued_by is distinct from new.issued_by
    or not (old.status = 'issued' and new.status in ('superseded', 'voided'))
  then
    raise exception 'contract version content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger contract_versions_protect_content
before update on public.contract_versions
for each row execute function private.protect_contract_version_content();

create trigger contract_versions_no_delete
before delete on public.contract_versions
for each row execute function private.reject_update_or_delete();

create function private.protect_verified_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'verified' then
    raise exception 'verified payment transactions are immutable' using errcode = '55000';
  end if;
  if old.booking_id is distinct from new.booking_id
    or old.direction is distinct from new.direction
    or old.method is distinct from new.method
    or old.amount is distinct from new.amount
    or old.currency is distinct from new.currency
    or old.reference is distinct from new.reference
    or old.counterparty_display_name is distinct from new.counterparty_display_name
    or old.submitted_at is distinct from new.submitted_at
    or old.submitted_by is distinct from new.submitted_by
    or old.reversal_of is distinct from new.reversal_of
  then
    raise exception 'submitted payment facts are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger payment_transactions_protect_facts
before update on public.payment_transactions
for each row execute function private.protect_verified_payment();

create trigger payment_transactions_no_delete
before delete on public.payment_transactions
for each row execute function private.reject_update_or_delete();

create trigger payment_allocations_append_only
before update or delete on public.payment_allocations
for each row execute function private.reject_update_or_delete();

create function private.validate_payment_allocations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_id uuid;
  payment public.payment_transactions%rowtype;
  allocated numeric(12,2);
  invalid_kinds integer;
begin
  if tg_table_name = 'payment_transactions' then
    target_id := new.id;
  else
    target_id := new.transaction_id;
  end if;

  select * into payment
  from public.payment_transactions
  where id = target_id;

  if payment.status <> 'verified' then
    return null;
  end if;

  select coalesce(sum(allocation.amount), 0),
         count(*) filter (
           where (payment.direction = 'incoming' and allocation.kind = 'deposit_refund')
              or (payment.direction = 'outgoing' and allocation.kind <> 'deposit_refund')
              or allocation.booking_id <> payment.booking_id
         )
    into allocated, invalid_kinds
  from public.payment_allocations as allocation
  where allocation.transaction_id = target_id;

  if allocated <> payment.amount or invalid_kinds <> 0 then
    raise exception 'verified payment allocations must be balanced and directionally valid'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger payment_transactions_allocation_guard
after insert or update of status on public.payment_transactions
deferrable initially deferred
for each row execute function private.validate_payment_allocations();

create constraint trigger payment_allocations_balance_guard
after insert on public.payment_allocations
deferrable initially deferred
for each row execute function private.validate_payment_allocations();

create function private.validate_payment_proof_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.payment_transactions as payment
    join public.bookings as booking on booking.id = payment.booking_id
    where payment.id = new.transaction_id
      and booking.renter_id = new.owner_user_id
  ) then
    raise exception 'payment proof owner does not match booking renter'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payment_proofs_owner_guard
before insert or update of transaction_id, owner_user_id
on public.payment_proofs
for each row execute function private.validate_payment_proof_owner();

create function private.protect_deposit_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.booking_id is distinct from new.booking_id
    or old.held_amount is distinct from new.held_amount
    or old.refund_amount is distinct from new.refund_amount
    or old.deduction_amount is distinct from new.deduction_amount
    or old.deduction_reason is distinct from new.deduction_reason
    or old.decided_at is distinct from new.decided_at
    or old.decided_by is distinct from new.decided_by
    or old.refund_transaction_id is distinct from new.refund_transaction_id
    or old.supersedes_id is distinct from new.supersedes_id
    or old.created_at is distinct from new.created_at
    or not (old.status in ('pending', 'final') and new.status = 'reversed')
  then
    raise exception 'deposit settlement facts are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger deposit_settlements_protect_facts
before update on public.deposit_settlements
for each row execute function private.protect_deposit_settlement();

create trigger deposit_settlements_no_delete
before delete on public.deposit_settlements
for each row execute function private.reject_update_or_delete();

create trigger handoffs_append_only
before update or delete on public.handoffs
for each row execute function private.reject_update_or_delete();

create trigger condition_reports_append_only
before update or delete on public.condition_reports
for each row execute function private.reject_update_or_delete();

revoke all on all functions in schema private from public;
revoke all on all tables in schema private from public;
revoke all on all sequences in schema private from public;
