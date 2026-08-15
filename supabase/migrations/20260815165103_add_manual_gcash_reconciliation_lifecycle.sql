-- Sprint 4 manual GCash payment and reconciliation lifecycle.
--
-- The original schema reserved payment tables and broad scaffold functions,
-- but it did not provide a safe product workflow. This migration makes the
-- database authoritative for recipient configuration, immutable booking and
-- contract amounts, submission timing, idempotency, reconciliation,
-- allocations, private proof finalization, audit, and minimal projections.

drop function if exists api.create_payment_proof_upload(uuid, text, bigint, bytea);
drop function if exists private.create_payment_proof_upload(uuid, text, bigint, bytea);
drop function if exists api.submit_payment(uuid, numeric, text, text);
drop function if exists private.submit_payment(uuid, numeric, text, text);
drop function if exists api.verify_payment(uuid, numeric, numeric);
drop function if exists private.verify_payment(uuid, numeric, numeric);
drop function if exists api.reject_payment(uuid, text);
drop function if exists private.reject_payment(uuid, text);

create type private.payment_proof_upload_intent_status as enum (
  'awaiting_upload',
  'finalized',
  'cleanup_pending',
  'cleaned',
  'expired'
);

create table private.gcash_payment_configuration (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 0 check (version >= 0),
  enabled boolean not null default false,
  recipient_name text,
  recipient_account text,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users (id) on delete restrict,
  check (
    not enabled
    or (
      nullif(btrim(recipient_name), '') is not null
      and nullif(btrim(recipient_account), '') is not null
    )
  )
);

insert into private.gcash_payment_configuration (singleton)
values (true);

alter table private.gcash_payment_configuration enable row level security;

create table private.payment_proof_policies (
  singleton boolean primary key default true check (singleton),
  allowed_media_types text[] not null,
  max_byte_size bigint not null check (max_byte_size between 1 and 5242880),
  upload_intent_ttl interval not null check (upload_intent_ttl > interval '0 seconds'),
  check (cardinality(allowed_media_types) > 0)
);

insert into private.payment_proof_policies (
  allowed_media_types,
  max_byte_size,
  upload_intent_ttl
) values (
  array['image/jpeg', 'image/png']::text[],
  5242880,
  interval '15 minutes'
);

alter table private.payment_proof_policies enable row level security;

create function private.normalize_gcash_reference(p_reference text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

alter table public.payment_transactions
  add column submission_attempt_id uuid,
  add column contract_version_id uuid
    references public.contract_versions (id) on delete restrict,
  add column recipient_config_version bigint,
  add column recipient_name_snapshot text,
  add column recipient_account_snapshot text,
  add column rejection_reason_code text,
  add column supersedes_id uuid
    references public.payment_transactions (id) on delete restrict,
  add column reference_canonical text generated always as (
    private.normalize_gcash_reference(reference)
  ) stored;

alter table public.payment_transactions
  add constraint payment_transactions_sprint4_incoming_facts_check check (
    direction <> 'incoming'
    or (
      submission_attempt_id is not null
      and contract_version_id is not null
      and recipient_config_version is not null
      and nullif(btrim(recipient_name_snapshot), '') is not null
      and nullif(btrim(recipient_account_snapshot), '') is not null
      and length(reference_canonical) between 4 and 64
    )
  ) not valid,
  add constraint payment_transactions_rejection_reason_code_check check (
    rejection_reason_code is null
    or rejection_reason_code in (
      'amount_mismatch',
      'duplicate_reference',
      'not_found_in_gcash',
      'reference_mismatch',
      'sender_mismatch',
      'unconfirmed_transfer'
    )
  ),
  add constraint payment_transactions_supersession_check check (
    supersedes_id is null or supersedes_id <> id
  );

create unique index payment_transactions_submission_attempt_idx
on public.payment_transactions (submission_attempt_id)
where submission_attempt_id is not null;

create unique index payment_transactions_one_submitted_incoming_idx
on public.payment_transactions (booking_id)
where direction = 'incoming' and status = 'submitted';

create unique index payment_transactions_verified_canonical_reference_idx
on public.payment_transactions (method, direction, reference_canonical)
where status = 'verified';

create unique index payment_transactions_one_successor_idx
on public.payment_transactions (supersedes_id)
where supersedes_id is not null;

create index payment_transactions_review_queue_idx
on public.payment_transactions (submitted_at, id)
where direction = 'incoming' and status = 'submitted';

alter table public.payment_proofs
  add column upload_intent_id uuid unique,
  add column finalized_at timestamptz;

create unique index payment_proofs_one_successor_idx
on public.payment_proofs (supersedes_id)
where supersedes_id is not null;

create table private.payment_proof_upload_intents (
  id uuid primary key,
  transaction_id uuid not null
    references public.payment_transactions (id) on delete restrict,
  owner_user_id uuid not null references public.profiles (user_id) on delete restrict,
  proof_id uuid not null unique,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  expected_media_type text not null,
  expected_byte_size bigint not null check (expected_byte_size > 0),
  expected_sha256 bytea not null check (octet_length(expected_sha256) = 32),
  supersedes_proof_id uuid references public.payment_proofs (id) on delete restrict,
  status private.payment_proof_upload_intent_status not null default 'awaiting_upload',
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  cleanup_requested_at timestamptz,
  cleaned_at timestamptz,
  check (expires_at > created_at),
  check (status <> 'finalized' or finalized_at is not null),
  check (status <> 'cleanup_pending' or cleanup_requested_at is not null),
  check (status <> 'cleaned' or cleaned_at is not null)
);

alter table public.payment_proofs
  add constraint payment_proofs_upload_intent_id_fkey
  foreign key (upload_intent_id)
  references private.payment_proof_upload_intents (id)
  on delete restrict;

create unique index payment_proof_upload_intents_one_open_per_transaction_idx
on private.payment_proof_upload_intents (transaction_id)
where status in ('awaiting_upload', 'cleanup_pending');

create index payment_proof_upload_intents_owner_created_idx
on private.payment_proof_upload_intents (owner_user_id, created_at desc);

alter table private.payment_proof_upload_intents enable row level security;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png']::text[]
where id = 'payment-proofs';

drop policy if exists payment_transactions_select_own_or_admin
on public.payment_transactions;
drop policy if exists payment_allocations_select_own_or_admin
on public.payment_allocations;
drop policy if exists payment_proofs_select_own_or_admin
on public.payment_proofs;

revoke all on public.payment_transactions from anon, authenticated;
revoke all on public.payment_allocations from anon, authenticated;
revoke all on public.payment_proofs from anon, authenticated;

create function private.payment_text_has_forbidden_characters(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
    or p_value ~ '[[:cntrl:]]'
    or strpos(p_value, chr(8203)) > 0
    or strpos(p_value, chr(8204)) > 0
    or strpos(p_value, chr(8205)) > 0
    or strpos(p_value, chr(8288)) > 0
    or strpos(p_value, chr(65279)) > 0;
$$;

create function private.payment_proof_extension(p_media_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_media_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    else null
  end;
$$;

create function private.write_payment_audit(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_action text,
  p_transaction_id uuid,
  p_outcome text,
  p_purpose text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_operation_id is null or p_transaction_id is null then
    raise exception 'payment audit operation and transaction are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is not null and not exists (
    select 1 from auth.users where id = p_actor_user_id
  ) then
    raise exception 'payment audit actor does not exist' using errcode = '23503';
  end if;

  insert into private.audit_logs (
    actor_user_id,
    operation_id,
    action,
    entity_type,
    entity_id,
    outcome,
    purpose,
    metadata
  ) values (
    p_actor_user_id,
    p_operation_id,
    p_action,
    'payment_transaction',
    p_transaction_id,
    p_outcome,
    p_purpose,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create function private.guard_payment_transaction_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payment transactions are append-only' using errcode = '55000';
  end if;

  if old.direction <> 'incoming' then
    return new;
  end if;

  if old.status <> 'submitted'
    or new.status not in ('verified', 'rejected')
    or nullif(current_setting('camnook.payment_operation_id', true), '') is null
    or old.id is distinct from new.id
    or old.booking_id is distinct from new.booking_id
    or old.direction is distinct from new.direction
    or old.method is distinct from new.method
    or old.amount is distinct from new.amount
    or old.currency is distinct from new.currency
    or old.reference is distinct from new.reference
    or old.counterparty_display_name is distinct from new.counterparty_display_name
    or old.submitted_at is distinct from new.submitted_at
    or old.submitted_by is distinct from new.submitted_by
    or old.reversal_of is distinct from new.reversal_of
    or old.submission_attempt_id is distinct from new.submission_attempt_id
    or old.contract_version_id is distinct from new.contract_version_id
    or old.recipient_config_version is distinct from new.recipient_config_version
    or old.recipient_name_snapshot is distinct from new.recipient_name_snapshot
    or old.recipient_account_snapshot is distinct from new.recipient_account_snapshot
    or old.supersedes_id is distinct from new.supersedes_id
    or old.decided_at is not null
    or old.decided_by is not null
    or new.decided_at is null
    or new.decided_by is null
    or (
      new.status = 'verified'
      and (
        new.rejection_reason is not null
        or new.rejection_reason_code is not null
      )
    )
    or (
      new.status = 'rejected'
      and (
        new.rejection_reason_code is null
        or new.rejection_reason is distinct from new.rejection_reason_code
      )
    )
  then
    raise exception 'submitted payment facts and final decisions are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger payment_transactions_history_guard
before update or delete on public.payment_transactions
for each row execute function private.guard_payment_transaction_history();

create function private.reject_payment_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial history is append-only' using errcode = '55000';
end;
$$;

drop trigger payment_allocations_append_only on public.payment_allocations;

create trigger payment_allocations_append_only
before update or delete on public.payment_allocations
for each row execute function private.reject_payment_history_mutation();

create trigger payment_proofs_append_only
before update or delete on public.payment_proofs
for each row execute function private.reject_payment_history_mutation();

create function private.assert_payment_allocation_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  allocation_count integer;
  allocation_total numeric(12,2);
  rental_total numeric(12,2);
  deposit_total numeric(12,2);
begin
  if tg_table_name = 'payment_transactions' then
    target_transaction_id := coalesce(
      (to_jsonb(new) ->> 'id')::uuid,
      (to_jsonb(old) ->> 'id')::uuid
    );
  else
    target_transaction_id := coalesce(
      (to_jsonb(new) ->> 'transaction_id')::uuid,
      (to_jsonb(old) ->> 'transaction_id')::uuid
    );
  end if;

  select * into payment
  from public.payment_transactions
  where id = target_transaction_id;

  if payment.id is null then
    return null;
  end if;

  select
    count(*)::integer,
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (where kind = 'rental_payment'), 0),
    coalesce(sum(amount) filter (where kind = 'security_deposit'), 0)
  into allocation_count, allocation_total, rental_total, deposit_total
  from public.payment_allocations
  where transaction_id = payment.id;

  if payment.direction = 'incoming' and payment.status = 'verified' then
    select * into booking from public.bookings where id = payment.booking_id;
    if allocation_count <> 2
      or allocation_total <> payment.amount
      or rental_total <> booking.rental_amount
      or deposit_total <> booking.security_deposit_amount
      or payment.amount <> booking.total_due
    then
      raise exception 'verified incoming payment allocations are not balanced'
        using errcode = '23514';
    end if;
  elsif payment.direction = 'incoming'
    and allocation_count <> 0
    and payment.status <> 'verified'
  then
    raise exception 'unverified payments cannot have allocations'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

-- Direct payment-table reads are intentionally revoked below. Deferred
-- constraint triggers must therefore inspect payment rows with their owning
-- function privileges rather than the renter/admin statement privileges.
alter function private.validate_payment_allocations() security definer;

create constraint trigger payment_transactions_balance_at_commit
after insert or update on public.payment_transactions
deferrable initially deferred
for each row execute function private.assert_payment_allocation_balance();

create constraint trigger payment_allocations_balance_at_commit
after insert or update or delete on public.payment_allocations
deferrable initially deferred
for each row execute function private.assert_payment_allocation_balance();

create function private.payment_contract_ready(
  p_booking public.bookings
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_booking.current_contract_version_id is not null
    and exists (
      select 1
      from public.contract_versions as version
      join public.contract_signatures as signature
        on signature.contract_version_id = version.id
       and signature.renter_id = p_booking.renter_id
       and signature.acknowledged_content_sha256 = version.content_sha256
      where version.id = p_booking.current_contract_version_id
        and version.booking_id = p_booking.id
        and version.status = 'issued'
        and jsonb_typeof(version.snapshot -> 'pricing' -> 'rental_amount') = 'number'
        and jsonb_typeof(version.snapshot -> 'pricing' -> 'security_deposit') = 'number'
        and jsonb_typeof(version.snapshot -> 'pricing' -> 'total_due') = 'number'
        and (version.snapshot -> 'pricing' ->> 'rental_amount')::numeric
          = p_booking.rental_amount
        and (version.snapshot -> 'pricing' ->> 'security_deposit')::numeric
          = p_booking.security_deposit_amount
        and (version.snapshot -> 'pricing' ->> 'total_due')::numeric
          = p_booking.total_due
        and version.snapshot -> 'pricing' ->> 'currency' = p_booking.currency
    );
$$;

create function private.configure_gcash_recipient(
  p_recipient_name text,
  p_recipient_account text,
  p_enabled boolean,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  configured private.gcash_payment_configuration%rowtype;
begin
  if p_operation_id is null or p_enabled is null then
    raise exception 'payment configuration operation is required'
      using errcode = '22023';
  end if;
  if p_enabled and (
    length(btrim(coalesce(p_recipient_name, ''))) not between 2 and 160
    or private.payment_text_has_forbidden_characters(p_recipient_name)
    or btrim(coalesce(p_recipient_account, '')) !~ '^(09[0-9]{9}|\+639[0-9]{9})$'
  ) then
    raise exception 'approved GCash recipient is invalid' using errcode = '22023';
  end if;

  update private.gcash_payment_configuration
  set version = version + 1,
      enabled = p_enabled,
      recipient_name = case when p_enabled then btrim(p_recipient_name) else null end,
      recipient_account = case when p_enabled then btrim(p_recipient_account) else null end,
      updated_at = clock_timestamp(),
      updated_by = caller
  where singleton
  returning * into configured;

  insert into private.audit_logs (
    actor_user_id,
    operation_id,
    action,
    entity_type,
    outcome,
    purpose,
    metadata
  ) values (
    caller,
    p_operation_id,
    'configure_gcash_recipient',
    'payment_configuration',
    'success',
    'manual GCash payment configuration',
    jsonb_build_object(
      'enabled', configured.enabled,
      'version', configured.version
    )
  );

  return jsonb_build_object(
    'enabled', configured.enabled,
    'version', configured.version
  );
end;
$$;

create function private.payment_proof_policy_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed_media_types', policy.allowed_media_types,
    'max_byte_size', policy.max_byte_size,
    'upload_intent_seconds', extract(epoch from policy.upload_intent_ttl)::bigint
  )
  from private.payment_proof_policies as policy
  where policy.singleton;
$$;

create function private.get_payment_proof_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.current_user_id();
  return private.payment_proof_policy_json();
end;
$$;

create function private.get_my_payment_state(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  payment public.payment_transactions%rowtype;
  configuration private.gcash_payment_configuration%rowtype;
  contract_ready boolean;
  proof_exists boolean := false;
begin
  select * into booking
  from public.bookings
  where id = p_booking_id
    and renter_id = caller;

  if booking.id is null then
    raise exception 'payment_booking_not_found' using errcode = 'P0002';
  end if;

  select private.payment_contract_ready(booking) into contract_ready;
  select * into configuration
  from private.gcash_payment_configuration
  where singleton;

  select * into payment
  from public.payment_transactions as candidate
  where candidate.booking_id = booking.id
    and candidate.direction = 'incoming'
  order by candidate.submitted_at desc, candidate.id desc
  limit 1;

  if payment.id is not null then
    select exists (
      select 1
      from public.payment_proofs as proof
      where proof.transaction_id = payment.id
        and proof.finalized_at is not null
        and not exists (
          select 1
          from public.payment_proofs as successor
          where successor.supersedes_id = proof.id
        )
    ) into proof_exists;
  end if;

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', booking.state,
    'approval_deadline_at', booking.approval_deadline_at,
    'can_submit', booking.state = 'TO_PAY'
      and booking.approval_deadline_at > statement_timestamp()
      and contract_ready
      and configuration.enabled,
    'instructions_error', case
      when booking.state <> 'TO_PAY' then null
      when not contract_ready then 'contract_inconsistent'
      when not configuration.enabled then 'recipient_unavailable'
      else null
    end,
    'instructions', case
      when booking.state = 'TO_PAY'
        and contract_ready
        and configuration.enabled
      then jsonb_build_object(
        'rental_amount', booking.rental_amount,
        'security_deposit', booking.security_deposit_amount,
        'total_due', booking.total_due,
        'currency', booking.currency,
        'recipient_name', configuration.recipient_name,
        'recipient_account', configuration.recipient_account,
        'recipient_config_version', configuration.version
      )
      else null
    end,
    'transaction', case when payment.id is null then null else jsonb_build_object(
      'id', payment.id,
      'status', payment.status,
      'submitted_at', payment.submitted_at,
      'rejection_reason_code', payment.rejection_reason_code,
      'proof_exists', proof_exists
    ) end,
    'proof_policy', private.payment_proof_policy_json()
  );
end;
$$;

create function private.submit_payment(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_amount numeric,
  p_reference text,
  p_sender_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  version public.contract_versions%rowtype;
  configuration private.gcash_payment_configuration%rowtype;
  existing public.payment_transactions%rowtype;
  previous public.payment_transactions%rowtype;
  payment_id uuid;
  operation_id uuid := p_attempt_id;
  submission_time timestamptz;
  normalized_reference text := private.normalize_gcash_reference(p_reference);
  normalized_sender text := btrim(coalesce(p_sender_name, ''));
begin
  if p_attempt_id is null
    or p_amount is null
    or p_amount <= 0
    or p_amount > 9999999999.99
    or scale(p_amount) > 2
    or length(btrim(coalesce(p_reference, ''))) not between 4 and 120
    or length(normalized_reference) not between 4 and 64
    or btrim(coalesce(p_reference, '')) !~ '^[A-Za-z0-9 -]+$'
    or length(normalized_sender) not between 2 and 160
    or private.payment_text_has_forbidden_characters(p_sender_name)
  then
    raise exception 'payment_submission_invalid' using errcode = '22023';
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
    and renter_id = caller
  for update;

  if booking.id is null then
    raise exception 'payment_booking_not_found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.payment_transactions
  where submission_attempt_id = p_attempt_id
  for update;

  if existing.id is not null then
    if existing.booking_id <> booking.id
      or existing.submitted_by <> caller
      or existing.amount <> p_amount
      or existing.reference_canonical <> normalized_reference
      or existing.counterparty_display_name <> normalized_sender
    then
      raise exception 'payment_attempt_conflict' using errcode = '40001';
    end if;

    return jsonb_build_object(
      'booking_state', booking.state,
      'created', false,
      'status', existing.status,
      'transaction_id', existing.id
    );
  end if;

  submission_time := clock_timestamp();
  if booking.state <> 'TO_PAY' then
    raise exception 'payment_submission_stale_state' using errcode = '40001';
  end if;
  if booking.approval_deadline_at is null
    or submission_time >= booking.approval_deadline_at
  then
    raise exception 'payment_deadline_elapsed' using errcode = '22023';
  end if;

  select * into version
  from public.contract_versions
  where id = booking.current_contract_version_id
    and booking_id = booking.id
  for share;

  if version.id is null or not private.payment_contract_ready(booking) then
    raise exception 'payment_current_signed_contract_required'
      using errcode = '55000';
  end if;

  select * into configuration
  from private.gcash_payment_configuration
  where singleton
  for share;

  if not configuration.enabled then
    raise exception 'payment_recipient_unavailable' using errcode = '55000';
  end if;

  select * into previous
  from public.payment_transactions
  where booking_id = booking.id
    and direction = 'incoming'
    and status = 'rejected'
  order by submitted_at desc, id desc
  limit 1
  for share;

  insert into public.payment_transactions (
    booking_id,
    direction,
    amount,
    reference,
    counterparty_display_name,
    submitted_at,
    submitted_by,
    submission_attempt_id,
    contract_version_id,
    recipient_config_version,
    recipient_name_snapshot,
    recipient_account_snapshot,
    supersedes_id
  ) values (
    booking.id,
    'incoming',
    p_amount,
    btrim(p_reference),
    normalized_sender,
    submission_time,
    caller,
    p_attempt_id,
    version.id,
    configuration.version,
    configuration.recipient_name,
    configuration.recipient_account,
    previous.id
  ) returning id into payment_id;

  perform private.transition_booking(
    booking.id,
    'TO_PAY',
    'PAYMENT_REVIEW',
    'renter',
    'payment_submitted',
    null,
    operation_id
  );

  perform private.write_payment_audit(
    caller,
    operation_id,
    'submit_payment',
    payment_id,
    'success',
    'manual GCash payment submission',
    jsonb_build_object(
      'booking_id', booking.id,
      'contract_version_id', version.id,
      'recipient_config_version', configuration.version,
      'superseding_submission', previous.id is not null
    )
  );

  return jsonb_build_object(
    'booking_state', 'PAYMENT_REVIEW',
    'created', true,
    'status', 'submitted',
    'transaction_id', payment_id
  );
end;
$$;

create function private.payment_proof_intent_json(
  p_intent private.payment_proof_upload_intents,
  p_include_private_target boolean default false
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_intent.id,
    'status', case
      when p_intent.status = 'awaiting_upload'
        and p_intent.expires_at <= statement_timestamp()
      then 'expired'
      else p_intent.status::text
    end,
    'expires_at', p_intent.expires_at,
    'transaction_id', p_intent.transaction_id,
    'proof_id', p_intent.proof_id,
    'media_type', p_intent.expected_media_type,
    'byte_size', p_intent.expected_byte_size,
    'object_path', case when p_include_private_target then p_intent.object_path end
  ));
$$;

create function private.create_payment_proof_upload_intent(
  p_intent_id uuid,
  p_transaction_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  booking_id uuid;
  booking public.bookings%rowtype;
  payment public.payment_transactions%rowtype;
  policy private.payment_proof_policies%rowtype;
  active_intent private.payment_proof_upload_intents%rowtype;
  current_proof public.payment_proofs%rowtype;
  created_intent private.payment_proof_upload_intents%rowtype;
  expected_hash bytea;
  extension text;
  proof_id uuid;
  target_path text;
begin
  if p_intent_id is null
    or p_transaction_id is null
    or p_operation_id is null
    or caller is null
    or p_actor_user_id is distinct from caller
  then
    raise exception 'payment_proof_intent_invalid' using errcode = '22023';
  end if;
  if p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'payment_proof_digest_invalid' using errcode = '22023';
  end if;
  expected_hash := decode(p_sha256_hex, 'hex');

  select * into policy
  from private.payment_proof_policies
  where singleton
  for share;

  extension := private.payment_proof_extension(p_media_type);
  if extension is null
    or not (p_media_type = any(policy.allowed_media_types))
    or p_byte_size is null
    or p_byte_size not between 1 and policy.max_byte_size
  then
    raise exception 'payment_proof_file_invalid' using errcode = '22023';
  end if;

  select candidate.booking_id into booking_id
  from public.payment_transactions as candidate
  where candidate.id = p_transaction_id;

  select * into booking
  from public.bookings
  where id = booking_id
  for update;

  select * into payment
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if booking.id is null
    or payment.id is null
    or booking.renter_id <> caller
    or payment.submitted_by <> caller
    or payment.booking_id <> booking.id
    or payment.direction <> 'incoming'
    or payment.status <> 'submitted'
    or booking.state <> 'PAYMENT_REVIEW'
  then
    raise exception 'payment_proof_submission_not_found' using errcode = 'P0002';
  end if;

  select * into active_intent
  from private.payment_proof_upload_intents
  where transaction_id = payment.id
    and status in ('awaiting_upload', 'cleanup_pending')
  order by created_at desc, id desc
  limit 1
  for update;

  if active_intent.id is not null then
    if active_intent.status = 'cleanup_pending' then
      return private.payment_proof_intent_json(active_intent, true);
    end if;

    if active_intent.expires_at <= clock_timestamp() then
      if exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'payment-proofs'
          and object.name = active_intent.object_path
      ) then
        update private.payment_proof_upload_intents
        set status = 'cleanup_pending',
            cleanup_requested_at = coalesce(cleanup_requested_at, clock_timestamp())
        where id = active_intent.id
        returning * into active_intent;

        perform private.write_payment_audit(
          caller,
          p_operation_id,
          'expire_payment_proof_upload_intent',
          payment.id,
          'cleanup_required',
          'payment proof upload recovery',
          jsonb_build_object('proof_intent_id', active_intent.id)
        );
        return private.payment_proof_intent_json(active_intent, true);
      end if;

      update private.payment_proof_upload_intents
      set status = 'expired'
      where id = active_intent.id;
      active_intent := null;
    elsif active_intent.expected_media_type = p_media_type
      and active_intent.expected_byte_size = p_byte_size
      and active_intent.expected_sha256 = expected_hash
    then
      return private.payment_proof_intent_json(active_intent, true);
    else
      raise exception 'payment_proof_upload_in_progress' using errcode = '55000';
    end if;
  end if;

  select * into current_proof
  from public.payment_proofs as proof
  where proof.transaction_id = payment.id
    and proof.finalized_at is not null
    and not exists (
      select 1
      from public.payment_proofs as successor
      where successor.supersedes_id = proof.id
    )
  order by proof.created_at desc, proof.id desc
  limit 1
  for share;

  if current_proof.id is not null
    and current_proof.media_type = p_media_type
    and current_proof.byte_size = p_byte_size
    and current_proof.sha256 = expected_hash
  then
    return jsonb_build_object(
      'status', 'finalized',
      'transaction_id', payment.id,
      'proof_id', current_proof.id,
      'media_type', current_proof.media_type,
      'byte_size', current_proof.byte_size
    );
  end if;

  proof_id := gen_random_uuid();
  target_path := format('%s/%s.%s', p_intent_id, proof_id, extension);

  insert into private.payment_proof_upload_intents (
    id,
    transaction_id,
    owner_user_id,
    proof_id,
    object_path,
    expected_media_type,
    expected_byte_size,
    expected_sha256,
    supersedes_proof_id,
    expires_at
  ) values (
    p_intent_id,
    payment.id,
    caller,
    proof_id,
    target_path,
    p_media_type,
    p_byte_size,
    expected_hash,
    current_proof.id,
    clock_timestamp() + policy.upload_intent_ttl
  ) returning * into created_intent;

  perform private.write_payment_audit(
    caller,
    p_operation_id,
    'create_payment_proof_upload_intent',
    payment.id,
    'success',
    'payment proof upload',
    jsonb_build_object(
      'proof_intent_id', created_intent.id,
      'media_type', p_media_type,
      'byte_size', p_byte_size,
      'replacement', current_proof.id is not null
    )
  );

  return private.payment_proof_intent_json(created_intent, true);
end;
$$;

create function private.get_payment_proof_upload_intent(
  p_intent_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target private.payment_proof_upload_intents%rowtype;
begin
  if p_intent_id is null or p_owner_user_id is null then
    raise exception 'payment_proof_intent_invalid' using errcode = '22023';
  end if;

  select * into target
  from private.payment_proof_upload_intents
  where id = p_intent_id
    and owner_user_id = p_owner_user_id;

  if target.id is null then
    raise exception 'payment_proof_intent_not_found' using errcode = 'P0002';
  end if;
  return private.payment_proof_intent_json(target, true);
end;
$$;

create function private.finalize_payment_proof_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  booking_id uuid;
  target_transaction_id uuid;
  booking public.bookings%rowtype;
  payment public.payment_transactions%rowtype;
  target private.payment_proof_upload_intents%rowtype;
  stored_object storage.objects%rowtype;
  existing_proof public.payment_proofs%rowtype;
  created_proof public.payment_proofs%rowtype;
begin
  if p_intent_id is null
    or p_operation_id is null
    or caller is null
    or p_actor_user_id is distinct from caller
    or p_verified_sha256_hex is null
    or p_verified_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'payment_proof_finalization_invalid' using errcode = '22023';
  end if;

  select intent.transaction_id into target_transaction_id
  from private.payment_proof_upload_intents as intent
  where intent.id = p_intent_id;

  select candidate.booking_id into booking_id
  from public.payment_transactions as candidate
  where candidate.id = target_transaction_id;

  select * into booking
  from public.bookings
  where id = booking_id
  for update;

  select * into payment
  from public.payment_transactions
  where id = target_transaction_id
  for update;

  select * into target
  from private.payment_proof_upload_intents
  where id = p_intent_id
  for update;

  if target.id is null
    or target.owner_user_id <> caller
    or target.transaction_id <> payment.id
    or booking.id is null
    or booking.renter_id <> caller
    or booking.state <> 'PAYMENT_REVIEW'
    or payment.status <> 'submitted'
  then
    raise exception 'payment_proof_finalization_not_found' using errcode = 'P0002';
  end if;

  if target.status = 'finalized' then
    select * into existing_proof
    from public.payment_proofs
    where upload_intent_id = target.id;

    if existing_proof.id is null
      or existing_proof.id <> target.proof_id
      or existing_proof.transaction_id <> target.transaction_id
    then
      raise exception 'payment_proof_finalization_inconsistent'
        using errcode = '23514';
    end if;

    return jsonb_build_object(
      'status', 'finalized',
      'transaction_id', target.transaction_id,
      'proof_id', target.proof_id,
      'created', false
    );
  end if;

  if target.status <> 'awaiting_upload'
    or target.expires_at <= clock_timestamp()
    or p_verified_media_type is distinct from target.expected_media_type
    or p_verified_byte_size is distinct from target.expected_byte_size
    or decode(p_verified_sha256_hex, 'hex') is distinct from target.expected_sha256
  then
    raise exception 'payment_proof_bytes_do_not_match_intent'
      using errcode = '23514';
  end if;

  select * into stored_object
  from storage.objects as object
  where object.bucket_id = 'payment-proofs'
    and object.name = target.object_path;

  if stored_object.id is null or stored_object.created_at > target.expires_at then
    raise exception 'payment_proof_object_missing_or_late' using errcode = 'P0002';
  end if;
  if coalesce(stored_object.metadata ->> 'mimetype', '') <> target.expected_media_type
    or coalesce(stored_object.metadata ->> 'size', '') !~ '^[0-9]+$'
    or (stored_object.metadata ->> 'size')::bigint <> target.expected_byte_size
  then
    raise exception 'payment_proof_storage_metadata_invalid'
      using errcode = '23514';
  end if;

  if target.supersedes_proof_id is not null and not exists (
    select 1
    from public.payment_proofs as proof
    where proof.id = target.supersedes_proof_id
      and proof.transaction_id = target.transaction_id
      and proof.owner_user_id = caller
      and proof.finalized_at is not null
      and not exists (
        select 1
        from public.payment_proofs as successor
        where successor.supersedes_id = proof.id
      )
  ) then
    raise exception 'payment_proof_replacement_stale' using errcode = '40001';
  end if;

  insert into public.payment_proofs (
    id,
    transaction_id,
    owner_user_id,
    object_path,
    media_type,
    byte_size,
    sha256,
    supersedes_id,
    upload_intent_id,
    finalized_at
  ) values (
    target.proof_id,
    target.transaction_id,
    caller,
    target.object_path,
    target.expected_media_type,
    target.expected_byte_size,
    target.expected_sha256,
    target.supersedes_proof_id,
    target.id,
    clock_timestamp()
  ) returning * into created_proof;

  update private.payment_proof_upload_intents
  set status = 'finalized',
      finalized_at = clock_timestamp()
  where id = target.id;

  perform private.write_payment_audit(
    caller,
    p_operation_id,
    'finalize_payment_proof_upload',
    payment.id,
    'success',
    'payment proof upload',
    jsonb_build_object(
      'proof_id', created_proof.id,
      'media_type', created_proof.media_type,
      'byte_size', created_proof.byte_size,
      'replacement', created_proof.supersedes_id is not null
    )
  );

  return jsonb_build_object(
    'status', 'finalized',
    'transaction_id', payment.id,
    'proof_id', created_proof.id,
    'created', true
  );
end;
$$;

create function private.prepare_payment_proof_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.payment_proof_upload_intents%rowtype;
begin
  if p_intent_id is null
    or p_operation_id is null
    or p_owner_user_id is null
    or p_actor_user_id is distinct from p_owner_user_id
  then
    raise exception 'payment_proof_cleanup_invalid' using errcode = '22023';
  end if;

  select * into target
  from private.payment_proof_upload_intents
  where id = p_intent_id
    and owner_user_id = p_owner_user_id
  for update;

  if target.id is null then
    raise exception 'payment_proof_intent_not_found' using errcode = 'P0002';
  end if;
  if target.status = 'finalized' then
    raise exception 'finalized_payment_proof_cannot_be_cleaned'
      using errcode = '55000';
  end if;
  if target.status in ('cleaned', 'expired') then
    return private.payment_proof_intent_json(target, true);
  end if;

  update private.payment_proof_upload_intents
  set status = case
        when exists (
          select 1 from storage.objects as object
          where object.bucket_id = 'payment-proofs'
            and object.name = target.object_path
        ) then 'cleanup_pending'::private.payment_proof_upload_intent_status
        else 'cleaned'::private.payment_proof_upload_intent_status
      end,
      cleanup_requested_at = coalesce(cleanup_requested_at, clock_timestamp()),
      cleaned_at = case
        when not exists (
          select 1 from storage.objects as object
          where object.bucket_id = 'payment-proofs'
            and object.name = target.object_path
        ) then clock_timestamp()
        else cleaned_at
      end
  where id = target.id
  returning * into target;

  perform private.write_payment_audit(
    p_actor_user_id,
    p_operation_id,
    'prepare_payment_proof_upload_cleanup',
    target.transaction_id,
    target.status::text,
    'payment proof upload recovery',
    jsonb_build_object('proof_intent_id', target.id)
  );

  return private.payment_proof_intent_json(target, true);
end;
$$;

create function private.finalize_payment_proof_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.payment_proof_upload_intents%rowtype;
begin
  if p_intent_id is null
    or p_operation_id is null
    or p_owner_user_id is null
    or p_actor_user_id is distinct from p_owner_user_id
  then
    raise exception 'payment_proof_cleanup_invalid' using errcode = '22023';
  end if;

  select * into target
  from private.payment_proof_upload_intents
  where id = p_intent_id
    and owner_user_id = p_owner_user_id
  for update;

  if target.id is null then
    raise exception 'payment_proof_intent_not_found' using errcode = 'P0002';
  end if;
  if target.status = 'cleaned' then
    return private.payment_proof_intent_json(target, true);
  end if;
  if target.status <> 'cleanup_pending' or exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'payment-proofs'
      and object.name = target.object_path
  ) then
    raise exception 'payment_proof_cleanup_not_complete' using errcode = '55000';
  end if;

  update private.payment_proof_upload_intents
  set status = 'cleaned',
      cleaned_at = clock_timestamp()
  where id = target.id
  returning * into target;

  perform private.write_payment_audit(
    p_actor_user_id,
    p_operation_id,
    'finalize_payment_proof_upload_cleanup',
    target.transaction_id,
    'success',
    'payment proof upload recovery',
    jsonb_build_object('proof_intent_id', target.id)
  );

  return private.payment_proof_intent_json(target, true);
end;
$$;

create function private.can_insert_payment_proof(
  p_object_path text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from private.payment_proof_upload_intents as intent
      join public.payment_transactions as payment
        on payment.id = intent.transaction_id
      join public.bookings as booking
        on booking.id = payment.booking_id
      where intent.object_path = p_object_path
        and intent.owner_user_id = auth.uid()
        and booking.renter_id = auth.uid()
        and booking.state = 'PAYMENT_REVIEW'
        and payment.status = 'submitted'
        and intent.status = 'awaiting_upload'
        and intent.expires_at > statement_timestamp()
        and coalesce(p_metadata ->> 'mimetype', '') = intent.expected_media_type
        and coalesce(p_metadata ->> 'size', '') ~ '^[0-9]+$'
        and (p_metadata ->> 'size')::bigint = intent.expected_byte_size
    );
$$;

create function private.can_select_payment_proof(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.payment_proofs as proof
      join public.payment_transactions as payment
        on payment.id = proof.transaction_id
      join public.bookings as booking
        on booking.id = payment.booking_id
      where proof.object_path = p_object_path
        and proof.finalized_at is not null
        and proof.owner_user_id = auth.uid()
        and booking.renter_id = auth.uid()
    );
$$;

create function private.can_delete_payment_proof_upload(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from private.payment_proof_upload_intents as intent
      where intent.object_path = p_object_path
        and intent.owner_user_id = auth.uid()
        and intent.status = 'cleanup_pending'
    );
$$;

drop policy if exists payment_proof_objects_owner_read on storage.objects;
drop policy if exists payment_proof_objects_owner_insert on storage.objects;

create policy payment_proof_objects_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and (select private.can_select_payment_proof(name))
);

create policy payment_proof_objects_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and (select private.can_insert_payment_proof(name, metadata))
);

create policy payment_proof_objects_owner_delete_unfinished
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-proofs'
  and (select private.can_delete_payment_proof_upload(name))
);

create function private.get_payment_review_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'transaction_id', payment.id,
      'booking_id', booking.id,
      'camera_name', camera.name,
      'renter_legal_name', profile.legal_name,
      'declared_amount', payment.amount,
      'currency', payment.currency,
      'sender_name', payment.counterparty_display_name,
      'reference', payment.reference,
      'submitted_at', payment.submitted_at,
      'age_seconds', greatest(
        0,
        floor(extract(epoch from statement_timestamp() - payment.submitted_at))
      )::bigint,
      'approval_deadline_at', booking.approval_deadline_at,
      'proof_exists', exists (
        select 1
        from public.payment_proofs as proof
        where proof.transaction_id = payment.id
          and proof.finalized_at is not null
          and not exists (
            select 1 from public.payment_proofs as successor
            where successor.supersedes_id = proof.id
          )
      )
    ) order by payment.submitted_at, payment.id
  ), '[]'::jsonb) into result
  from public.payment_transactions as payment
  join public.bookings as booking on booking.id = payment.booking_id
  join public.profiles as profile on profile.user_id = booking.renter_id
  join public.cameras as camera on camera.id = booking.camera_id
  where payment.direction = 'incoming'
    and payment.status = 'submitted'
    and booking.state = 'PAYMENT_REVIEW'
    and payment.contract_version_id = booking.current_contract_version_id;

  return result;
end;
$$;

create function private.get_payment_review_detail(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  profile public.profiles%rowtype;
  camera public.cameras%rowtype;
  proof public.payment_proofs%rowtype;
begin
  perform private.require_admin();

  select * into payment
  from public.payment_transactions
  where id = p_payment_id
    and direction = 'incoming'
    and status = 'submitted';

  if payment.id is null then
    raise exception 'payment_review_not_found' using errcode = 'P0002';
  end if;

  select * into booking from public.bookings where id = payment.booking_id;
  if booking.state <> 'PAYMENT_REVIEW'
    or payment.contract_version_id <> booking.current_contract_version_id
  then
    raise exception 'payment_review_stale' using errcode = 'P0001';
  end if;
  select * into profile from public.profiles where user_id = booking.renter_id;
  select * into camera from public.cameras where id = booking.camera_id;

  select * into proof
  from public.payment_proofs as candidate
  where candidate.transaction_id = payment.id
    and candidate.finalized_at is not null
    and not exists (
      select 1 from public.payment_proofs as successor
      where successor.supersedes_id = candidate.id
    )
  order by candidate.created_at desc, candidate.id desc
  limit 1;

  return jsonb_build_object(
    'transaction_id', payment.id,
    'booking_id', booking.id,
    'booking_state', booking.state,
    'camera_name', camera.name,
    'renter_legal_name', profile.legal_name,
    'declared_amount', payment.amount,
    'rental_amount', booking.rental_amount,
    'security_deposit', booking.security_deposit_amount,
    'total_due', booking.total_due,
    'currency', payment.currency,
    'sender_name', payment.counterparty_display_name,
    'reference', payment.reference,
    'submitted_at', payment.submitted_at,
    'approval_deadline_at', booking.approval_deadline_at,
    'recipient_name', payment.recipient_name_snapshot,
    'recipient_account', payment.recipient_account_snapshot,
    'proof', case when proof.id is null then null else jsonb_build_object(
      'proof_id', proof.id,
      'media_type', proof.media_type,
      'byte_size', proof.byte_size,
      'finalized_at', proof.finalized_at
    ) end
  );
end;
$$;

create function private.authorize_payment_proof_access(
  p_payment_id uuid,
  p_purpose text,
  p_operation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_actor_user_id;
  booking_id uuid;
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  proof public.payment_proofs%rowtype;
begin
  if caller is null or not exists (
    select 1
    from private.admin_accounts
    where user_id = caller
  ) then
    raise exception 'payment_proof_access_unauthorized' using errcode = '42501';
  end if;
  if p_operation_id is null or p_purpose <> 'payment_reconciliation' then
    raise exception 'payment_proof_access_invalid' using errcode = '22023';
  end if;

  select candidate.booking_id into booking_id
  from public.payment_transactions as candidate
  where candidate.id = p_payment_id;

  select * into booking
  from public.bookings
  where id = booking_id
  for share;

  select * into payment
  from public.payment_transactions
  where id = p_payment_id
    and direction = 'incoming'
  for share;

  if payment.id is null
    or booking.id is null
    or payment.booking_id <> booking.id
    or payment.status <> 'submitted'
    or booking.state <> 'PAYMENT_REVIEW'
  then
    raise exception 'payment_proof_access_stale' using errcode = 'P0001';
  end if;

  select * into proof
  from public.payment_proofs as candidate
  where candidate.transaction_id = payment.id
    and candidate.finalized_at is not null
    and not exists (
      select 1 from public.payment_proofs as successor
      where successor.supersedes_id = candidate.id
    )
  order by candidate.created_at desc, candidate.id desc
  limit 1
  for share;

  if proof.id is null then
    raise exception 'payment_proof_unavailable' using errcode = 'P0002';
  end if;

  perform private.write_payment_audit(
    caller,
    p_operation_id,
    'authorize_payment_proof_access',
    payment.id,
    'authorized',
    'manual GCash payment reconciliation',
    jsonb_build_object(
      'proof_id', proof.id,
      'expires_in_seconds', 60
    )
  );

  return jsonb_build_object(
    'transaction_id', payment.id,
    'proof_id', proof.id,
    'object_path', proof.object_path,
    'expires_in_seconds', 60
  );
end;
$$;

create function private.verify_payment(
  p_payment_id uuid,
  p_observed_amount numeric,
  p_observed_reference text,
  p_actual_account_checked boolean,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  booking_id uuid;
  booking public.bookings%rowtype;
  payment public.payment_transactions%rowtype;
  observed_reference text := private.normalize_gcash_reference(p_observed_reference);
  decision_time timestamptz;
  allocation_count integer;
begin
  if p_payment_id is null
    or p_operation_id is null
    or p_actual_account_checked is not true
    or p_observed_amount is null
    or p_observed_amount <= 0
    or scale(p_observed_amount) > 2
    or length(observed_reference) not between 4 and 64
    or btrim(coalesce(p_observed_reference, '')) !~ '^[A-Za-z0-9 -]+$'
  then
    raise exception 'payment_verification_invalid' using errcode = '22023';
  end if;

  select candidate.booking_id into booking_id
  from public.payment_transactions as candidate
  where candidate.id = p_payment_id;

  select * into booking
  from public.bookings
  where id = booking_id
  for update;

  select * into payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if booking.id is null or payment.id is null or payment.direction <> 'incoming' then
    raise exception 'payment_review_not_found' using errcode = 'P0002';
  end if;

  if payment.status = 'verified' then
    select count(*)::integer into allocation_count
    from public.payment_allocations
    where transaction_id = payment.id;
    if booking.state <> 'CONFIRMED'
      or allocation_count <> 2
      or p_observed_amount <> payment.amount
      or observed_reference <> payment.reference_canonical
    then
      raise exception 'payment_verification_retry_conflict' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'booking_state', booking.state,
      'created', false,
      'status', payment.status,
      'transaction_id', payment.id
    );
  end if;

  if payment.status <> 'submitted'
    or booking.state <> 'PAYMENT_REVIEW'
    or payment.contract_version_id <> booking.current_contract_version_id
  then
    raise exception 'payment_review_stale' using errcode = '40001';
  end if;
  if payment.submitted_at >= booking.approval_deadline_at then
    raise exception 'payment_submission_not_timely' using errcode = '23514';
  end if;
  if p_observed_amount <> payment.amount
    or payment.amount <> booking.total_due
    or observed_reference <> payment.reference_canonical
  then
    raise exception 'payment_actual_account_mismatch' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.payment_transactions as duplicate
    where duplicate.id <> payment.id
      and duplicate.direction = 'incoming'
      and duplicate.status = 'verified'
      and duplicate.reference_canonical = payment.reference_canonical
  ) then
    raise exception 'payment_reference_already_verified' using errcode = '23505';
  end if;

  decision_time := clock_timestamp();
  perform set_config('camnook.payment_operation_id', p_operation_id::text, true);

  insert into public.payment_allocations (
    transaction_id,
    booking_id,
    kind,
    amount
  ) values
    (payment.id, booking.id, 'rental_payment', booking.rental_amount),
    (payment.id, booking.id, 'security_deposit', booking.security_deposit_amount);

  update public.payment_transactions
  set status = 'verified',
      decided_at = decision_time,
      decided_by = caller,
      rejection_reason = null,
      rejection_reason_code = null
  where id = payment.id;

  perform private.transition_booking(
    booking.id,
    'PAYMENT_REVIEW',
    'CONFIRMED',
    'admin',
    'payment_verified',
    null,
    p_operation_id
  );

  perform private.write_payment_audit(
    caller,
    p_operation_id,
    'verify_payment',
    payment.id,
    'success',
    'manual GCash payment reconciliation',
    jsonb_build_object(
      'booking_id', booking.id,
      'booking_state', 'CONFIRMED',
      'allocation_count', 2,
      'allocation_kinds', jsonb_build_array(
        'rental_payment',
        'security_deposit'
      )
    )
  );

  perform set_config('camnook.payment_operation_id', '', true);

  return jsonb_build_object(
    'booking_state', 'CONFIRMED',
    'created', true,
    'status', 'verified',
    'transaction_id', payment.id
  );
end;
$$;

create function private.reject_payment(
  p_payment_id uuid,
  p_reason_code text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  booking_id uuid;
  booking public.bookings%rowtype;
  payment public.payment_transactions%rowtype;
  target_state public.booking_state;
  decision_time timestamptz;
begin
  if p_payment_id is null
    or p_operation_id is null
    or p_reason_code not in (
      'amount_mismatch',
      'duplicate_reference',
      'not_found_in_gcash',
      'reference_mismatch',
      'sender_mismatch',
      'unconfirmed_transfer'
    )
  then
    raise exception 'payment_rejection_invalid' using errcode = '22023';
  end if;

  select candidate.booking_id into booking_id
  from public.payment_transactions as candidate
  where candidate.id = p_payment_id;

  select * into booking
  from public.bookings
  where id = booking_id
  for update;

  select * into payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if booking.id is null or payment.id is null or payment.direction <> 'incoming' then
    raise exception 'payment_review_not_found' using errcode = 'P0002';
  end if;

  if payment.status = 'rejected' then
    if payment.rejection_reason_code <> p_reason_code
      or booking.state not in ('TO_PAY', 'EXPIRED')
    then
      raise exception 'payment_rejection_retry_conflict' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'booking_state', booking.state,
      'created', false,
      'status', payment.status,
      'transaction_id', payment.id
    );
  end if;

  if payment.status <> 'submitted' or booking.state <> 'PAYMENT_REVIEW' then
    raise exception 'payment_review_stale' using errcode = '40001';
  end if;

  -- The deadline decision is made only after the aggregate locks are held, so
  -- time spent waiting behind another operation cannot produce a pre-deadline
  -- outcome after the original window has actually closed.
  decision_time := clock_timestamp();
  target_state := case
    when decision_time < booking.approval_deadline_at
      then 'TO_PAY'::public.booking_state
    else 'EXPIRED'::public.booking_state
  end;

  perform set_config('camnook.payment_operation_id', p_operation_id::text, true);

  update public.payment_transactions
  set status = 'rejected',
      decided_at = decision_time,
      decided_by = caller,
      rejection_reason = p_reason_code,
      rejection_reason_code = p_reason_code
  where id = payment.id;

  perform private.transition_booking(
    booking.id,
    'PAYMENT_REVIEW',
    target_state,
    'admin',
    'payment_rejected',
    null,
    p_operation_id
  );

  if target_state = 'EXPIRED' then
    perform private.release_booking_block(booking.id, caller);
  end if;

  perform private.write_payment_audit(
    caller,
    p_operation_id,
    'reject_payment',
    payment.id,
    'success',
    'manual GCash payment reconciliation',
    jsonb_build_object(
      'booking_id', booking.id,
      'booking_state', target_state,
      'reason_code', p_reason_code
    )
  );

  perform set_config('camnook.payment_operation_id', '', true);

  return jsonb_build_object(
    'booking_state', target_state,
    'created', true,
    'status', 'rejected',
    'transaction_id', payment.id
  );
end;
$$;

create function private.get_payment_accounting_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'currency', 'PHP',
    'verified_rental_revenue', coalesce(sum(allocation.amount)
      filter (where allocation.kind = 'rental_payment'), 0),
    'security_deposit_liability', coalesce(sum(allocation.amount)
      filter (where allocation.kind = 'security_deposit'), 0)
  ) into result
  from public.payment_allocations as allocation
  join public.payment_transactions as payment
    on payment.id = allocation.transaction_id
  where payment.direction = 'incoming'
    and payment.status = 'verified';

  return result;
end;
$$;

create function private.get_payment_audit_history(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();
  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'payment_booking_not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'audit_id', audit.id,
    'actor_user_id', audit.actor_user_id,
    'operation_id', audit.operation_id,
    'action', audit.action,
    'transaction_id', audit.entity_id,
    'outcome', audit.outcome,
    'purpose', audit.purpose,
    'occurred_at', audit.occurred_at
  ) order by audit.occurred_at, audit.id), '[]'::jsonb)
  into result
  from private.audit_logs as audit
  where audit.entity_type = 'payment_transaction'
    and exists (
      select 1
      from public.payment_transactions as payment
      where payment.id = audit.entity_id
        and payment.booking_id = p_booking_id
    );

  return result;
end;
$$;

create function api.configure_gcash_recipient(
  p_recipient_name text,
  p_recipient_account text,
  p_enabled boolean,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.configure_gcash_recipient(
    p_recipient_name,
    p_recipient_account,
    p_enabled,
    p_operation_id
  );
$$;

create function api.get_payment_proof_policy()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_payment_proof_policy(); $$;

create function api.get_my_payment_state(p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_my_payment_state(p_booking_id); $$;

create function api.submit_payment(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_amount numeric,
  p_reference text,
  p_sender_name text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_payment(
    p_booking_id,
    p_attempt_id,
    p_amount,
    p_reference,
    p_sender_name
  );
$$;

create function api.create_payment_proof_upload_intent(
  p_intent_id uuid,
  p_transaction_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_payment_proof_upload_intent(
    p_intent_id,
    p_transaction_id,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.get_payment_proof_upload_intent(
  p_intent_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_payment_proof_upload_intent(
    p_intent_id,
    p_owner_user_id
  );
$$;

create function api.finalize_payment_proof_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_payment_proof_upload(
    p_intent_id,
    p_verified_media_type,
    p_verified_byte_size,
    p_verified_sha256_hex,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.prepare_payment_proof_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.prepare_payment_proof_upload_cleanup(
    p_intent_id,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.finalize_payment_proof_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_payment_proof_upload_cleanup(
    p_intent_id,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.get_payment_review_queue()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_payment_review_queue(); $$;

create function api.get_payment_review_detail(p_payment_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_payment_review_detail(p_payment_id); $$;

create function api.authorize_payment_proof_access(
  p_payment_id uuid,
  p_purpose text,
  p_operation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.authorize_payment_proof_access(
    p_payment_id,
    p_purpose,
    p_operation_id,
    p_actor_user_id
  );
$$;

create function api.verify_payment(
  p_payment_id uuid,
  p_observed_amount numeric,
  p_observed_reference text,
  p_actual_account_checked boolean,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.verify_payment(
    p_payment_id,
    p_observed_amount,
    p_observed_reference,
    p_actual_account_checked,
    p_operation_id
  );
$$;

create function api.reject_payment(
  p_payment_id uuid,
  p_reason_code text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.reject_payment(
    p_payment_id,
    p_reason_code,
    p_operation_id
  );
$$;

create function api.get_payment_accounting_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_payment_accounting_summary(); $$;

create function api.get_payment_audit_history(p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_payment_audit_history(p_booking_id); $$;

revoke all on table private.gcash_payment_configuration
from public, anon, authenticated, service_role;
revoke all on table private.payment_proof_policies
from public, anon, authenticated, service_role;
revoke all on table private.payment_proof_upload_intents
from public, anon, authenticated, service_role;

revoke execute on function
  private.normalize_gcash_reference(text),
  private.payment_text_has_forbidden_characters(text),
  private.payment_proof_extension(text),
  private.write_payment_audit(uuid, uuid, text, uuid, text, text, jsonb),
  private.guard_payment_transaction_history(),
  private.reject_payment_history_mutation(),
  private.assert_payment_allocation_balance(),
  private.payment_contract_ready(public.bookings),
  private.configure_gcash_recipient(text, text, boolean, uuid),
  private.payment_proof_policy_json(),
  private.get_payment_proof_policy(),
  private.get_my_payment_state(uuid),
  private.submit_payment(uuid, uuid, numeric, text, text),
  private.payment_proof_intent_json(private.payment_proof_upload_intents, boolean),
  private.create_payment_proof_upload_intent(uuid, uuid, text, bigint, text, uuid, uuid, uuid),
  private.get_payment_proof_upload_intent(uuid, uuid),
  private.finalize_payment_proof_upload(uuid, text, bigint, text, uuid, uuid, uuid),
  private.prepare_payment_proof_upload_cleanup(uuid, uuid, uuid, uuid),
  private.finalize_payment_proof_upload_cleanup(uuid, uuid, uuid, uuid),
  private.can_insert_payment_proof(text, jsonb),
  private.can_select_payment_proof(text),
  private.can_delete_payment_proof_upload(text),
  private.get_payment_review_queue(),
  private.get_payment_review_detail(uuid),
  private.authorize_payment_proof_access(uuid, text, uuid, uuid),
  private.verify_payment(uuid, numeric, text, boolean, uuid),
  private.reject_payment(uuid, text, uuid),
  private.get_payment_accounting_summary(),
  private.get_payment_audit_history(uuid)
from public, anon, authenticated, service_role;

grant execute on function private.configure_gcash_recipient(text, text, boolean, uuid)
to authenticated;
grant execute on function private.get_payment_proof_policy()
to authenticated;
grant execute on function private.get_my_payment_state(uuid)
to authenticated;
grant execute on function private.submit_payment(uuid, uuid, numeric, text, text)
to authenticated;
grant execute on function private.get_payment_review_queue()
to authenticated;
grant execute on function private.get_payment_review_detail(uuid)
to authenticated;
grant execute on function private.authorize_payment_proof_access(uuid, text, uuid, uuid)
to service_role;
grant execute on function private.verify_payment(uuid, numeric, text, boolean, uuid)
to authenticated;
grant execute on function private.reject_payment(uuid, text, uuid)
to authenticated;
grant execute on function private.get_payment_accounting_summary()
to authenticated;
grant execute on function private.get_payment_audit_history(uuid)
to authenticated;

grant execute on function private.create_payment_proof_upload_intent(
  uuid, uuid, text, bigint, text, uuid, uuid, uuid
) to service_role;
grant execute on function private.get_payment_proof_upload_intent(uuid, uuid)
to service_role;
grant execute on function private.finalize_payment_proof_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
) to service_role;
grant execute on function private.prepare_payment_proof_upload_cleanup(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function private.finalize_payment_proof_upload_cleanup(
  uuid, uuid, uuid, uuid
) to service_role;

grant execute on function private.can_insert_payment_proof(text, jsonb)
to authenticated;
grant execute on function private.can_select_payment_proof(text)
to authenticated;
grant execute on function private.can_delete_payment_proof_upload(text)
to authenticated;

revoke execute on function
  api.configure_gcash_recipient(text, text, boolean, uuid),
  api.get_payment_proof_policy(),
  api.get_my_payment_state(uuid),
  api.submit_payment(uuid, uuid, numeric, text, text),
  api.create_payment_proof_upload_intent(uuid, uuid, text, bigint, text, uuid, uuid, uuid),
  api.get_payment_proof_upload_intent(uuid, uuid),
  api.finalize_payment_proof_upload(uuid, text, bigint, text, uuid, uuid, uuid),
  api.prepare_payment_proof_upload_cleanup(uuid, uuid, uuid, uuid),
  api.finalize_payment_proof_upload_cleanup(uuid, uuid, uuid, uuid),
  api.get_payment_review_queue(),
  api.get_payment_review_detail(uuid),
  api.authorize_payment_proof_access(uuid, text, uuid, uuid),
  api.verify_payment(uuid, numeric, text, boolean, uuid),
  api.reject_payment(uuid, text, uuid),
  api.get_payment_accounting_summary(),
  api.get_payment_audit_history(uuid)
from public, anon, authenticated, service_role;

grant execute on function api.configure_gcash_recipient(text, text, boolean, uuid)
to authenticated;
grant execute on function api.get_payment_proof_policy()
to authenticated;
grant execute on function api.get_my_payment_state(uuid)
to authenticated;
grant execute on function api.submit_payment(uuid, uuid, numeric, text, text)
to authenticated;
grant execute on function api.get_payment_review_queue()
to authenticated;
grant execute on function api.get_payment_review_detail(uuid)
to authenticated;
grant execute on function api.authorize_payment_proof_access(uuid, text, uuid, uuid)
to service_role;
grant execute on function api.verify_payment(uuid, numeric, text, boolean, uuid)
to authenticated;
grant execute on function api.reject_payment(uuid, text, uuid)
to authenticated;
grant execute on function api.get_payment_accounting_summary()
to authenticated;
grant execute on function api.get_payment_audit_history(uuid)
to authenticated;

grant execute on function api.create_payment_proof_upload_intent(
  uuid, uuid, text, bigint, text, uuid, uuid, uuid
) to service_role;
grant execute on function api.get_payment_proof_upload_intent(uuid, uuid)
to service_role;
grant execute on function api.finalize_payment_proof_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
) to service_role;
grant execute on function api.prepare_payment_proof_upload_cleanup(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function api.finalize_payment_proof_upload_cleanup(
  uuid, uuid, uuid, uuid
) to service_role;

comment on table private.gcash_payment_configuration is
  'Database-authoritative, fail-closed GCash recipient configuration. Payment rows snapshot the active version.';
comment on table private.payment_proof_upload_intents is
  'Short-lived exact-target intents for no-overwrite private payment proof uploads.';
comment on function private.submit_payment(uuid, uuid, numeric, text, text) is
  'Atomically accepts one timely idempotent owner submission against the current signed contract and original deadline.';
comment on function private.verify_payment(uuid, numeric, text, boolean, uuid) is
  'Atomically reconciles an actual-account match, derives balanced allocations, and confirms the booking.';
comment on function private.reject_payment(uuid, text, uuid) is
  'Atomically rejects a submitted transfer and deterministically retries or expires against the original deadline.';
