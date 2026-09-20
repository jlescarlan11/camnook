-- Require a contract-usable written address while keeping precise residential
-- coordinates in the existing purpose-separated private table.

alter table private.renter_kyc_profiles
  add constraint renter_kyc_complete_written_address_check check (
    address_format_version = 1
    or (
      postal_code is not null
      and postal_code ~ '^[0-9]{4}$'
      and (
        (
          street_name is not null
          and (
            house_number is not null
            or (building is not null and address_details is not null)
          )
        )
        or (street_name is null and address_details is not null)
      )
    )
  ) not valid;

create function private.enforce_unnamed_road_residential_pin()
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
    and profile.street_name is null
    and not exists (
      select 1
      from private.renter_residential_pins pin
      where pin.user_id = profile.user_id
        and pin.address_revision = profile.address_revision
    )
  then
    raise exception 'kyc_residential_pin_required_for_unnamed_road'
      using errcode = '22023';
  end if;

  return null;
end;
$$;

revoke all on function private.enforce_unnamed_road_residential_pin()
from public, anon, authenticated, service_role;

create constraint trigger renter_address_requires_unnamed_road_pin
after insert or update on private.renter_kyc_profiles
deferrable initially deferred
for each row execute function private.enforce_unnamed_road_residential_pin();

create constraint trigger renter_pin_preserves_unnamed_road_address
after delete or update on private.renter_residential_pins
deferrable initially deferred
for each row execute function private.enforce_unnamed_road_residential_pin();
