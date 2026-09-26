-- Known stale KYC inputs are business conflicts, not transient transaction
-- failures. Keep SQLSTATE 40001 inside the database boundary so PostgREST does
-- not repeatedly retry a request whose expected address revision cannot change.
create or replace function api.save_my_kyc_profile_v2(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return private.save_my_kyc_profile_v2(p_input);
exception
  when sqlstate '40001' then
    if sqlerrm not in (
      'kyc_address_revision_conflict',
      'kyc_pin_reconfirmation_required'
    ) then
      raise;
    end if;

    raise exception using errcode = 'P0001', message = sqlerrm;
end;
$$;

revoke all on function api.save_my_kyc_profile_v2(jsonb) from public, anon;
grant execute on function api.save_my_kyc_profile_v2(jsonb) to authenticated;
;
