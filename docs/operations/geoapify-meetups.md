# Geoapify meetup recommendation operations

Reviewed: 2026-08-21. Scope: Development provisioning and a future gated
production rollout. Geoapify registration and the Development credential are not
yet present in the linked CamNook Vercel project; an authorized account owner must
accept the provider terms and create the project/key before the bounded live check
can pass. No Production environment was changed during this work.

## Provider decision evidence

Geoapify was selected after Vercel Marketplace discovery returned no maps,
geocoding, or places product. The provider exposes both required HTTPS APIs and
documents worldwide/global open-data coverage. Its reverse geocoder supports a
`type=city` result and the Places API supports category-constrained circle search,
including shopping malls, public transport, and community centers.

Authoritative review sources:

- [MCP Reverse Geocode Coordinates](https://apidocs.geoapify.com/docs/mcp/reverse-geocode/): POST body city-level lookup and response fields.
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
- `MEETUP_ALLOWED_CATEGORIES`: comma-separated subset of the reviewed constants
  in `src/features/meetups/config.ts`.
- `MEETUP_PROVIDER_CONFIG_VERSION`: bump when category/ranking policy changes.
- `MEETUP_PROVIDER_TIMEOUT_MS`: 500–10000; default 4000.
- `MEETUP_SEARCH_RADIUS_METERS`: 1000–20000; default 8000.

Use `vercel env add <NAME> development` for secrets and settings. Do not paste
values into tickets, commits, terminal transcripts, analytics, or chat. The
currently installed local Vercel CLI is 59.1.3 while 59.3.0 is available; upgrade
before provisioning to avoid compatibility drift.

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

## Quota, outage, and rotation

Each recommendation costs one reverse-geocoding operation plus one Places
operation for every configured category (each returns at most 20 results). Monitor the provider dashboard
for daily credits, rate limits, abnormal failures, and plan cost. CamNook must fail
closed on quota, timeout, network, malformed, unsupported, or empty responses;
there is no static or fabricated fallback.

To rotate, create a new dedicated key, update Development, run the bounded check,
then revoke the old key. Rotate `MEETUP_RECOMMENDATION_SECRET` only with awareness
that every unexpired opaque reference minted with the old value becomes invalid;
the current lifetime is 15 minutes.

For an outage or privacy incident, disable the later rollout flag, revoke the
Geoapify key, and remove all meetup variables from the affected Vercel environment.
No precise renter location backfill or cleanup should exist because CamNook never
persists it. Public venue snapshots created by the later booking issue follow that
booking's retention rules.
