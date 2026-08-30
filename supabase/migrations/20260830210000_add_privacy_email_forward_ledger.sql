create table private.privacy_email_forward_events (
  email_digest bytea primary key check (octet_length(email_digest) = 32),
  first_webhook_digest bytea not null unique
    check (octet_length(first_webhook_digest) = 32),
  status text not null default 'processing'
    check (status in ('processing', 'forwarded')),
  claimed_at timestamptz not null default statement_timestamp(),
  last_attempt_at timestamptz not null default statement_timestamp(),
  forwarded_at timestamptz,
  check (status <> 'forwarded' or forwarded_at is not null)
);

alter table private.privacy_email_forward_events enable row level security;

create function private.claim_privacy_email_forward(
  p_email_sha256_hex text,
  p_webhook_sha256_hex text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  email_hash bytea;
  webhook_hash bytea;
  target private.privacy_email_forward_events%rowtype;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'privacy email forwarding is server-only' using errcode = '42501';
  end if;
  if p_email_sha256_hex is null
    or p_email_sha256_hex !~ '^[0-9a-f]{64}$'
    or p_webhook_sha256_hex is null
    or p_webhook_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'privacy email forwarding digest is invalid' using errcode = '22023';
  end if;

  email_hash := decode(p_email_sha256_hex, 'hex');
  webhook_hash := decode(p_webhook_sha256_hex, 'hex');

  insert into private.privacy_email_forward_events (
    email_digest,
    first_webhook_digest
  ) values (
    email_hash,
    webhook_hash
  )
  on conflict (email_digest) do nothing
  returning * into target;

  if target.email_digest is not null then
    return jsonb_build_object('status', 'claimed');
  end if;

  select * into target
  from private.privacy_email_forward_events
  where email_digest = email_hash
  for update;

  if target.status = 'forwarded' then
    return jsonb_build_object('status', 'forwarded');
  end if;
  if target.claimed_at < clock_timestamp() - interval '20 hours' then
    return jsonb_build_object('status', 'indeterminate');
  end if;

  update private.privacy_email_forward_events
  set last_attempt_at = statement_timestamp()
  where email_digest = email_hash;

  return jsonb_build_object('status', 'retry');
end;
$$;

create function private.finalize_privacy_email_forward(
  p_email_sha256_hex text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  email_hash bytea;
  target private.privacy_email_forward_events%rowtype;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'privacy email forwarding is server-only' using errcode = '42501';
  end if;
  if p_email_sha256_hex is null or p_email_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy email forwarding digest is invalid' using errcode = '22023';
  end if;
  email_hash := decode(p_email_sha256_hex, 'hex');

  select * into target
  from private.privacy_email_forward_events
  where email_digest = email_hash
  for update;

  if target.email_digest is null then
    raise exception 'privacy email forwarding claim not found' using errcode = 'P0002';
  end if;
  if target.status = 'forwarded' then
    return jsonb_build_object('status', 'forwarded');
  end if;

  update private.privacy_email_forward_events
  set status = 'forwarded',
      forwarded_at = statement_timestamp(),
      last_attempt_at = statement_timestamp()
  where email_digest = email_hash;

  return jsonb_build_object('status', 'forwarded');
end;
$$;

create function api.claim_privacy_email_forward(
  p_email_sha256_hex text,
  p_webhook_sha256_hex text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_privacy_email_forward(
    p_email_sha256_hex,
    p_webhook_sha256_hex
  );
$$;

create function api.finalize_privacy_email_forward(
  p_email_sha256_hex text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_privacy_email_forward(p_email_sha256_hex);
$$;

revoke all on table private.privacy_email_forward_events
from public, anon, authenticated, service_role;
revoke all on function private.claim_privacy_email_forward(text, text) from public, anon, authenticated;
revoke all on function private.finalize_privacy_email_forward(text) from public, anon, authenticated;
revoke all on function api.claim_privacy_email_forward(text, text) from public, anon, authenticated;
revoke all on function api.finalize_privacy_email_forward(text) from public, anon, authenticated;

grant execute on function private.claim_privacy_email_forward(text, text) to service_role;
grant execute on function private.finalize_privacy_email_forward(text) to service_role;
grant execute on function api.claim_privacy_email_forward(text, text) to service_role;
grant execute on function api.finalize_privacy_email_forward(text) to service_role;

comment on table private.privacy_email_forward_events is
  'Hash-only durable replay ledger for privacy email forwarding; contains no message content or raw provider identifiers.';
