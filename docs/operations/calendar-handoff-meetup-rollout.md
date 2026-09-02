# Calendar, handoff, and meetup rollout

Status: **HANDOFF AND MEETUP BUILT IN**, reviewed 2026-08-30.
Issue #105 coordinates the release of #101–#104. Release run `32558869428`
successfully verified and applied all 25 repository migrations to Development
and Production for SHA `5976173337e33a247b330e253d25435fee870c16`, then
promoted that application revision. The Production meetup provider and privacy
readiness work remains incomplete.

## Immutable release boundary

Handoff scheduling and meetup planning are always-on parts of the published
booking flow. Neither is controlled by a deployment-time feature flag. Missing
provider configuration, an unavailable provider, an invalid recommendation, or
an unconfigured camera policy fails closed without creating a booking. Existing
snapshot-backed bookings remain readable.

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
   meetup planning; only that
   exact unaliased artifact and SHA may continue through Production and
   promotion.
4. Record only SHA, migration names/counts, deployment IDs/states, config
   version, safe status categories, actor/time, and aggregate results. Evidence
   with credentials, coordinates, provider IDs, opaque references, private
   anchors, raw payloads, identities, or linked addresses is invalid.

## Development and protected Preview

An authorized CamNook representative must accept both provider reviews and create
dedicated Development credentials. Configure the server-only values in
`docs/operations/geoapify-meetups.md` and
`docs/operations/mapbox-meetup-routing.md`, then run both bounded Development
checks. Missing credentials or Geoapify coverage is `NO_GO`; a Mapbox failure is
`NO_GO` for route-ranked activation even though the application safely renders
Geoapify-only options without time claims.

After disabled migrations and code are on the exact protected Preview SHA:

1. Create non-customer owner/renter test identities and one Development-only
   camera policy using an approved lender city, weekday, and PHT slot.
2. Verify the built-in fail-closed behavior on the protected Preview candidate;
   do not add a release flag or manual enable toggle.
3. Verify guest calendar sanitization; PHT dates in PHT and non-PHT browsers;
   explicit geolocation; denial/timeout fallback to city/municipality only; up to
   three public options; exactly-one selection and confirmation; sign-in return; and
   atomic `FOR_REVIEW` creation.
4. Reload renter/admin detail, approve, and verify the exact saved schedule and
   venue in the contract, pickup, and return contexts. Exercise stale policy,
   expired/tampered reference, overlap race, provider failure, lost response,
   cross-renter/direct RPC denial, and a legacy booking.
5. Review keyboard/focus/status announcements at mobile and desktop widths.
   Inspect client bundles, network records, rows, audit facts, and redacted logs
   for forbidden location/provider/identity data.
6. Rehearse rollback by removing provider admission configuration and prove new
   recommendation-dependent requests stop while created records remain readable.
   Revoke test sessions; retain immutable booking/history evidence.

## Production readiness and activation

Handoff scheduling is enabled by releases from `main`, but each listing remains
fail-closed until the owner saves an enabled policy with a public city label,
private coarse city anchor, allowed weekdays, and approved Asia/Manila handoff
times. Meetup admission remains fail-closed until dedicated Production Geoapify
and Mapbox credentials, the independent recommendation secret, reviewed provider
and routing policy versions, quota/cost alerting, rotation owners, and outage
responses are configured. Verify
provider health, runtime/database monitoring, and rollback control without
recording sensitive values.

Every Geoapify-bound action first reserves its exact outbound call count: a
current-position renter recommendation reserves one city lookup plus one request
per unique discovery seed and reviewed category; saved/manual origins omit the
city lookup, and canonical area centroid resolution reserves its additional
geocoding call;
an owner city or address suggestion reserves one call. The reservation is fail-closed at five shared calls per
second, ten calls per actor per fifteen-minute window, and 3,000 calls per UTC
day; only short-lived aggregate counters are retained. Only server actions using
the service client may reserve budget; direct authenticated callers and inactive
profiles are denied. This is intentionally below no known provider plan
guarantee: at the 2026-08-30 review, Geoapify's Free plan documented five
requests per second and 3,000 credits per day, with ordinary geocoding and
Places calls consuming one credit each. Reconfirm the active plan, quota, and
current pricing before changing either bound. A separate private Mapbox budget
reserves exactly `2 × candidate count` elements before routing and caps each call
at 16 elements, each actor at 128 per 15 minutes, the application at 480 per
minute, 8,000 per UTC day, and 50,000 per UTC month.

Activation order is coherent and reversible: verify the approved listing
calendar/slot and complete provider configuration, then run
one authorized non-customer smoke. Require one booking and one immutable meetup
snapshot, the same contract/pickup/return read-back, owner/cross-account access
checks, and zero unexplained application/provider/privacy events during the
owner-defined observation window. Freeze fresh evidence and require
`pnpm launch:require-go`; any missing or contradictory fact is `NO_GO`.

## Rollback and indeterminate outcomes

Provider configuration can be removed to fail closed during an incident without
database deletion. Do not rotate the reference secret as the first
response unless invalidating all unexpired 15-minute recommendations is intended.
Reconcile an indeterminate request by its durable owned booking before retrying;
never fabricate client success or delete history. Provider outage requires no
cleanup of renter coordinates because they are never persisted. Recovery is a
forward fix followed by a new protected Preview and evidence window.

The repository release workflow ships handoff scheduling and meetup planning as
built-in behavior, disables Vercel's independent `main`
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
`NO_GO` for the final hybrid meetup release because of:

- missing authorized Development/Preview Geoapify configuration and bounded check;
- missing Mapbox account/privacy approval, server-only credentials in every
  target environment, and bounded Cebu-area routing check;
- missing owner-approved hosted camera policy and rollback rehearsal;
- missing verified Production provider/config/monitoring controls;
- missing protected Preview meetup story; and
- missing Production meetup activation evidence.
