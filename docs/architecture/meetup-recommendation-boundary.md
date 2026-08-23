# Meetup recommendation boundary

Status: implemented behind server-only configuration; not customer-active.

## Responsibility

`src/features/meetups/` is the only layer allowed to consume Geoapify response
shapes. It converts one short-lived renter browser position and one private,
coarse lender city anchor into either one safe public-place recommendation or a
constrained unavailable reason. It also powers the admin-only public-address
search used to resolve a selected place to a city anchor. Calendar UI and
booking persistence are separate consumers and do not call Geoapify directly.

The boundary is deliberately split into:

- `config.ts`: validates server-only secrets, bounds, version, and the subset of
  owner-reviewed provider categories.
- `provider.ts`: performs bounded no-store HTTPS JSON-RPC POST calls to
  Geoapify's EU MCP endpoint with header authentication, validates external JSON,
  and returns normalized city/place/address-suggestion values.
- `domain.ts`: calculates a spherical city midpoint, rejects unsafe or incomplete
  candidates, and ranks eligible venues deterministically.
- `reference.ts`: encrypts the provider place identity, safe snapshot, expiry,
  config version, and consumer binding with AES-256-GCM. The opaque reference is
  not a durable identifier and cannot be reused under another binding.
- `service.ts`: orchestrates the flow and exposes only the safe result union from
  `types.ts`.

## Privacy boundary

The exact renter coordinate is accepted only by `recommendPublicMeetup`, passed
in an HTTPS POST body to a city-level reverse lookup, and not put in either an
application or provider URL. It is not copied into returned city context,
telemetry, storage, cookies, URLs controlled by CamNook, or errors. Geoapify must
receive that coordinate to perform the lookup. Its normalized city result uses a
city centroid; subsequent midpoint and POI searches do not reuse the browser
position.

The lender anchor remains private database data. Public listing DTOs expose its
city label and schedule but not its provider ID or coordinates. The admin address
search may display a provider-formatted public place address, but the selected
value uses that single response's city label and coordinates rounded to three
decimals before it is encrypted into the save reference. The exact address is not
persisted as lender data. This keeps an address search to one provider credit;
using a true city centroid would require a second lookup or a maintained local
city-centroid dataset. The meetup service returns only the selected venue's name,
public address/city, coordinates rounded to three decimals, attribution, config
version, expiry, and encrypted reference. Provider IDs remain encrypted at the
server boundary.

Telemetry is a closed shape: status category, coarse fast/slow bucket, and result
count. It cannot carry coordinates, addresses, names, user IDs, provider payloads,
secrets, or tokens.

## Deterministic selection

The search center is the spherical midpoint of the normalized renter and lender
city centroids. Geoapify is queried with a bounded circle and proximity bias, but
CamNook does not trust provider ordering. Candidates must have a name, public
formatted address, city, provider identity, and at least one exact configured
allowlist category. Accommodation, residential-building, and populated-place
categories are rejected even if a record also carries an allowed category.

Each configured category is sent as a separate bounded provider tool call because
the provider's POST interface accepts one category per call. Eligible candidates
are then ordered by CamNook-calculated center distance, configured
category priority, normalized name, normalized address, and provider identity.
With the same normalized inputs, provider fixture, and config version, the same
venue wins.

## Failure contract

Timeout, quota, network/HTTP failure, malformed output, unsupported country/city,
empty provider output, no eligible venue, invalid input, or missing configuration
returns an unavailable category without raw provider content. The service never
fabricates a venue. Expired, tampered, malformed, or incorrectly bound opaque
references fail closed.
