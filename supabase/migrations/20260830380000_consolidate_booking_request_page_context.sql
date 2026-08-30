create function api.get_booking_request_page_context(
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  profile_json jsonb;
  camera_json jsonb;
  quote_json jsonb;
begin
  select jsonb_build_object(
    'legal_name', profile.legal_name,
    'phone', profile.phone,
    'account_status', profile.account_status
  ) into profile_json
  from public.profiles as profile
  where profile.user_id = caller;

  select jsonb_build_object(
    'id', camera.id,
    'name', camera.name,
    'slug', camera.slug
  ) into camera_json
  from public.cameras as camera
  where camera.id = p_camera_id
    and camera.status = 'published';

  select to_jsonb(quote) into quote_json
  from api.quote_booking_schedule(
    p_camera_id,
    p_pickup_date,
    p_return_date,
    p_handoff_time,
    p_policy_version
  ) as quote;

  if camera_json is null or quote_json is null then
    raise exception 'booking_request_context_unavailable'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'profile', profile_json,
    'camera', camera_json,
    'quote', quote_json
  );
end;
$$;

revoke all on function api.get_booking_request_page_context(
  uuid, date, date, time without time zone, bigint
) from public, anon, authenticated;
grant execute on function api.get_booking_request_page_context(
  uuid, date, date, time without time zone, bigint
) to authenticated;
