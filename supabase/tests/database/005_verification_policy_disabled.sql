select '1..1' as result
union all
select case
  when exists (
    select 1
    from private.verification_evidence_policies
    where singleton
      and not enabled
      and activated_at is null
  ) then 'ok 1 - government-ID evidence policy is installed but disabled'
  else 'not ok 1 - government-ID evidence policy must remain disabled'
end;
