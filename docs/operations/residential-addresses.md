# Structured residential address and optional pin

Reviewed: 2026-09-09. Implementation status: code and local verification only.
Production use additionally requires the environment and release checks below.

The 9 September 2026 environment inventory confirmed the existing server-side
Geoapify and Mapbox credentials. `RESIDENTIAL_GEOCODING_TIMEOUT_MS=4000` is
configured for Development, Preview, and Production. The inventory did not
contain `NEXT_PUBLIC_GEOAPIFY_MAP_KEY`. Vercel does not expose provider-side
product or origin restrictions, so the Geoapify Maps scope and reviewed origins
also remain a release check. Do not promote this feature until that key is
provisioned and verified.

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
be restricted in Geoapify to Maps only and to the exact Development, Preview,
and Production web origins that need it. Never put `GEOAPIFY_API_KEY`, the
Mapbox token, a Supabase secret key, or another privileged credential in this
variable. Tile requests necessarily disclose requested tile coordinates and
technical request metadata to Geoapify; attribution remains visible on the map.

## Stored data and access

The required written KYC address is stored in structured fields plus a derived
compatibility line. Postal code remains renter-entered; it is not inferred from
PSGC. Existing unsplit addresses remain version 1 until the renter explicitly
saves structured details. New booking snapshots copy the written components;
old snapshots and issued contracts are immutable.

The optional pin is purpose-separated in `private.renter_residential_pins`.
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
- `NEXT_PUBLIC_GEOAPIFY_MAP_KEY` — origin- and Maps-restricted public key.

Use synthetic or public Cebu fixtures for provider checks. Never put a real
home address or coordinate in CI, release evidence, screenshots, issues, or
logs. Verify search, reverse lookup, map tiles, visible attribution, denied
browser permission, manual keyboard placement, and provider failure fallback.

Release only through `.github/workflows/release.yml`: the exact merged main SHA
must pass CI, Development migration and verification, protected Production
schema verification, candidate smoke, and promotion. The feature has no flag;
when the configured exact revision is promoted, the structured fields are
immediately active. Missing map configuration leaves the required written
address path available.

## Failure and recovery

Missing configuration, budget denial, timeout, quota, network, malformed, empty,
or tile failure never fabricates a pin and never blocks written-address saving.
An unconfirmed draft remains client-only. An uncertain save is resolved by a
fresh actor-owned read. Address/pin persistence is one database transaction.

During a provider privacy incident, remove both Geoapify environment keys from
the affected environment. Written KYC remains available. Restore a reviewed
server key and restricted browser key, run the bounded synthetic checks, and
then restore service through the same exact-SHA release boundary if code changed.
