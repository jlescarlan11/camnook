begin;

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';

do $$
begin
  begin
    perform api.claim_privacy_email_forward(
      repeat('a', 64),
      repeat('b', 64)
    );
    raise exception 'authenticated clients could claim a privacy email forward';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
declare
  result jsonb;
begin
  begin
    perform 1 from private.privacy_email_forward_events;
    raise exception 'service role could read the private forwarding ledger directly';
  exception when insufficient_privilege then null;
  end;

  result := api.claim_privacy_email_forward(repeat('a', 64), repeat('b', 64));
  if result ->> 'status' <> 'claimed' then
    raise exception 'first privacy email forward was not claimed';
  end if;

  result := api.claim_privacy_email_forward(repeat('a', 64), repeat('b', 64));
  if result ->> 'status' <> 'retry' then
    raise exception 'safe-window privacy email retry was not admitted';
  end if;

  result := api.finalize_privacy_email_forward(repeat('a', 64));
  if result ->> 'status' <> 'forwarded' then
    raise exception 'privacy email forward was not finalized';
  end if;

  result := api.claim_privacy_email_forward(repeat('a', 64), repeat('c', 64));
  if result ->> 'status' <> 'forwarded' then
    raise exception 'durable privacy email replay was not suppressed';
  end if;
end;
$$;

reset role;

insert into private.privacy_email_forward_events (
  email_digest,
  first_webhook_digest,
  claimed_at,
  last_attempt_at
) values (
  decode(repeat('d', 64), 'hex'),
  decode(repeat('e', 64), 'hex'),
  statement_timestamp() - interval '21 hours',
  statement_timestamp() - interval '21 hours'
);

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
declare
  result jsonb;
begin
  result := api.claim_privacy_email_forward(repeat('d', 64), repeat('f', 64));
  if result ->> 'status' <> 'indeterminate' then
    raise exception 'expired idempotency window did not require reconciliation';
  end if;

  begin
    perform api.claim_privacy_email_forward('raw-provider-id', repeat('f', 64));
    raise exception 'raw provider identifier was accepted as a digest';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from private.privacy_email_forward_events) <> 2
    or exists (
      select 1
      from private.privacy_email_forward_events
      where octet_length(email_digest) <> 32
        or octet_length(first_webhook_digest) <> 32
    )
  then
    raise exception 'privacy email forwarding ledger did not retain only bounded digests';
  end if;
end;
$$;

select 'ok 1 - privacy email forwarding is hash-only, replay-safe, and service-bound';

rollback;
