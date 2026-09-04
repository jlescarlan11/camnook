begin;

select '1..1';

insert into auth.users (id) values
  ('f2100000-0000-4000-8000-000000000001'),
  ('f2100000-0000-4000-8000-000000000002');
insert into public.profiles (user_id, legal_name, phone) values
  ('f2100000-0000-4000-8000-000000000001', 'KYC Renter', '+639210000001'),
  ('f2100000-0000-4000-8000-000000000002', 'Other Renter', '+639210000002');

set local role authenticated;
set local "request.jwt.claim.sub" = 'f2100000-0000-4000-8000-000000000001';

do $$
declare
  profile jsonb;
begin
  if api.get_my_kyc_profile() is not null then
    raise exception 'new renter unexpectedly had KYC data';
  end if;
  profile := api.save_my_kyc_profile(jsonb_build_object(
    'legal_name', 'KYC Renter Updated',
    'phone', '+639210000099',
    'birth_date', '1990-03-15',
    'address_line1', 'Unit 4, 123 Mango Avenue',
    'release_key', '2026-q2',
    'area_code', '0730600041'
  ));
  if profile ->> 'birth_date' <> '1990-03-15'
    or profile ->> 'address_line1' <> 'Unit 4, 123 Mango Avenue'
    or profile ->> 'area_code' <> '0730600041'
    or profile ?| array['user_id', 'updated_by']
  then raise exception 'actor KYC projection was incomplete or widened'; end if;
  if not exists (
    select 1 from public.profiles
    where user_id = 'f2100000-0000-4000-8000-000000000001'
      and legal_name = 'KYC Renter Updated' and phone = '+639210000099'
  ) then raise exception 'KYC save did not update reusable profile fields'; end if;

  begin
    perform api.save_my_kyc_profile(jsonb_build_object(
      'legal_name', 'Underage Renter', 'phone', '+639210000099',
      'birth_date', current_date - interval '17 years',
      'address_line1', 'Unit 4, 123 Mango Avenue',
      'release_key', '2026-q2', 'area_code', '0730600041'
    ));
    raise exception 'underage KYC unexpectedly saved';
  exception when sqlstate '22023' then null;
  end;
  if api.get_my_kyc_profile() ->> 'birth_date' <> '1990-03-15' then
    raise exception 'failed KYC replacement changed the saved record';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2100000-0000-4000-8000-000000000002';
do $$ begin
  if api.get_my_kyc_profile() is not null then
    raise exception 'one renter read another renter KYC record';
  end if;
end; $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform api.get_my_kyc_profile();
    raise exception 'anonymous caller read KYC data';
  exception when insufficient_privilege then null;
  end;
end; $$;

reset role;
set local role service_role;
do $$ begin
  begin
    perform api.request_booking_with_preference_idempotent(
      'f2100000-0000-4000-8000-000000000002',
      'f2110000-0000-4000-8000-000000000001',
      '2099-08-24', '2099-08-26', '09:00', 1,
      'Family portraits', 'Cebu City', 'Lahug',
      'f2120000-0000-4000-8000-000000000001'
    );
    raise exception 'booking without KYC unexpectedly passed';
  exception when sqlstate '42501' then
    if sqlerrm <> 'booking_kyc_required' then raise; end if;
  end;
end; $$;

select 'ok 1 - renter KYC is adult-only, actor-owned, minimized, and required for booking';

rollback;
