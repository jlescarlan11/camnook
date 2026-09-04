# Meetup recommendation boundary

Status: implemented as an always-on, fail-closed server boundary.

## Responsibility

`src/features/meetups/` is the only layer allowed to consume Geoapify or Mapbox
response shapes. It converts a confirmed renter origin and a private lender
origin into up to five safe public-place recommendations or a
constrained unavailable reason. It also powers the admin-only public-address
search used to resolve a selected place to a city anchor. Calendar UI and
booking persistence are separate consumers and do not call Geoapify directly.

The boundary is deliberately split into:

- `config.ts`: validates server-only secrets, bounds, version, and the subset of
  owner-reviewed provider categories.
- `provider.ts`: performs bounded no-store HTTPS JSON-RPC POST calls to
  Geoapify's EU MCP endpoint with header authentication, validates external JSON,
  and returns normalized city/place/address-suggestion values.
- `routing-provider.ts`: performs one bounded, asymmetric, duration-only Mapbox
  Matrix request from two origins to at most eight Geoapify venue coordinates.
  It preserves `null` as unreachable and exposes no provider response shape.
- `provider-budget.ts` and `routing-budget.ts`: reserve Geoapify calls and Mapbox
  billable elements independently through service-role-only database functions.
- `domain.ts`: calculates a spherical city midpoint, rejects unsafe or incomplete
  candidates, and ranks eligible venues deterministically.
- `reference.ts`: encrypts the provider place identity, safe snapshot, expiry,
  provider/routing policy versions, and consumer binding with AES-256-GCM. The opaque reference is
  not a durable identifier and cannot be reused under another binding.
- `service.ts`: orchestrates the flow and exposes only the safe result union from
  `types.ts`.

## Privacy boundary

An exact renter coordinate is accepted only by `recommendPublicMeetup`. It is
passed in an HTTPS POST body to Geoapify's city-level reverse lookup and in the
server-only Mapbox Matrix URL required by that provider. No Mapbox URL is ever
logged, returned, persisted, or exposed to the browser. The coordinate is not
copied into returned city context,
telemetry, storage, cookies, URLs controlled by CamNook, or errors. Geoapify must
receive that coordinate to perform the lookup; Mapbox receives it only for the
transient route comparison. The confirmed device coordinate and lender origin
drive the midpoint search; manual-city routing uses the normalized city centroid
and is labeled approximate.

Saved renter and lender anchors remain private database data. Public listing DTOs expose the
lender's area label, approximation level, and schedule but not provider IDs or coordinates. The admin address
search may display a provider-formatted public place address, but the selected
value uses that single response's city label and coordinates rounded to three
decimals before it is encrypted into the save reference. The exact address is not
persisted as lender data. This keeps an address search to one provider credit;
using a true city centroid would require a second lookup or a maintained local
city-centroid dataset. The meetup service returns only the selected venue's name,
public address/city, coordinates rounded to three decimals, attribution, config
version, expiry, and encrypted reference. Provider IDs remain encrypted at the
server boundary.

Telemetry is a closed aggregate shape: status category, coarse fast/slow bucket,
seed/provider-request/raw/quality-rejection/candidate counts, provider-budget
outcome, reserved element count, profile/policy version, and routing fallback
class. It cannot carry coordinates, addresses, names, user IDs, provider payloads,
routes, secrets, tokens, or constructed URLs.

## Deterministic selection

Discovery uses one deterministic spherical midpoint between the lender and renter
origins. CamNook performs one search per configured category around that midpoint,
then merges results by provider identity and category; it does not trust provider
ordering. Together with the city or centroid lookup, a complete recommendation
uses no more than five Geoapify calls.
Candidates must have a meaningful name, public
formatted address, city, provider identity, and at least one exact configured
allowlist category. Accommodation, residential-building, and populated-place
categories are rejected even if a record also carries an allowed category.
Identifier-like names such as unit numbers or route numbers and records outside
the configured midpoint radius are also rejected.

Each configured category is sent as a separate bounded provider tool call because
the provider's POST interface accepts one category per call. Eligible candidates
are then ordered by CamNook-calculated center distance, configured
category priority, normalized name, normalized address, and provider identity.
The first eight distinct eligible candidates are compared with one Mapbox
`driving-traffic` matrix from the renter and owner origins. CamNook returns at most
five reachable venues by lowest maximum individual travel time, then lowest
combined travel time, then the existing deterministic Geoapify order. If routing
configuration, budget, or provider output is unavailable—or every pair is
unreachable—the same eligible shortlist produces up to five deterministic
Geoapify-ranked options with no travel-time claim. Geoapify failure remains hard
unavailable and never fabricates a venue.

Checkout initially renders only the first three choices. A semantic button
reveals choices four and five when present; no ordinal “best” claim is shown.

## Failure contract

Geoapify timeout, quota, network/HTTP failure, malformed output, unsupported
country/city, empty output, no eligible venue, invalid input, or missing Geoapify
configuration returns an unavailable category without raw provider content.
Mapbox failures remove route claims while preserving eligible Geoapify options.
Expired, tampered, cross-actor/camera/schedule, or policy-version-mismatched opaque
references fail closed. Only the selected reference can become the one immutable
Geoapify booking snapshot; alternatives and route estimates are discarded.
