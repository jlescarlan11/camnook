# Lender-managed meetup places

Status: implemented locally, 2026-09-20. Migration and application changes are prepared and tested; not deployed. See docs/operations/lender-meetup-places.md for verification and release prerequisites.

## Product decision

The lender defines reusable public meetup places and enables a small set for each camera. The renter chooses one during checkout. Submission saves an immutable copy of the selected place with the booking; owner approval accepts that location alongside the rental request.

Recommended first-version defaults: one to three choices per camera, explicit renter selection, the same place for pickup and return, and no arbitrary renter-entered location. Keep automatic place discovery as an optional lender setup aid. Checkout reads saved places and does not depend on geocoding or routing services.

The current repository is admin-managed inventory: cameras do not have a lender ownership relation. Use the existing admin authorization boundary for the first version. A future multi-lender marketplace must add camera ownership and scope place management and assignment to that owner; created_by is an audit field, not an ownership substitute.

## User experience

1. Owner opens Meetup places, searches for a public venue or positions a pin, and confirms the exact entrance. Require a name, written address, city, coordinates, and optional arrival instructions. Display the map position before saving. Search results are suggestions, not proof of safety or opening hours.
2. Owner assigns one to three active places to a camera and orders them. Activation means the owner can use them at that camera's offered handoff times. Time-specific place availability is outside the first version.
3. Checkout replaces Preferred meetup area and the default residential-area suggestion with Choose your meetup place. Show compact radio cards with name, address, arrival instructions, and View on map. One option still requires confirmation. Keep maps collapsed until requested.
4. Review, booking details, and owner review all show the same saved selection, labelled Pickup and return. Directions target the saved pin. Before approval, state that the place is requested and subject to owner approval.
5. Owner approval uses the submitted snapshot; editing or archiving the reusable place cannot move this booking. Do not add a silent location override to approval.

## Data model

| Object | Purpose and fields |
| --- | --- |
| meetup_places (new) | Reusable owner-managed entries: id, version, name, address, city, latitude, longitude, arrival_instructions, source (manual_pin or provider_search), optional provider metadata/attribution, archived_at, created_by, updated_by, timestamps. |
| camera_meetup_places (new) | Camera-to-place assignment: camera_id, place_id, display_order. Unique pair; enforce the active option limit transactionally. |
| booking_meetup_plans (extend) | Existing append-only booking snapshot. Add an explicit lender_place variant, source_place_id, source_place_version, and arrival instructions; copy all display fields and coordinates. Do not resolve display data through the reusable place after submission. |

Store latitude as numeric(9,6) and longitude as numeric(10,6), with range and non-null checks. Six decimals preserve the selected point; they do not guarantee GPS or provider accuracy. Widen the existing three-decimal venue columns, but do not fabricate precision for historical records. Audit provider adapters and save paths for rounding before reuse. Keep coordinates explicit in application types to prevent latitude/longitude swaps.

Provider metadata is optional for a manual pin. Do not force a fabricated Geoapify attribution or misuse renter_city_label for the venue city. Extend the current variant constraints and parsers deliberately so legacy public_venue, canonical_area, and preferred_area snapshots continue to load. For lender_place, renter_city_label may be absent; update contract projections accordingly.

Archiving hides a place from new choices. Retain the record for provenance, and restrict destructive deletion. Changes to material fields increment version atomically. A camera may remain a draft without places; requesting a published camera requires at least one active assigned place.

## Write path and concurrency

Checkout submits place ID and expected version, together with the existing camera, schedule, policy version, and operation ID. Never accept renter-supplied venue coordinates as authoritative booking data.

Extend the existing server action and transactional booking RPC. Authenticate the renter on the server; preserve eligibility, suspension, request limit, availability, schedule, and pricing checks. In the transaction:

1. Claim the idempotency operation using a fingerprint that includes place ID and version. An identical completed retry returns its original booking even if the library was edited later; changed input under the same operation ID fails.
2. Lock the camera, assignment, and place using a consistent order shared by administrative edits. Verify the assignment, active state, and expected version.
3. Insert the booking and complete meetup snapshot together, then complete the operation. Either all persist or none do.

If a place changed while checkout was open, return meetup_changed, preserve the renter's other answers, refresh options, and require a new selection. Unassigning or archiving a place must serialize with booking creation. If the last option is removed, block new requests with a clear unavailable message; existing requests retain their snapshot.

Owner approval and contract creation use the booking snapshot. Update the existing contract snapshot trigger and all owner/renter detail projections for the new variant.

## Access and maps

Only existing authorized admins manage places in version one. Renter-facing reads expose only active places assigned to eligible published cameras. Booking snapshots are visible only to their renter and authorized admins. Enable RLS and explicit grants on new tables; privileged RPCs must retain explicit authorization and limited execute grants. Future lender accounts require owner-scoped policies, not merely authentication.

These are intentionally shared public venue pins. Never populate them from private residential KYC pins or reuse residential-pin disclosure logic. Names, addresses, pins, and instructions are visible before booking so renters can decide whether they can travel there. Avoid including these values in telemetry.

Build View on map and Directions links from validated snapshot coordinates, not a text search or a stored arbitrary URL. Google Maps directions URLs support a latitude/longitude destination. Users can use their maps app for navigation; CamNook does not need live renter GPS or route calculation for this release. If an embedded map fails, retain the address, instructions, coordinate-copy action, and directions link.

Reuse the existing provider boundary for optional owner search, with authentication, query limits, timeouts, attribution, and a server-validated selection. Its current city-anchor path rounds location data and is unsuitable for exact pins without adaptation. Confirm provider storage and attribution terms before implementing durable provider-sourced entries. A manual pin remains available if search is unavailable. Existing saved choices remain usable during provider outages.

## Existing bookings and changes of location

Preserve legacy area-only records as area-only: never geocode free text into an allegedly agreed exact location. Label these records as needing meetup coordination. Do not rewrite issued contract snapshots.

First version: no editing a submitted booking's location. If the owner cannot honor the selected place, decline the pending request with a reason; the renter may submit a new selection. Confirmed bookings follow existing support/cancellation procedures rather than silently changing their pin.

A later amendment feature can store a proposed immutable replacement, explicit renter acceptance, and a contract amendment/history. It should also handle adding a confirmed pin to legacy area-only bookings. This needs its own workflow and is not a direct update to the append-only snapshot.

## Implementation sequence and acceptance

1. Add tables, snapshot variant, constraints, access controls, and database tests. Preserve legacy reads. Inventory and update every RPC, parser, contract projection, and detail view consuming meetup plans.
2. Build owner place setup and per-camera assignment; prepare real owner-confirmed places before switching new checkout requests to require them. Do not seed guessed coordinates.
3. Connect checkout selection to the atomic request path, review, booking details, and directions. Retire the free-text-area path for new requests while retaining historical support.
4. Test stale selections, concurrent archive/unassignment, forged IDs/coordinates, unauthorized writes/reads, duplicate retries, changed retry payloads, rollback, contract fidelity, and historical booking rendering. Browser-test mobile/desktop selection and that map links use the chosen snapshot pin.
5. Release through the repository's verified production path using the exact tested commit and verify live behavior. No new feature flag or manual enable toggle. Owner place data is a publication prerequisite, not a rollout flag.

Acceptance example: a renter selects a named mall entrance and submits; the owner subsequently moves that reusable pin. The existing booking, contract, and Directions still use the original entrance. A stale checkout must refresh before it can submit the changed place.

## Evidence and references

- Existing booking action: src/features/bookings/actions/request-booking.ts.
- Existing snapshot schema: supabase/migrations/20260820184210_add_booking_meetup_plans.sql.
- Current free-text-area path and contract trigger: supabase/migrations/20260904101743_simplify_booking_and_owner_inventory.sql.
- Existing snapshot parsing: src/features/meetups/plan.ts.
- Existing provider boundary: docs/architecture/meetup-recommendation-boundary.md. Its checkout description reflects the earlier flow; this proposal supersedes it for new checkout selection once implemented.
- [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Google Maps URL documentation](https://developers.google.com/maps/documentation/urls/guide).
