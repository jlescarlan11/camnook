# Calendar, handoff, and meetup rollout

Status: **NO_GO**, reviewed 2026-08-21. Issue #105 coordinates the release of
#101–#104; it does not authorize a merge, deployment, hosted mutation, or
Production activation. The last verified Production database evidence contains
22 migrations and this candidate contains 25. The current task made no hosted
change.

## Immutable release boundary

`HANDOFF_SCHEDULING_ENABLED` and `MEETUP_PLANNING_ENABLED` are server-only and
enabled only by the exact string `true`. Deploy schema and code with both false.
The first stops new schedule-bound requests; the second stops location lookup,
recommendation, and meetup-bound requests. Disabling either never deletes or
rewrites camera policies, bookings, meetup plans, contracts, handoffs, history,
or audits. Existing snapshot-backed bookings remain readable; only genuine
legacy bookings may use the validated `PICKUP_LOCATION` compatibility path.

## Candidate and target preflight

1. Freeze the exact Git SHA and require a clean tree. Run `pnpm lint`,
   `pnpm typecheck`, `pnpm test`, `pnpm launch:verify`, the full database and
   real-session concurrency suites, and a build with both feature flags true.
2. Before every hosted command, compare the intended environment and project:
   Development `ekmoiepalelqpmemvrkl`; Production
   `iegcixcevvkryfwfotqz`. Abort on any mismatch. Never link Production for
   routine local work, reset a linked database, or push hosted config.
3. Require CI to test migrations 13–15 and a feature-enabled build. The
   exhaustive clean-database suites remain local-only. Hosted verification uses
   only `supabase/tests/hosted/manifest.json`; CI validates that every entry is
   rollback-only, exercises the exact Development selection twice against a
   production-shaped singleton-admin/legacy-record baseline, and proves no row
   residue. A successful `main` CI may trigger the Development migration gate;
   only that exact successful SHA may continue toward Production.
4. Record only SHA, migration names/counts, deployment IDs/states, config
   version, safe status categories, actor/time, and aggregate results. Evidence
   with credentials, coordinates, provider IDs, opaque references, private
   anchors, raw payloads, identities, or linked addresses is invalid.

## Development and protected Preview

An authorized CamNook representative must first accept Geoapify terms and create
a dedicated Development project/key. Configure all server-only values in
`docs/operations/geoapify-meetups.md`, keep both rollout flags false, and run
`pnpm meetup:check:development`. A missing key, quota, timeout, malformed result,
or zero eligible venue is a safe `NO_GO`; do not substitute fixture evidence.

After disabled migrations and code are on the exact protected Preview SHA:

1. Create non-customer owner/renter test identities and one Development-only
   camera policy using an approved lender city, weekday, and PHT slot.
2. Enable both flags only in the protected Preview environment.
3. Verify guest calendar sanitization; PHT dates in PHT and non-PHT browsers;
   explicit geolocation; denial/timeout fallback to city/municipality only; one
   public recommendation; visible city/venue confirmation; sign-in return; and
   atomic `FOR_REVIEW` creation.
4. Reload renter/admin detail, approve, and verify the exact saved schedule and
   venue in the contract, pickup, and return contexts. Exercise stale policy,
   expired/tampered reference, overlap race, provider failure, lost response,
   cross-renter/direct RPC denial, and a legacy booking.
5. Review keyboard/focus/status announcements at mobile and desktop widths.
   Inspect client bundles, network records, rows, audit facts, and redacted logs
   for forbidden location/provider/identity data.
6. Disable both Preview flags and prove new feature admission stops while the
   created records remain readable. Revoke test sessions; retain immutable
   booking/history evidence according to the existing release contract.

## Production readiness and activation

Production remains disabled until all prior evidence passes and a new explicit
mutation window is authorized. While disabled, configure a dedicated Production
provider key, independent recommendation secret, reviewed category/config
version, quota/cost alerting, rotation owner, outage response, and at least one
owner-approved real camera policy. Verify the exact migration/deployment SHA,
provider health, security advisors, runtime/database monitoring, and rollback
control without recording sensitive values.

Activation order is coherent and reversible: enable handoff scheduling first,
verify the approved listing calendar/slot, then enable meetup planning and run
one authorized non-customer smoke. Require one booking and one immutable meetup
snapshot, the same contract/pickup/return read-back, owner/cross-account access
checks, and zero unexplained application/provider/privacy events during the
owner-defined observation window. Freeze fresh evidence and require
`pnpm launch:require-go`; any missing or contradictory fact is `NO_GO`.

## Rollback and indeterminate outcomes

Disable `MEETUP_PLANNING_ENABLED` first, then
`HANDOFF_SCHEDULING_ENABLED`. This stops new recommendation/schedule admissions
without database deletion. Do not rotate the reference secret as the first
response unless invalidating all unexpired 15-minute recommendations is intended.
Reconcile an indeterminate request by its durable owned booking before retrying;
never fabricate client success or delete history. Provider outage requires no
cleanup of renter coordinates because they are never persisted. Recovery is a
forward fix followed by a new protected Preview and evidence window.

## Current evidence and blockers

Local lint, typecheck, 495 tests (one intentional skip), all database/concurrency
checks, a feature-enabled Next.js build, and source/privacy reviews passed for
commit `3b44ad569d01060b0b0c2a03d74cab6cdb64e3c4`. Browser responsive/error-state
inspection also passed locally, but the linked hosted schema/provider were not
available for the full story. The machine record therefore remains `NO_GO` for:

- missing authorized Development Geoapify credential and bounded check;
- missing disabled Development migrations and protected Preview story;
- missing owner-approved hosted camera policy and rollback rehearsal;
- missing verified Production provider/config/monitoring controls;
- Production migration/deployment drift from the 25-migration candidate; and
- no Production mutation authorization.
