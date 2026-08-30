# Calendar, handoff, and meetup rollout

Status: **HANDOFF READY FOR OWNER POLICY; MEETUP NO_GO**, reviewed 2026-08-22.
Issue #105 coordinates the release of #101–#104. Release run `32558869428`
successfully verified and applied all 25 repository migrations to Development
and Production for SHA `5976173337e33a247b330e253d25435fee870c16`, then
promoted that application revision. The Production meetup provider and privacy
readiness work remains incomplete.

## Immutable release boundary

Handoff scheduling is an always-on part of the published booking flow. It is
not controlled by a deployment-time feature flag. `MEETUP_PLANNING_ENABLED`
remains server-only and is enabled only by the exact string `true` until its
provider and privacy readiness requirements pass. Disabling meetup planning
stops location lookup, recommendation, and meetup-bound requests without
deleting or rewriting camera policies, bookings, meetup plans, contracts,
handoffs, history, or audits. Existing snapshot-backed bookings remain
readable; only genuine legacy bookings may use the validated `PICKUP_LOCATION`
compatibility path.

## Candidate and target preflight

1. Freeze the exact Git SHA and require a clean tree. Run `pnpm lint`,
   `pnpm typecheck`, `pnpm test`, `pnpm launch:verify`, the full database and
   real-session concurrency suites, and a build with meetup planning enabled.
2. Before every hosted command, compare the intended environment and project:
   Development `ekmoiepalelqpmemvrkl`; Production
   `iegcixcevvkryfwfotqz`. Abort on any mismatch. Never link Production for
   routine local work, reset a linked database, or push hosted config.
3. Require CI to test migrations 13–15 and a feature-enabled build. The
   exhaustive clean-database suites remain local-only. Hosted verification uses
   only `supabase/tests/hosted/manifest.json`; CI validates that every entry is
   rollback-only, exercises the exact Development selection twice against a
   production-shaped singleton-admin/legacy-record baseline, and proves no row
   residue. A successful automatic `main` CI first migrates and verifies
   Development. Its success unlocks Production approval, which stages a
   Production-shaped Vercel candidate with built-in handoff scheduling and
   meetup planning disabled; only that
   exact unaliased artifact and SHA may continue through Production and
   promotion.
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
2. Enable meetup planning only in the protected Preview environment.
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

Handoff scheduling is enabled by releases from `main`, but each listing remains
fail-closed until the owner saves an enabled policy with a public city label,
private coarse city anchor, allowed weekdays, and approved Asia/Manila handoff
times. Meetup planning remains disabled until a dedicated Production provider
key, independent recommendation secret, reviewed category/config version,
quota/cost alerting, rotation owner, and outage response are configured. Verify
provider health, runtime/database monitoring, and rollback control without
recording sensitive values.

Activation order is coherent and reversible: verify the approved listing
calendar/slot, then enable meetup planning and run
one authorized non-customer smoke. Require one booking and one immutable meetup
snapshot, the same contract/pickup/return read-back, owner/cross-account access
checks, and zero unexplained application/provider/privacy events during the
owner-defined observation window. Freeze fresh evidence and require
`pnpm launch:require-go`; any missing or contradictory fact is `NO_GO`.

## Rollback and indeterminate outcomes

Disable `MEETUP_PLANNING_ENABLED` to stop new recommendation-backed admissions
without database deletion. Do not rotate the reference secret as the first
response unless invalidating all unexpired 15-minute recommendations is intended.
Reconcile an indeterminate request by its durable owned booking before retrying;
never fabricate client success or delete history. Provider outage requires no
cleanup of renter coordinates because they are never persisted. Recovery is a
forward fix followed by a new protected Preview and evidence window.

The repository release workflow ships handoff scheduling as built-in behavior
while keeping meetup planning disabled, disables Vercel's independent `main`
promotion, and promotes
only after the exact SHA's
Production migration history, read-only hosted manifest, and advisors pass. An
application smoke failure restores the prior Vercel alias without reversing
schema. An indeterminate migration or promotion is reconciled first; emergency
dispatch cannot skip successful CI, current-main identity, or protected
environment approval.

## Current evidence and blockers

Release run `32558869428` passed the Development and Production migration,
hosted-manifest, security-advisor, candidate, promotion, and public-smoke gates
for SHA `5976173337e33a247b330e253d25435fee870c16`. Production currently reports the
Canon EOS R50 policy as not configured and disabled. The machine record remains
`NO_GO` for meetup planning because of:

- missing authorized Development Geoapify credential and bounded check;
- missing owner-approved hosted camera policy and rollback rehearsal;
- missing verified Production provider/config/monitoring controls;
- missing protected Preview meetup story; and
- missing Production meetup activation evidence.
