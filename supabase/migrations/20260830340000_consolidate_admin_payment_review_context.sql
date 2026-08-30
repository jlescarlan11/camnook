create function private.get_admin_payment_review_context(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  detail jsonb := private.get_payment_review_detail(p_payment_id);
  booking_id uuid := (detail ->> 'booking_id')::uuid;
begin
  return jsonb_build_object(
    'detail', detail,
    'audit', private.get_payment_audit_history(booking_id)
  );
end;
$$;

create function api.get_admin_payment_review_context(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_admin_payment_review_context(p_payment_id);
$$;

revoke all on function private.get_admin_payment_review_context(uuid)
from public, anon, authenticated;
revoke all on function api.get_admin_payment_review_context(uuid)
from public, anon, authenticated;
grant execute on function api.get_admin_payment_review_context(uuid)
to authenticated;
