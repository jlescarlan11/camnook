begin;

select plan(2);

set local role authenticated;

select throws_ok(
  $$select api.get_verification_upload_policy()$$,
  '42501',
  null,
  'authenticated users cannot call the retired upload policy RPC'
);

select throws_ok(
  $$select api.get_verification_review_queue()$$,
  '42501',
  null,
  'authenticated users cannot call the retired review queue RPC'
);

reset role;

select * from finish();

rollback;
