create function private.get_gcash_recipient_configuration_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  configuration private.gcash_payment_configuration%rowtype;
begin
  perform private.require_admin();

  select * into configuration
  from private.gcash_payment_configuration
  where singleton;

  return jsonb_build_object(
    'enabled', configuration.enabled,
    'recipient_name', configuration.recipient_name,
    'recipient_account', configuration.recipient_account,
    'version', configuration.version
  );
end;
$$;

create function private.submit_payment_from_booking(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_reference text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  authoritative_amount numeric;
  authoritative_sender_name text;
begin
  select booking.total_due, profile.legal_name
  into authoritative_amount, authoritative_sender_name
  from public.bookings as booking
  join public.profiles as profile
    on profile.user_id = booking.renter_id
  where booking.id = p_booking_id
    and booking.renter_id = caller;

  if authoritative_amount is null or authoritative_sender_name is null then
    raise exception 'payment_booking_not_found' using errcode = 'P0002';
  end if;

  return private.submit_payment(
    p_booking_id,
    p_attempt_id,
    authoritative_amount,
    p_reference,
    authoritative_sender_name
  );
end;
$$;

drop function api.submit_payment(uuid, uuid, numeric, text, text);

create function api.get_gcash_recipient_configuration_admin()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_gcash_recipient_configuration_admin();
$$;

create function api.submit_payment(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_reference text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_payment_from_booking(
    p_booking_id,
    p_attempt_id,
    p_reference
  );
$$;

revoke execute on function
  private.get_gcash_recipient_configuration_admin(),
  private.submit_payment_from_booking(uuid, uuid, text),
  api.get_gcash_recipient_configuration_admin(),
  api.submit_payment(uuid, uuid, text)
from public, anon, authenticated, service_role;

grant execute on function private.get_gcash_recipient_configuration_admin()
to authenticated;
grant execute on function private.submit_payment_from_booking(uuid, uuid, text)
to authenticated;
grant execute on function api.get_gcash_recipient_configuration_admin()
to authenticated;
grant execute on function api.submit_payment(uuid, uuid, text)
to authenticated;

create function private.require_payment_proof_before_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified'
    and old.status is distinct from new.status
    and not exists (
      select 1
      from public.payment_proofs as proof
      where proof.transaction_id = new.id
        and proof.finalized_at is not null
        and not exists (
          select 1
          from public.payment_proofs as successor
          where successor.supersedes_id = proof.id
        )
    )
  then
    raise exception 'payment_proof_required' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_transactions_require_proof_before_verification
before update of status on public.payment_transactions
for each row
execute function private.require_payment_proof_before_verification();

revoke all on function private.require_payment_proof_before_verification()
from public, anon, authenticated, service_role;
