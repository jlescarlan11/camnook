begin;

set local role authenticated;

do $$
begin
  begin
    perform api.get_verification_upload_policy();
    raise exception 'authenticated user called the retired upload policy RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  begin
    perform api.get_verification_review_queue();
    raise exception 'authenticated user called the retired review queue RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select unnest(array[
  '1..2',
  'ok 1 - authenticated users cannot call the retired upload policy RPC',
  'ok 2 - authenticated users cannot call the retired review queue RPC'
]);

rollback;
