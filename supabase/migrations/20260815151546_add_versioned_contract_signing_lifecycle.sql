-- Sprint 3 turns the pre-existing contract schema into the authoritative,
-- versioned agreement lifecycle. All mutations remain narrow database
-- transactions; application roles keep read-only table grants.

create or replace function private.protect_contract_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deactivated_at is not null then
    raise exception 'deactivated contract templates are immutable'
      using errcode = '55000';
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
    raise exception 'approved contract template content is immutable'
      using errcode = '55000';
  end if;

  if old.activated_at is null then
    if new.deactivated_at is not null then
      raise exception 'contract template cannot be deactivated before activation'
        using errcode = '55000';
    end if;
  elsif old.activated_at is distinct from new.activated_at
    or new.deactivated_at is null
  then
    raise exception 'activated contract template lifecycle is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function private.protect_approved_booking_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  supersession_booking_id text := nullif(
    current_setting('camnook.contract_supersession_booking_id', true),
    ''
  );
  agreement_facts_changed boolean;
begin
  agreement_facts_changed :=
    old.renter_id is distinct from new.renter_id
    or old.camera_id is distinct from new.camera_id
    or old.pickup_at is distinct from new.pickup_at
    or old.return_at is distinct from new.return_at
    or old.intended_use is distinct from new.intended_use
    or old.expected_location is distinct from new.expected_location
    or old.requested_at is distinct from new.requested_at
    or old.approved_at is distinct from new.approved_at
    or old.approval_deadline_at is distinct from new.approval_deadline_at
    or old.approved_by is distinct from new.approved_by
    or old.billable_days_snapshot is distinct from new.billable_days_snapshot
    or old.daily_rate_snapshot is distinct from new.daily_rate_snapshot
    or old.rental_amount is distinct from new.rental_amount
    or old.security_deposit_amount is distinct from new.security_deposit_amount
    or old.currency is distinct from new.currency;

  if old.approved_at is not null and agreement_facts_changed then
    if supersession_booking_id is distinct from old.id::text
      or old.renter_id is distinct from new.renter_id
      or old.intended_use is distinct from new.intended_use
      or old.expected_location is distinct from new.expected_location
      or old.requested_at is distinct from new.requested_at
      or old.approved_at is distinct from new.approved_at
      or old.approval_deadline_at is distinct from new.approval_deadline_at
      or old.approved_by is distinct from new.approved_by
      or old.currency is distinct from new.currency
    then
      raise exception 'approved booking facts and deadline are immutable'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

create function private.validate_current_contract_pointer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_booking public.bookings%rowtype;
  current_status public.contract_version_status;
begin
  select * into current_booking
  from public.bookings as booking
  where booking.id = new.id;

  if current_booking.current_contract_version_id is null then
    if current_booking.approved_at is not null then
      raise exception 'approved booking requires a current contract version'
        using errcode = '23514';
    end if;
    return null;
  end if;

  select version.status into current_status
  from public.contract_versions as version
  where version.id = current_booking.current_contract_version_id
    and version.booking_id = current_booking.id;

  if not found
    or current_status = 'superseded'
    or (
      current_status = 'voided'
      and current_booking.state <> 'EXPIRED'
    )
  then
    raise exception 'current contract version must be the booking issued version'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger bookings_validate_current_contract_pointer
after insert or update on public.bookings
deferrable initially deferred
for each row execute function private.validate_current_contract_pointer();

create function private.contract_operation_id()
returns uuid
language sql
volatile
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('camnook.contract_operation_id', true), '')::uuid,
    gen_random_uuid()
  );
$$;

create function private.audit_contract_version_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
  audit_actor uuid;
  audit_time timestamptz;
begin
  if tg_op = 'INSERT' then
    audit_action := 'contract_created';
    audit_actor := new.issued_by;
    audit_time := new.issued_at;
  elsif old.status = 'issued' and new.status in ('superseded', 'voided') then
    audit_action := case
      when new.status = 'superseded' then 'contract_superseded'
      else 'contract_voided'
    end;
    audit_actor := auth.uid();
    audit_time := clock_timestamp();
  else
    return new;
  end if;

  insert into private.audit_logs (
    occurred_at,
    actor_user_id,
    operation_id,
    action,
    entity_type,
    entity_id,
    outcome,
    purpose,
    metadata
  ) values (
    audit_time,
    audit_actor,
    private.contract_operation_id(),
    audit_action,
    'contract_version',
    new.id,
    'success',
    'rental agreement lifecycle',
    jsonb_strip_nulls(jsonb_build_object(
      'actor_type', case when audit_actor is null then 'system' else 'admin' end,
      'booking_id', new.booking_id,
      'contract_version_id', new.id,
      'supersedes_id', new.supersedes_id,
      'version_no', new.version_no
    ))
  );

  return new;
end;
$$;

create trigger contract_versions_audit_insert
after insert on public.contract_versions
for each row execute function private.audit_contract_version_change();

create trigger contract_versions_audit_status
after update of status on public.contract_versions
for each row execute function private.audit_contract_version_change();

create function private.audit_contract_signature_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.audit_logs (
    occurred_at,
    actor_user_id,
    operation_id,
    action,
    entity_type,
    entity_id,
    outcome,
    purpose,
    metadata
  ) values (
    new.signed_at,
    new.renter_id,
    private.contract_operation_id(),
    'contract_signed',
    'contract_version',
    new.contract_version_id,
    'success',
    'electronic rental agreement consent',
    jsonb_build_object(
      'actor_type', 'renter',
      'contract_version_id', new.contract_version_id,
      'signature_id', new.id
    )
  );

  return new;
end;
$$;

create trigger contract_signatures_audit_insert
after insert on public.contract_signatures
for each row execute function private.audit_contract_signature_insert();

-- Preserve audit continuity for versions and signatures created by the earlier
-- approval scaffold before this lifecycle migration is applied.
insert into private.audit_logs (
  occurred_at,
  actor_user_id,
  operation_id,
  action,
  entity_type,
  entity_id,
  outcome,
  purpose,
  metadata
)
select
  version.issued_at,
  version.issued_by,
  gen_random_uuid(),
  'contract_created',
  'contract_version',
  version.id,
  'success',
  'rental agreement lifecycle',
  jsonb_strip_nulls(jsonb_build_object(
    'actor_type', 'admin',
    'booking_id', version.booking_id,
    'contract_version_id', version.id,
    'supersedes_id', version.supersedes_id,
    'version_no', version.version_no
  ))
from public.contract_versions as version
where not exists (
  select 1
  from private.audit_logs as audit
  where audit.action = 'contract_created'
    and audit.entity_type = 'contract_version'
    and audit.entity_id = version.id
);

insert into private.audit_logs (
  occurred_at,
  actor_user_id,
  operation_id,
  action,
  entity_type,
  entity_id,
  outcome,
  purpose,
  metadata
)
select
  signature.signed_at,
  signature.renter_id,
  gen_random_uuid(),
  'contract_signed',
  'contract_version',
  signature.contract_version_id,
  'success',
  'electronic rental agreement consent',
  jsonb_build_object(
    'actor_type', 'renter',
    'contract_version_id', signature.contract_version_id,
    'signature_id', signature.id
  )
from public.contract_signatures as signature
where not exists (
  select 1
  from private.audit_logs as audit
  where audit.action = 'contract_signed'
    and audit.metadata ->> 'signature_id' = signature.id::text
);

create function private.build_contract_snapshot(
  p_booking_id uuid,
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz,
  p_intended_use text,
  p_expected_location text
)
returns table (
  snapshot jsonb,
  template_id uuid,
  snapshot_schema_version integer,
  content_sha256 bytea,
  billable_days integer,
  daily_rate numeric(12,2),
  rental_amount numeric(12,2),
  security_deposit numeric(12,2),
  currency text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  target_camera public.cameras%rowtype;
  target_template public.contract_templates%rowtype;
  accessory record;
  accessories jsonb := '[]'::jsonb;
  price record;
  canonical_snapshot jsonb;
begin
  if p_booking_id is null
    or p_renter_id is null
    or p_camera_id is null
    or p_pickup_at is null
    or p_return_at is null
    or p_pickup_at >= p_return_at
    or p_pickup_at <= clock_timestamp()
  then
    raise exception 'contract_invalid_period' using errcode = '22023';
  end if;

  select * into target_profile
  from public.profiles as profile
  where profile.user_id = p_renter_id
  for share;

  if not found or target_profile.account_status <> 'active' then
    raise exception 'contract_profile_inactive' using errcode = '22023';
  end if;

  select * into target_camera
  from public.cameras as camera
  where camera.id = p_camera_id
  for share;

  if not found
    or target_camera.status <> 'published'
    or target_camera.archived_at is not null
    or target_camera.daily_rate is null
    or target_camera.security_deposit is null
  then
    raise exception 'contract_camera_unavailable' using errcode = '22023';
  end if;

  lock table public.camera_accessories in share mode;

  for accessory in
    select inclusion.id, inclusion.name, inclusion.quantity
    from public.camera_accessories as inclusion
    where inclusion.camera_id = p_camera_id
      and inclusion.archived_at is null
    order by inclusion.sort_position, inclusion.name, inclusion.id
    for share
  loop
    accessories := accessories || jsonb_build_array(jsonb_build_object(
      'id', accessory.id,
      'name', accessory.name,
      'quantity', accessory.quantity
    ));
  end loop;

  select * into target_template
  from public.contract_templates as template
  where template.approved_at is not null
    and template.activated_at is not null
    and template.deactivated_at is null
  order by template.id
  limit 1
  for share;

  if not found
    or jsonb_typeof(target_template.terms) <> 'object'
    or not (target_template.terms ?& array[
      'pickup',
      'return',
      'cancellation',
      'late-return',
      'damage',
      'loss',
      'non-transferability'
    ])
  then
    raise exception 'contract_template_unavailable' using errcode = '22023';
  end if;

  select * into price
  from private.calculate_booking_price(
    p_pickup_at,
    p_return_at,
    target_camera.daily_rate,
    target_camera.security_deposit
  );

  canonical_snapshot := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', p_booking_id,
      'pickup_at', to_char(
        p_pickup_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'return_at', to_char(
        p_return_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'intended_use', p_intended_use,
      'expected_location', p_expected_location
    ),
    'renter', jsonb_build_object(
      'legal_name', target_profile.legal_name,
      'phone', target_profile.phone
    ),
    'camera', jsonb_build_object(
      'id', target_camera.id,
      'name', target_camera.name,
      'serial_number', target_camera.serial_number,
      'accessories', accessories
    ),
    'pricing', jsonb_build_object(
      'billable_days', price.billable_days,
      'daily_rate', price.daily_rate,
      'rental_amount', price.rental_amount,
      'security_deposit', price.security_deposit,
      'total_due', price.total_due,
      'currency', price.currency
    ),
    'template', jsonb_build_object(
      'id', target_template.id,
      'version', target_template.version,
      'schema_version', target_template.schema_version,
      'content_sha256', encode(target_template.content_sha256, 'hex'),
      'terms', target_template.terms
    )
  );

  return query select
    canonical_snapshot,
    target_template.id,
    1,
    extensions.digest(convert_to(canonical_snapshot::text, 'UTF8'), 'sha256'),
    price.billable_days,
    price.daily_rate,
    price.rental_amount,
    price.security_deposit,
    price.currency;
end;
$$;

drop function api.sign_contract(uuid, text, text, bytea);
drop function private.sign_contract(uuid, text, text, bytea);

create function private.sign_contract(
  p_contract_version_id uuid,
  p_consent boolean
)
returns table (signature_id uuid, created boolean, signed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_booking public.bookings%rowtype;
  target_version public.contract_versions%rowtype;
  existing_signature public.contract_signatures%rowtype;
  operation_id uuid := gen_random_uuid();
  signature_time timestamptz;
begin
  if caller is null then
    raise exception 'contract_signing_unauthorized' using errcode = '42501';
  end if;

  select booking.* into target_booking
  from public.bookings as booking
  join public.contract_versions as version on version.booking_id = booking.id
  where version.id = p_contract_version_id
    and booking.renter_id = caller
  for update of booking;

  if not found then
    raise exception 'contract_not_found' using errcode = 'P0002';
  end if;

  select * into target_version
  from public.contract_versions as version
  where version.id = p_contract_version_id
  for update;

  if target_booking.current_contract_version_id is distinct from target_version.id
    or target_version.status <> 'issued'
  then
    raise exception 'contract_version_stale' using errcode = '40001';
  end if;

  select * into existing_signature
  from public.contract_signatures as signature
  where signature.contract_version_id = target_version.id
    and signature.renter_id = caller;

  if found then
    if target_booking.state <> 'TO_PAY'
      or existing_signature.acknowledged_content_sha256
        is distinct from target_version.content_sha256
    then
      raise exception 'contract_signature_stale' using errcode = '40001';
    end if;

    return query select existing_signature.id, false, existing_signature.signed_at;
    return;
  end if;

  if p_consent is not true then
    raise exception 'contract_consent_required' using errcode = '22023';
  end if;
  if target_booking.state <> 'CONTRACT_PENDING' then
    raise exception 'contract_not_signable' using errcode = '40001';
  end if;

  signature_time := clock_timestamp();
  if signature_time >= target_booking.approval_deadline_at then
    raise exception 'contract_deadline_elapsed' using errcode = '22023';
  end if;

  perform set_config('camnook.contract_operation_id', operation_id::text, true);

  insert into public.contract_signatures (
    contract_version_id,
    renter_id,
    signature_intent,
    attestation_text,
    signed_at,
    acknowledged_content_sha256
  ) values (
    target_version.id,
    caller,
    'electronic_signature',
    'I have reviewed and agree to this exact rental contract version.',
    signature_time,
    target_version.content_sha256
  ) returning id into signature_id;

  perform private.transition_booking(
    target_booking.id,
    'CONTRACT_PENDING',
    'TO_PAY',
    'renter',
    'contract_signed',
    null,
    operation_id
  );

  perform set_config('camnook.contract_operation_id', '', true);
  created := true;
  signed_at := signature_time;
  return next;
end;
$$;

create function private.supersede_contract(
  p_booking_id uuid,
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_booking public.bookings%rowtype;
  old_version public.contract_versions%rowtype;
  built record;
  new_version_id uuid;
  operation_id uuid := gen_random_uuid();
  issue_time timestamptz := clock_timestamp();
begin
  if caller is null or not private.is_admin() then
    raise exception 'contract_supersession_unauthorized' using errcode = '42501';
  end if;

  select * into target_booking
  from public.bookings as booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception 'contract_booking_not_found' using errcode = 'P0002';
  end if;
  if target_booking.state not in ('CONTRACT_PENDING', 'TO_PAY') then
    raise exception 'contract_supersession_stale_state' using errcode = '40001';
  end if;
  if issue_time >= target_booking.approval_deadline_at then
    raise exception 'contract_deadline_elapsed' using errcode = '22023';
  end if;

  select * into old_version
  from public.contract_versions as version
  where version.id = target_booking.current_contract_version_id
    and version.booking_id = target_booking.id
  for update;

  if not found or old_version.status <> 'issued' then
    raise exception 'contract_version_stale' using errcode = '40001';
  end if;

  select * into built
  from private.build_contract_snapshot(
    target_booking.id,
    target_booking.renter_id,
    p_camera_id,
    p_pickup_at,
    p_return_at,
    target_booking.intended_use,
    target_booking.expected_location
  );

  if built.content_sha256 = old_version.content_sha256 then
    raise exception 'contract_no_material_change' using errcode = '22023';
  end if;

  begin
    update public.availability_blocks
    set camera_id = p_camera_id,
        starts_at = p_pickup_at,
        ends_at = p_return_at,
        reason = 'superseded_booking_contract'
    where booking_id = target_booking.id
      and released_at is null;

    if not found then
      raise exception 'contract_active_block_missing' using errcode = '23514';
    end if;
  exception
    when exclusion_violation then
      raise exception 'contract_availability_conflict' using errcode = '23P01';
  end;

  perform set_config(
    'camnook.contract_supersession_booking_id',
    target_booking.id::text,
    true
  );
  perform set_config('camnook.contract_operation_id', operation_id::text, true);

  update public.contract_versions
  set status = 'superseded'
  where id = old_version.id;

  insert into public.contract_versions (
    booking_id,
    version_no,
    status,
    supersedes_id,
    template_id,
    snapshot,
    snapshot_schema_version,
    content_sha256,
    issued_at,
    issued_by
  ) values (
    target_booking.id,
    old_version.version_no + 1,
    'issued',
    old_version.id,
    built.template_id,
    built.snapshot,
    built.snapshot_schema_version,
    built.content_sha256,
    issue_time,
    caller
  ) returning id into new_version_id;

  update public.bookings
  set camera_id = p_camera_id,
      pickup_at = p_pickup_at,
      return_at = p_return_at,
      billable_days_snapshot = built.billable_days,
      daily_rate_snapshot = built.daily_rate,
      rental_amount = built.rental_amount,
      security_deposit_amount = built.security_deposit,
      current_contract_version_id = new_version_id
  where id = target_booking.id;

  if target_booking.state = 'TO_PAY' then
    perform private.transition_booking(
      target_booking.id,
      'TO_PAY',
      'CONTRACT_PENDING',
      'admin',
      'contract_superseded',
      null,
      operation_id
    );
  end if;

  perform set_config('camnook.contract_supersession_booking_id', '', true);
  perform set_config('camnook.contract_operation_id', '', true);

  return new_version_id;
end;
$$;

drop function api.expire_due_bookings();
drop function private.expire_due_bookings();

create function private.expire_due_bookings(p_operation_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  actor_type public.booking_actor_type;
  target record;
  affected integer := 0;
  target_operation_id uuid;
begin
  if p_operation_id is null then
    raise exception 'booking_expiry_operation_required' using errcode = '22023';
  end if;
  if caller is not null and not private.is_admin() then
    raise exception 'booking_expiry_unauthorized' using errcode = '42501';
  end if;

  actor_type := case when caller is null then 'system' else 'admin' end;

  for target in
    select
      booking.id,
      booking.state,
      booking.current_contract_version_id
    from public.bookings as booking
    where booking.state in ('CONTRACT_PENDING', 'TO_PAY')
      and booking.approval_deadline_at <= clock_timestamp()
    order by booking.approval_deadline_at, booking.id
    for update skip locked
  loop
    target_operation_id := case
      when affected = 0 then p_operation_id
      else gen_random_uuid()
    end;
    perform set_config(
      'camnook.contract_operation_id',
      target_operation_id::text,
      true
    );

    perform private.transition_booking(
      target.id,
      target.state,
      'EXPIRED',
      actor_type,
      'approval_deadline_elapsed',
      null,
      target_operation_id
    );
    perform private.release_booking_block(target.id, caller);

    update public.contract_versions
    set status = 'voided'
    where id = target.current_contract_version_id
      and status = 'issued';

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
      caller,
      target_operation_id,
      case
        when target.state = 'CONTRACT_PENDING' then 'contract_expired_unsigned'
        else 'signed_booking_payment_window_expired'
      end,
      'contract_version',
      target.current_contract_version_id,
      'success',
      'approval deadline expiry',
      jsonb_build_object(
        'actor_type', actor_type,
        'booking_id', target.id,
        'contract_version_id', target.current_contract_version_id,
        'from_state', target.state,
        'to_state', 'EXPIRED'
      )
    );

    affected := affected + 1;
  end loop;

  perform set_config('camnook.contract_operation_id', '', true);
  return affected;
end;
$$;

create function private.get_contract_audit_history(p_booking_id uuid)
returns table (
  audit_id bigint,
  action text,
  actor_user_id uuid,
  actor_type public.booking_actor_type,
  contract_version_id uuid,
  version_no integer,
  outcome text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'contract_booking_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    audit.id,
    audit.action,
    audit.actor_user_id,
    coalesce(
      (audit.metadata ->> 'actor_type')::public.booking_actor_type,
      case when audit.actor_user_id is null
        then 'system'::public.booking_actor_type
        else 'admin'::public.booking_actor_type
      end
    ),
    version.id,
    version.version_no,
    audit.outcome,
    audit.occurred_at
  from public.contract_versions as version
  join private.audit_logs as audit
    on audit.entity_type = 'contract_version'
    and audit.entity_id = version.id
  where version.booking_id = p_booking_id
  order by audit.occurred_at, audit.id;
end;
$$;

create function api.sign_contract(
  p_contract_version_id uuid,
  p_consent boolean
)
returns table (signature_id uuid, created boolean, signed_at timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$ select * from private.sign_contract(p_contract_version_id, p_consent); $$;

create function api.supersede_contract(
  p_booking_id uuid,
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.supersede_contract(
    p_booking_id,
    p_camera_id,
    p_pickup_at,
    p_return_at
  );
$$;

create function api.expire_due_bookings(p_operation_id uuid)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$ select private.expire_due_bookings(p_operation_id); $$;

create function api.get_contract_audit_history(p_booking_id uuid)
returns table (
  audit_id bigint,
  action text,
  actor_user_id uuid,
  actor_type public.booking_actor_type,
  contract_version_id uuid,
  version_no integer,
  outcome text,
  occurred_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_contract_audit_history(p_booking_id); $$;

revoke all on function private.validate_current_contract_pointer()
from public, anon, authenticated, service_role;
revoke all on function private.contract_operation_id()
from public, anon, authenticated, service_role;
revoke all on function private.audit_contract_version_change()
from public, anon, authenticated, service_role;
revoke all on function private.audit_contract_signature_insert()
from public, anon, authenticated, service_role;
revoke all on function private.build_contract_snapshot(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
)
from public, anon, authenticated, service_role;
revoke all on function private.sign_contract(uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function private.supersede_contract(
  uuid, uuid, timestamptz, timestamptz
)
from public, anon, authenticated, service_role;
revoke all on function private.expire_due_bookings(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.get_contract_audit_history(uuid)
from public, anon, authenticated, service_role;

grant execute on function private.sign_contract(uuid, boolean)
to authenticated;
grant execute on function private.supersede_contract(
  uuid, uuid, timestamptz, timestamptz
)
to authenticated;
grant execute on function private.expire_due_bookings(uuid)
to authenticated, service_role;
grant execute on function private.get_contract_audit_history(uuid)
to authenticated;

revoke all on function api.sign_contract(uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function api.supersede_contract(
  uuid, uuid, timestamptz, timestamptz
)
from public, anon, authenticated, service_role;
revoke all on function api.expire_due_bookings(uuid)
from public, anon, authenticated, service_role;
revoke all on function api.get_contract_audit_history(uuid)
from public, anon, authenticated, service_role;

grant execute on function api.sign_contract(uuid, boolean)
to authenticated;
grant execute on function api.supersede_contract(
  uuid, uuid, timestamptz, timestamptz
)
to authenticated;
grant execute on function api.expire_due_bookings(uuid)
to authenticated, service_role;
grant execute on function api.get_contract_audit_history(uuid)
to authenticated;

-- Supabase Cron runs the authoritative, idempotent database operation without
-- a network hop. The linked Vercel Hobby project cannot legally schedule this
-- route more frequently than daily, so Vercel remains a recovery invocation.
do $migration$
begin
  if exists (
    select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'
  ) then
    execute 'create extension if not exists pg_cron';
    execute $schedule$
      select cron.schedule(
        'camnook-expire-contract-windows',
        '* * * * *',
        $job$select private.expire_due_bookings(gen_random_uuid());$job$
      )
    $schedule$;
  end if;
end;
$migration$;

comment on function private.sign_contract(uuid, boolean) is
  'Idempotently binds the authenticated owner to one exact current contract and advances the booking atomically.';
comment on function private.supersede_contract(uuid, uuid, timestamptz, timestamptz) is
  'Creates a replacement immutable pre-payment contract from current authoritative inputs without changing the approval deadline.';
comment on function private.expire_due_bookings(uuid) is
  'Idempotently expires due contract/payment windows, preserves history, and releases active inventory blocks.';
comment on function private.get_contract_audit_history(uuid) is
  'Returns an administrator-only, agreement-scoped audit projection.';
