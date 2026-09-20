-- Every structured residential address must retain a current private pin. The
-- written address remains the only residential location disclosed in contracts.

create function private.enforce_required_residential_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid := coalesce(new.user_id, old.user_id);
  profile private.renter_kyc_profiles%rowtype;
begin
  select * into profile
  from private.renter_kyc_profiles
  where user_id = target_user_id;

  if profile.user_id is not null
    and profile.address_format_version = 2
    and not exists (
      select 1
      from private.renter_residential_pins pin
      where pin.user_id = profile.user_id
        and pin.address_revision = profile.address_revision
    )
  then
    raise exception 'kyc_residential_pin_required'
      using errcode = '22023';
  end if;

  return null;
end;
$$;

revoke all on function private.enforce_required_residential_pin()
from public, anon, authenticated, service_role;

drop trigger if exists renter_address_requires_unnamed_road_pin
on private.renter_kyc_profiles;
drop trigger if exists renter_pin_preserves_unnamed_road_address
on private.renter_residential_pins;
drop function if exists private.enforce_unnamed_road_residential_pin();

create constraint trigger renter_address_requires_residential_pin
after insert or update on private.renter_kyc_profiles
deferrable initially deferred
for each row execute function private.enforce_required_residential_pin();

create constraint trigger renter_pin_preserves_required_address
after delete or update on private.renter_residential_pins
deferrable initially deferred
for each row execute function private.enforce_required_residential_pin();
