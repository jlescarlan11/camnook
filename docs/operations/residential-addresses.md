# Complete residential address and private pin

Reviewed: 2026-09-20. The structured address and written-address fallback are
live in Production. Dedicated browser keys are configured for Development,
Preview, and Production and must pass the automated boundary checks below.

The 20 September 2026 audit found a browser key in Production and in the local
Development fallback, but both accepted `https://example.com` and both could
call Geoapify APIs from that origin. The keys were subsequently split by
environment and restricted: Development allows localhost and 127.0.0.1,
Preview uses a dedicated key limited to CamNook deployment referrers under the
Vercel team domain, and Production allows `https://camnook.shop`.

## Provider and purpose boundary

PSGC remains authoritative for the selected Philippine administrative path.
Geoapify supplies residential search, reverse geocoding, and map tiles. Leaflet
renders the map. Mapbox remains limited to the transient public-meetup Matrix
boundary in `docs/operations/mapbox-meetup-routing.md`; a saved home pin never
enters meetup discovery, ranking, booking output, or contracts.

Residential search uses the existing server-only `GEOAPIFY_API_KEY` through the
Geoapify EU MCP endpoint. Requests use POST bodies so full address queries and
coordinates do not enter CamNook URLs. The existing actor/provider budget is
claimed before every request. Responses are bounded and normalized before they
reach the browser. Do not log request bodies, provider payloads, addresses, or
coordinates.

Map tiles use a separate browser-visible `NEXT_PUBLIC_GEOAPIFY_MAP_KEY`. It must
be separate from the server key and restricted in Geoapify to the reviewed
Development, Preview, or Production referrers and origins that need it. Never
put `GEOAPIFY_API_KEY`, the Mapbox token, a Supabase secret key, or another
privileged credential in this variable. Tile requests necessarily disclose
requested tile coordinates and technical request metadata to Geoapify;
attribution remains visible on the map.

Geoapify does not expose per-API product scopes for keys, and its public map
tile endpoint continues to return tiles when called with another origin. The
origin/referrer controls do deny Geoapify API calls made by a browser from an
unapproved origin, but they cannot make a browser key secret or prevent a
server-side caller from spoofing or omitting browser headers. Separate keys
limit rotation blast radius; provider usage monitoring and quotas remain the
controls for public-key abuse.

## Stored data and access

The required written KYC address is stored in structured fields plus a derived
compatibility line. A four-digit postal code remains renter-entered; it is not
inferred from PSGC. A named-street address requires a house or lot number, or a
building name together with unit details. An unnamed-road address requires
subdivision, sitio, or landmark details and a confirmed private residential pin.
Existing unsplit addresses remain version 1 until the renter explicitly saves
structured details; their next save must meet the structured requirements. New
booking snapshots copy the written components; old snapshots and issued
contracts are immutable.

The pin is purpose-separated in `private.renter_residential_pins`. It is optional
for a complete named-street address and required for an unnamed-road address.
Only actor-owned security-definer RPCs project or mutate it; the table has RLS
enabled and no API-role grants. Application admins receive no pin API. Pin
records contain coordinates, selection source, optional device accuracy,
consent version, address revision, confirmation time, and audit identities.
They do not claim that a residence or identity was verified.

Saving a changed written address requires a new pin confirmation or explicit
pin removal when a pin exists. Pin removal hard-deletes the active row; no
application history is retained. Supabase infrastructure backups follow the
configured project backup lifecycle, so privacy responses must not promise
immediate erasure from already-created backups.

## Configuration and bounded verification

Configure in each applicable Vercel environment:

- `GEOAPIFY_API_KEY` — existing server-only lookup key.
- `RESIDENTIAL_GEOCODING_TIMEOUT_MS=4000` — allowed range 500–10000.
- `NEXT_PUBLIC_GEOAPIFY_MAP_KEY` — environment-specific, origin/referrer-
  restricted public browser key.

After the Geoapify dashboard restrictions are configured and the checks below
pass, configure the GitHub `production` environment:

- `RESIDENTIAL_MAP_KEY_REVIEWED=origin-referrer-reviewed-v2` — an authorized
  operator's attestation that separate public keys and their reviewed
  Development, Preview, and Production referrer/origin rules are configured.

The Production candidate gate calls the internal provider-readiness route with
the Supabase management credential. The route requires a public Cebu tile from
the Production origin and a 401/403 denial when an unapproved browser origin
attempts Geoapify geocoding. It returns aggregate status only; the key and
request URLs never enter release evidence. The local Development check applies
the same API-origin denial and also requires tiles from localhost and
127.0.0.1. `pnpm dev:setup` imports the Vercel Development browser key when
present and otherwise preserves the ignored local fallback. Use synthetic or
public Cebu fixtures for provider checks.
Never put a real home address or coordinate in CI, release evidence,
screenshots, issues, or logs. Verify search, reverse lookup, map tiles, visible
attribution, denied browser permission, manual keyboard placement, and provider
failure fallback.

Before promotion, the protected readiness route creates or rotates credentials
for one dedicated synthetic renter, signs in through the public Auth boundary,
and uses the actor-owned v2 RPCs to save/reload a structured address, set and
reload a public-fixture pin, remove it, and confirm removal with a fresh read.
It leaves the synthetic written address in place and no saved pin. After the
promoted application smoke passes, the workflow closes issues #132 and #133
with the exact SHA and release-run evidence.

Release only through `.github/workflows/release.yml`: the exact merged main SHA
must pass CI, Development migration and verification, protected Production
schema verification, candidate smoke, and promotion. The feature has no flag;
when the configured exact revision is promoted, the structured fields are
immediately active. Missing map configuration leaves the required written
address path available.

## Failure and recovery

Missing configuration, budget denial, timeout, quota, network, malformed, empty,
or tile failure never fabricates a pin. A complete named-street address remains
saveable without the map; an unnamed-road address remains blocked until the
renter can confirm its required private pin.
An unconfirmed draft remains client-only. An uncertain save is resolved by a
fresh actor-owned read. Address/pin persistence is one database transaction.

During a provider privacy incident, remove both Geoapify environment keys from
the affected environment. Written KYC remains available. Restore a reviewed
server key and restricted browser key, run the bounded synthetic checks, and
then restore service through the same exact-SHA release boundary if code changed.
