begin;

select '1..1';

do $$
begin
  if not exists (
    select 1
    from private.verification_evidence_policies
    where singleton
      and not enabled
      and activated_at is null
  ) then
    raise exception 'government-ID evidence policy must remain disabled';
  end if;
end;
$$;

select 'ok 1 - government-ID evidence policy is installed but disabled';

rollback;
