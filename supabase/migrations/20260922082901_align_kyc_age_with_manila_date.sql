-- KYC is governed by the Manila business date, never a caller/session timezone.
-- Keep the existing calendar-year and leap-day clamping behavior in PostgreSQL.
create function private.kyc_date_years_ago(p_at timestamptz, p_years integer)
returns date
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select ((p_at at time zone 'Asia/Manila')::date
    - pg_catalog.make_interval(years => p_years))::date;
$$;

revoke all on function private.kyc_date_years_ago(timestamptz, integer)
from public, anon, authenticated, service_role;

-- Replace only the age expressions in the four existing authoritative paths.
-- CREATE OR REPLACE retains ownership and grants; all actor checks, private pin
-- handling, locks, idempotency and snapshot writes remain unchanged.
do $$
declare
  target regprocedure;
  definition text;
  updated text;
begin
  foreach target in array array[
    'private.save_my_kyc_profile(jsonb)'::regprocedure,
    'private.save_my_kyc_profile_v2(jsonb)'::regprocedure,
    'api.request_booking_with_preference_idempotent(uuid,uuid,date,date,time without time zone,bigint,text,text,text,uuid)'::regprocedure,
    'api.request_booking_with_place_idempotent(uuid,uuid,date,date,time without time zone,bigint,text,text,uuid,bigint,uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if position('current_date - interval ''18 years''' in definition) = 0 then
      raise exception 'expected KYC age expression missing in %', target;
    end if;
    updated := replace(definition,
      'current_date - interval ''18 years''',
      'private.kyc_date_years_ago(now(), 18)');
    updated := replace(updated,
      'current_date - interval ''120 years''',
      'private.kyc_date_years_ago(now(), 120)');
    execute updated;
  end loop;
end;
$$;
