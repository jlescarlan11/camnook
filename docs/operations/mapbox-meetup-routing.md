# Mapbox meetup routing operations

Reviewed: 2026-09-01. Activation status: **NO_GO** until an authorized CamNook
representative provisions the account/token, accepts the privacy boundary, and
records a passing Development benchmark. No token or account decision is stored
in Git.

## Narrow provider decision

Vercel Marketplace discovery on 2026-09-01 exposes no maps, geocoding, places,
or route-matrix integration. Its `searching` products are unrelated. #115
therefore authorizes a direct server-only Mapbox Matrix HTTPS boundary. Mapbox is
used only for advisory durations. Geoapify remains authoritative for city
normalization, POI discovery, category eligibility, attribution, signed venue
facts, and the immutable booking snapshot.

Authoritative sources to re-check before activation:

- [Matrix API](https://docs.mapbox.com/api/navigation/matrix/): asymmetric
  `sources`/`destinations`, duration output, `null` unreachable pairs, and the
  `driving-traffic` limit of ten input coordinates and 30 requests per minute.
- [Mapbox pricing](https://www.mapbox.com/pricing/#matrix-api): billing by matrix
  element; the reviewed public tier begins with up to 100,000 monthly elements.
  The actual CamNook account plan/dashboard remains authoritative.
- [Product privacy policy](https://www.mapbox.com/legal/privacy#product-privacy-policy):
  API request content can include geolocation; Mapbox describes data
  minimization, international/cloud processing, security controls, and
  purpose-dependent retention. Account approval must include the applicable DPA
  and Philippine privacy/subprocessor decision before customer coordinates flow.
- [Access tokens](https://docs.mapbox.com/accounts/guides/tokens/): create a
  dedicated server-side token with only the scopes required for Matrix access;
  do not reuse a browser, personal, or Production token in Development.
- [Attribution](https://docs.mapbox.com/help/dive-deeper/attribution/): the
  reviewed requirement applies logo and text attribution to maps that render
  Mapbox styles, hosted data, or software. CamNook renders no Mapbox map, tile,
  style, route geometry, or navigation result; it shows only derived advisory
  duration labels and names Mapbox in the consent copy. No map attribution is
  added under that reviewed boundary. Reconfirm this conclusion against the
  approved account terms before activation.

## Request and privacy contract

One request contains two sources (owner city anchor and renter origin) and one
to eight Geoapify venue destinations. It requests only `duration`, sets explicit
source/destination indices, never sets `fallback_speed`, and consumes 2–16
elements. `driving-traffic` is the only accepted profile. Route geometry,
distance, navigation, Search, Geocoding, Permanent Geocoding, and scheduled
departure are outside the contract.

Exact renter coordinates and the private owner anchor exist only for the current
server request. The Mapbox URL necessarily contains coordinates and the token,
so it must never enter logs, errors, telemetry, analytics, screenshots, issue
evidence, client state, or persistence. Raw responses and normalized durations
are also transient. `booking_meetup_plans`, contracts, audits, and history retain
only the selected existing Geoapify snapshot.

## Configuration

Create separate Development and Production tokens under the authorized CamNook
account. Configure these only as server-side Vercel environment variables:

- `MAPBOX_ACCESS_TOKEN`
- `MEETUP_ROUTING_PROFILE=driving-traffic`
- `MEETUP_ROUTING_POLICY_VERSION=mapbox-matrix-v1`
- `MEETUP_ROUTING_TIMEOUT_MS=4000` (500–10000)
- `MEETUP_ROUTING_MAX_CANDIDATES=8`
- `MEETUP_ROUTING_MAX_ELEMENTS=16`

Never use `NEXT_PUBLIC_`. The candidate and element bounds must remain consistent
(`elements = 2 × candidates`) or configuration fails before budget/network use.
Bump the routing policy version whenever profile, ranking, candidate, fallback,
or privacy semantics change; every unexpired reference from the old version then
fails binding validation.

## Cost and concurrency controls

`api.claim_mapbox_routing_budget` is service-role-only and verifies an active
actor. It atomically reserves even element counts from 2 through 16 before the
outbound call. Private aggregate counters cap:

- 128 elements per actor per 15 minutes;
- 480 elements per UTC minute (the reviewed 30-request/minute maximum at 16
  elements each);
- 8,000 elements per UTC day; and
- 50,000 elements per UTC month, a conservative half of the reviewed first
  public pricing tier.

Denied/racing reservations roll back all narrower/broader counters, return no
provider detail, and make no Mapbox request. Counter tables have RLS, no API-role
table grants, short retention, and contain no route or location facts.

## Bounded Development benchmark

After installing the dedicated Development token in the intended Vercel scope,
pull it into a private local environment and run:

```sh
pnpm meetup:routing:check:development
```

The check refuses a Production context, uses only committed public Cebu,
Mandaue, and Lapu-Lapu landmark/city coordinates, consumes six elements, and
requires plausible nonnegative reachability without ordinary CI using live
quota. Record only date, exact commit, environment, profile/policy version,
candidate/element counts, reachability class, coarse latency class, and
`GO`/`NO_GO`. Never record a URL, token, coordinate, duration matrix, venue fact,
or user identity.

## Failure, rotation, and removal

Missing/invalid config, budget denial, timeout, 401/403, 422, 429, 5xx, network
failure, oversized/malformed output, partial `null`, or all-unreachable output
never creates a route estimate. If Geoapify still has eligible venues, the renter
receives up to three deterministically Geoapify-ranked options with explicit
no-time copy. Geoapify failure still blocks booking; Mapbox never fabricates
authority.

Rotate Development first: add the new dedicated token, run the benchmark, then
revoke the old token. Repeat separately for Production through #105's approved
release path. During a routing privacy/cost incident, remove `MAPBOX_ACCESS_TOKEN`
to force the no-time fallback; do not delete booking snapshots or rotate the
Geoapify recommendation secret unless invalidating all live references is
intended. Full removal also drops the Mapbox environment records after a
forward-only code change; historical bookings require no migration because no
Mapbox fact is persisted.
