# Geoapify meetup recommendation operations

Reviewed: 2026-08-30. Scope: the always-on meetup recommendation path used by
published booking requests. The application has no meetup feature flag; missing
or invalid provider configuration fails closed without admitting a booking.

## Provider decision evidence

Geoapify was selected after Vercel Marketplace discovery returned no maps,
geocoding, or places product. The provider exposes both required HTTPS APIs and
documents worldwide/global open-data coverage. Its reverse geocoder supports a
`type=city` result and the Places API supports category-constrained circle search,
including shopping malls, fast-food restaurants, universities, and police stations.

Authoritative review sources:

- [MCP Reverse Geocode Coordinates](https://apidocs.geoapify.com/docs/mcp/reverse-geocode/): POST body city-level lookup and response fields.
- [MCP Geocode Structured Address](https://apidocs.geoapify.com/docs/mcp/geocode-structured/): POST body fallback lookup constrained to Philippine city/municipality input.
- [MCP Search Places](https://apidocs.geoapify.com/docs/mcp/search-places/): POST body category/radius search and normalized place fields.
- [Geoapify MCP Server](https://apidocs.geoapify.com/docs/mcp/): header-based API-key authentication and underlying API credit pricing without an MCP surcharge.
- [Places API categories](https://apidocs.geoapify.com/docs/places/): reviewed category vocabulary and one credit per 20 returned places.
- [Platform overview](https://www.geoapify.com/): global open-data coverage and permission to store results, subject to attribution.
- [Terms and Conditions](https://www.geoapify.com/terms-and-conditions/), version 5 dated 2024-02-02: registration authority, plan limits, no quota circumvention, mandatory OpenStreetMap attribution, and mandatory Geoapify attribution on the Free plan.
- [Data Processing Agreement](https://www.geoapify.com/data-processing-agreement/), revision 2024-08-15: API coordinates and technical metadata may be processed; detailed personally identifiable information is normally kept no longer than 24 hours and exceptional suspicious/fraud-related request details up to two months. `api-eu.geoapify.com` guarantees EU-bound request processing.
- [Privacy Policy](https://www.geoapify.com/privacy-policy/): successful request data is generally retained no longer than 24 hours to produce aggregate usage statistics.
- [Pricing](https://www.geoapify.com/pricing/): plan quotas, request-per-second limits, and current commercial pricing. Re-check before Production activation because pricing and terms can change.

This boundary permits a saved public venue snapshot because Geoapify explicitly
permits result storage, while always rendering OpenStreetMap attribution and the
Free-plan Geoapify attribution. It does not store the exact renter position or raw
provider response. Before Production use, the owner must confirm the selected
plan permits CamNook's expected commercial volume and execute/accept any required
data-processing terms.

## Required Development configuration

Create one Geoapify project owned by an authorized CamNook representative. Use a
dedicated Development key, not a personal or Production-shared key. Set these as
server-only Vercel Development variables; never use a `NEXT_PUBLIC_` prefix:

- `GEOAPIFY_API_KEY`: dedicated provider key.
- `MEETUP_RECOMMENDATION_SECRET`: independently generated random value of at
  least 32 characters; it is not the provider key.
- The four reviewed venue categories are code-owned in
  `src/features/meetups/config.ts`, so a deployed revision cannot keep the older
  category set through stale environment configuration.
- `MEETUP_PROVIDER_CONFIG_VERSION`: bump when ranking or binding policy changes.
- `MEETUP_PROVIDER_TIMEOUT_MS`: 500–10000; default 4000.
- `MEETUP_SEARCH_RADIUS_METERS`: 1000–20000; default 8000.

Use `vercel env add <NAME> development` for secrets and settings. Do not paste
values into tickets, commits, terminal transcripts, analytics, or chat. Use the
repository release path and a current authenticated Vercel CLI; the 2026-09-01
inspection used CLI 59.10.0, while 59.11.0 was available. Upgrade before
provisioning, then re-run `vercel env ls <environment>` and record names/scopes
only, never values.

## Bounded Development check

After pulling Development environment values into a private local environment,
run:

```sh
pnpm meetup:check:development
```

The check refuses a Production Vercel context, makes one city reverse lookup and
one bounded Cebu-area Places lookup, and validates an eligible reviewed venue or
an explicit no-coverage result. Normal CI skips it and consumes intercepted
fixtures, so builds never spend live quota or depend on provider availability.

Record only the date, environment, config version, safe status category, and
pass/fail. Do not record the request URL, key, exact input, raw response, place ID,
opaque reference, or user identity.

## Automated Production check

Vercel Production secrets are non-exportable, so the protected release job tests
them inside the staged candidate rather than downloading them. It calls the
candidate-only `/api/internal/meetup-provider-readiness` route with the existing
protected Supabase management credential. The route verifies that credential
against the fixed Production project, validates both runtime provider
configurations, proves the complete category plan remains within five calls, and
checks Geoapify venues plus Mapbox durations using public Cebu fixtures only.

The route returns only bounded counts and pass/fail categories. Provider keys,
raw responses, place identities, addresses, and coordinates are never returned
or logged. A failed check leaves the candidate unaliased and blocks Production
migration and promotion. Release evidence records only the exact Git SHA and
provider pass/fail status.

## Quota, outage, and rotation

Each current-position recommendation costs one reverse-geocoding operation plus
one midpoint Places operation per code-owned reviewed category (each returns at
most 20 results). Saved origins skip the reverse lookup. Manual-city and
canonical-area recommendations consume one geocoding operation before midpoint
discovery. With at most four reviewed categories, every complete recommendation
reserves no more than five calls before any provider request. Mapbox
routing is budgeted separately; see `docs/operations/mapbox-meetup-routing.md`. Monitor the provider dashboard
for daily credits, rate limits, abnormal failures, and plan cost. CamNook must fail
closed on quota, timeout, network, malformed, unsupported, or empty responses;
there is no static or fabricated fallback.

To rotate, create a new dedicated key, update Development, run the bounded check,
then revoke the old key. Rotate `MEETUP_RECOMMENDATION_SECRET` only with awareness
that every unexpired opaque reference minted with the old value becomes invalid;
the current lifetime is 15 minutes.

For an outage or privacy incident, revoke the Geoapify key and remove the meetup
provider variables from the affected Vercel environment. The application fails
closed until valid configuration is restored.
No precise renter location backfill or cleanup should exist because CamNook never
persists it. Public venue snapshots created by the later booking issue follow that
booking's retention rules.

The manual fallback sends only the submitted city/municipality to the structured
geocoder with `country=Philippines` and `country_codes=ph`. Street-like input is
rejected before the provider call. Provider city/place identifiers are used only
inside the server recommendation boundary and are not persisted in a booking or
returned as client-visible claims.

## Owner handoff-city suggestions

The administrator handoff-policy page uses the same server-only provider boundary
without exposing provider identifiers or city-anchor coordinates as editable form
fields. Browser geolocation runs only after the administrator selects **Use my
current city**. The exact position is submitted directly to the protected Server
Action, used for one city-level reverse lookup, and is not returned, persisted,
placed in a URL, logged, or copied into audit metadata.

The server returns only a city label, expiry, and an encrypted short-lived
confirmation. That confirmation is bound to the administrator, camera, current
policy version, and provider configuration version. Policy save rejects expired,
tampered, replayed, cross-camera, cross-user, stale-version, and configuration-
mismatched confirmations before the atomic policy RPC. A manual Philippine
city/municipality lookup produces the same confirmation contract.

Canonical camera city/barangay centroids consume one bounded geocoding call on
save after resolving the active PSGC path. For a previously configured legacy
policy, schedule-only changes re-read the private city anchor from the authorized
database RPC rather than round-tripping private anchor fields through the
browser. A camera can instead establish a canonical origin without a legacy
anchor. Provider or configuration failure never erases or replaces an existing
handoff policy or canonical origin.
