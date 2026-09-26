-- A superseded or no-longer-signable agreement cannot become current by
-- retrying the same request. Keep these business conflicts out of PostgREST's
-- serialization retry path while preserving unrelated transaction failures.
create or replace function api.sign_contract(
  p_contract_version_id uuid,
  p_consent boolean
)
returns table (signature_id uuid, created boolean, signed_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return query
    select * from private.sign_contract(p_contract_version_id, p_consent);
exception
  when sqlstate '40001' then
    if sqlerrm not in (
      'contract_version_stale',
      'contract_signature_stale',
      'contract_not_signable'
    ) then
      raise;
    end if;

    raise exception using errcode = 'P0001', message = sqlerrm;
end;
$$;

revoke all on function api.sign_contract(uuid, boolean) from public, anon;
grant execute on function api.sign_contract(uuid, boolean) to authenticated;
;
