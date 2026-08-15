begin;

select plan(1);

select ok(
  (
    select not enabled and activated_at is null
    from private.verification_evidence_policies
    where singleton
  ),
  'government-ID evidence policy is installed but disabled'
);

select * from finish();

rollback;
