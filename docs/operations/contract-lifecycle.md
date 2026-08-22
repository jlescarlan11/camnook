# Versioned Contract Lifecycle Operations

Status: local synthetic validation complete; Development and Production rollout
require separate authorization.

## Runtime boundary

The renter and admin application uses authenticated Supabase clients for RLS
reads and narrow `api` RPCs. Scheduled expiry uses the server-only Supabase
service role only through the protected recovery route. `SUPABASE_SERVICE_ROLE_KEY`
and `CRON_SECRET` remain server-only Vercel variables and must never use a
`NEXT_PUBLIC_` prefix.

The database migration detects hosted `pg_cron`, installs it when available,
and upserts the `camnook-expire-contract-windows` job at `* * * * *`. The job
executes `private.expire_due_bookings(gen_random_uuid())` inside Postgres. The
operation locks due rows with `FOR UPDATE SKIP LOCKED`, so overlapping jobs are
safe and a retry returns zero after completion.

`GET /api/internal/booking-expiration` is the recovery path. Vercel invokes it
daily with `Authorization: Bearer $CRON_SECRET`; invalid authorization receives
401. Success returns only `{ "expired": number }`. Failure logs server-side
diagnostics without booking/renter/contract content and returns 503. The linked
Vercel team is Hobby, so the database job—not an invalid high-frequency Vercel
schedule—is the primary deadline executor.

## Rollout verification

Do not apply this migration from a developer workstation as part of ordinary
review. The automatic Development rollout for a successful `main` revision:

1. Reconfirm the ignored Supabase project ref is Development, preview the
   forward migration, and apply it using the repository runbook.
2. Verify `pg_extension` contains `pg_cron` and `cron.job` contains exactly one
   active `camnook-expire-contract-windows` entry with `* * * * *`.
3. Verify recent `cron.job_run_details` rows succeed. Alert on repeated failures.
4. With a synthetic booking, prove an owner can read/sign the exact current
   version, another renter cannot read/sign it, and the deadline is unchanged.
5. With a synthetic due unsigned booking, invoke the protected recovery route;
   confirm `EXPIRED`, one released block, voided current version, append-only
   system history/audit, and aggregate-only response/logs.
6. Run hosted generated-type drift, RLS, advisor, protected Preview, and manual
   renter/admin accessibility smoke checks. A successful automatic Development
   run authorizes the same revision's forward Production migration; the exact
   staged application is promoted only after Production verification, while
   runtime activation remains a separate control.

## Recovery and rollback

If scheduled runs fail, correct the dependency and invoke the same protected
route; the operation is idempotent. If the job itself must be disabled, use
`cron.alter_job` or `cron.unschedule` in a separately authorized operation and
record the change. Continue protected recovery invocations until a reviewed
roll-forward migration restores scheduling.

Never delete or rewrite contract versions, signatures, booking history, or audit
records. Never reset an approval deadline to compensate for an incident. A
rollback preserves immutable history and changes only future lifecycle code or
the active schedule through a new reviewed migration.
