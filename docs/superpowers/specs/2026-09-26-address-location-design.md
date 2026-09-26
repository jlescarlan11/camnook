# Current-location address autofill and simpler regions

Status: implemented locally on `codex/address-location`; not deployed. See the
[implementation verification](../plans/2026-09-26-address-location-verification.md)
for checks, review fixes, and release limitations.
Date: 2026-09-26. Repository inspected at `b24c867`.

## Outcome and scope

Make the renter's address easier to enter in checkout and the account profile. Show exactly five Region choices: Metro Manila, North Luzon, South Luzon, Visayas, and Mindanao. Add **Use my current location** above the selectors to suggest the matching province/area, city/municipality, and barangay. Renters can correct every suggested value before saving.

The user requested the five groups themselves as selectable regions. Merely putting the existing official regions into optgroups would still require renters to know their administrative region; this design therefore replaces that visible step. Official PSGC codes and paths remain the saved representation.

Both screens use `KycProfileForm`, so they receive the same behavior. Other uses of `PsgcAreaSelector` retain their current official-region presentation through an explicit component presentation prop. This is component composition, not a deployment flag.

## Existing pieces we can reuse

- `src/features/locations/psgc-area-selector.tsx`: cascading choices, retry, tab drafts, and Cebu/Cebu City/Lapu-Lapu/Mandaue presentation aliases. Restoration currently assumes positional hierarchy levels and needs a canonical-path model for the new presentation.
- `src/app/api/locations/psgc/route.ts`: authenticated access to current PSGC child choices.
- `private.psgc_areas`, `private.psgc_releases`, and the existing list/resolve RPCs: versioned reference data, parent relationships, and canonical path resolution. The checked-in baseline is `2026-q2`; runtime must use whichever release is active.
- `src/features/meetups/provider.ts` and `src/app/api/kyc/residential-geocode/route.ts`: server-only Geoapify requests, actor budgets, bounded bodies, timeouts, and no-store responses. Existing reverse lookup returns only a display label; it cannot currently fill the address selectors.
- `ResidentialMap` and `ResidentialPinPicker`: explicit browser-location action, map editing, device accuracy, and separate pin confirmation.

No new provider, paid integration, dependency, location-tracking service, or persistent address schema is needed. One additive read-only reference RPC is proposed. Existing save validation remains authoritative.

## Region presentation

This is CamNook's proposed grouping, inspired by the requested shopping-address experience; it is not a claim to reproduce Shopee's current province catalogue exactly.

| Visible Region | Official regions included in the inspected reference |
| --- | --- |
| Metro Manila | NCR (`13`) |
| North Luzon | Ilocos (`01`), Cagayan Valley (`02`), Central Luzon (`03`), CAR (`14`) |
| South Luzon | CALABARZON (`04`), MIMAROPA (`17`), Bicol (`05`) |
| Visayas | Western Visayas (`06`), Central Visayas (`07`), Eastern Visayas (`08`), Negros Island Region (`18`) |
| Mindanao | Zamboanga Peninsula (`09`), Northern Mindanao (`10`), Davao (`11`), SOCCSKSARGEN (`12`), Caraga (`16`), BARMM (`19`) |

Map full ten-digit region codes, not arbitrary string prefixes of a barangay code. Central Luzon is included in North Luzon, and Palawan in South Luzon through MIMAROPA. Test that every active region belongs to exactly one group and extend the mapping during PSGC refreshes. An unexpected new region triggers an official-region fallback with a usable manual selector, rather than disappearing from the address form.

The normal visible flow is **Region → Province or area → City or municipality → Barangay**. For Metro Manila, derive the area as Metro Manila and go directly to the city; do not make the user choose the same label twice. Keep Manila's optional **District** step where required by the official hierarchy. Retain the reviewed Cebu presentation aliases. Other region-owned cities remain clearly labelled independent-city areas until additional geographic aliases are reviewed; do not invent province relationships or infer them from digits in a code.

Selecting a parent clears all descendants and the submitted barangay code. Selecting a barangay submits its real code and active release. A presentation-only area is never submitted as an official parent. For example, **Visayas → Cebu → Cebu City → Lahug** resolves to the actual PSGC path, whose Cebu City parent is the official region.

## Proposed architecture

1. **Presentation helpers** own the five group definitions and reviewed friendly-area aliases. They transform canonical reference nodes into visible choices and project a canonical path back into those choices.
2. **Reference catalogue RPC** returns active regions, provinces, cities, municipalities, and submunicipalities with parent codes in one consistent release. It contains no barangays or personal records. Existing child-choice calls lazily fetch barangays for the selected locality/district.
3. **Administrative matcher** consumes normalized Geoapify name hints and the reference catalogue. It identifies a unique locality, then matches its barangay in the correct parent context. The matcher is deterministic and independent of React/provider transport.
4. **Address-location endpoint mode** extends the existing protected residential-geocoding endpoint. It makes one reverse-geocoding request, resolves the names against current reference data, and returns a complete or partial canonical path.
5. **KYC address coordinator** owns location-request identity, applies a result atomically to the selector, and supplies the same original device coordinates as an unconfirmed pin draft. The existing explicit save action persists the reviewed address and confirmed pin.

### Reference contract

Add `api.list_psgc_address_reference()` backed by a private function following the existing authenticated-reference pattern. Return:

```ts
type AddressReference = {
  release: string;
  nodes: Array<PsgcChoice & { parentCode: string | null }>;
}; // non-barangay nodes only; maximum 3,000, fail rather than truncate
```

Return only active nodes with active ancestry from the active release, sorted deterministically. Keep raw reference tables private. Require the repository's current-user check; revoke default PUBLIC/anon execution and grant the API wrapper only to authenticated callers. Use an empty search path and fully qualified relations. Reuse existing privilege conventions because a narrow lookup of private reference tables needs controlled definer access.

Expose `GET /api/locations/psgc?view=address-reference` alongside the unchanged `?parent=` mode. The two query modes are mutually exclusive. Validate the RPC payload with Zod; return 503 for invalid/unavailable reference data. Use `Cache-Control: private, max-age=300`. Catalogue data is public geography behind the existing signed-in boundary; coordinates and provider results never enter this cache.

Using the live reference avoids a second generated matching index getting out of sync with quarterly database releases. Fetch it once per form and once per autofill request; do not globally cache authenticated clients. Request-local memoization may share repeated child reads.

### Geocoding contract

Add a separate adapter method `reverseGeocodeAddressAreas(position)` so existing map-label callers preserve their response shape. Normalize country code and bounded optional fields: city, municipality, state, county, suburb, village, district, formatted label, and result distance. Do not require a formatted label when structured hints are usable. Treat unknown/missing fields as absent, reject malformed present fields, and never expose raw provider data.

Add POST mode `address` to `/api/kyc/residential-geocode`:

```ts
type AddressLocationRequest = {
  mode: "address";
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};
type AddressLocationResult = {
  outcome: "complete" | "partial" | "unmatched";
  release: string;
  path: Array<{ code: string; name: string; type: PsgcChoice["type"] }>;
  countryCode: "PH";
  reason: "matched" | "barangay_missing" | "ambiguous" |
    "low_accuracy" | "unrecognized";
};
```

All successful results have passed the provider country check. A Philippine bounding box is only an early validation guard, not proof of country. Preserve the existing 2,048-byte body bound and coordinate range checks. Accuracy must be finite, positive, and at most 50,000 metres to match existing pin validation. Use the existing actor budget and timeout. HTTP failures distinguish 401 unauthenticated, 400 invalid input, 413 oversized input, 422 outside the Philippines, 429 quota, 503 reference/configuration/budget unavailable, and 502 provider failure. Ambiguous or absent names are successful partial/unmatched outcomes, not server errors.

### Matching rules

Use exact comparison after Unicode normalization, case folding, whitespace collapse, and type-specific prefix/suffix normalization. Allow locality variants such as `City of Cebu` / `Cebu City`, and barangay prefixes `Barangay` / `Brgy.`. Preserve meaningful numbers and parenthetical qualifiers; do not silently equate different numbered barangays. Additional aliases require explicit, scoped fixtures.

Find city/municipality candidates using `city` and `municipality`. Recognized region/province hints from `state`/`county` narrow candidates by ancestor code or reviewed friendly-area association; unrecognized hints do not create a match. Recognized contradictory hints reject the affected candidate. Never use a globally common barangay name to choose a city. If multiple localities remain, return only their confidently established common administrative prefix, or no path if they have none. When locality hints are absent or unrecognized but a province/region is uniquely identified, return that ancestor path as a partial result. Conflicting recognized ancestors yield no path.

After a unique locality is found, load its child choices. Match suburb/village/district hints against barangays only within that locality. For Manila, match its district first when supplied; if it is absent, search the at-most-14 district child lists with concurrency limited to four and accept only a unique barangay across the city. Conflicting matches yield the common prefix, not the first result. Keep all response releases equal. Resolve the deepest selected code through `resolve_psgc_area` and require current/active status and an identical canonical path before returning it.

For accuracy over 1,000 metres, or a provider result reported over 1,000 metres from the supplied position, cap autofill at city/municipality and require barangay selection. This is a conservative product threshold, not a mathematical guarantee of containment. Even a complete name match remains a suggestion for review: neither GPS nor a nearby-address result proves the renter lives there. Boundary polygons and nearest-centroid guessing are out of scope. The provider documents nearby results and optional address fields: [Geoapify MCP reverse geocoding](https://apidocs.geoapify.com/docs/mcp/reverse-geocode/) and [response fields](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

## Interaction and state

Button: **Use my current location**. Helper: “At home? Use your location to fill your area, then check the details.” Explain adjacent to the action that coordinates are sent to Geoapify to suggest the address and map pin. Keep the existing privacy link and provider attribution.

Use `getCurrentPosition` only on click, with `enableHighAccuracy: true`, `maximumAge: 60_000`, and `timeout: 10_000`. This reuses current app behavior. Browser geolocation requires permission and a secure context; deny, timeout, and unsupported states must leave manual entry available. [Browser API reference](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).

State flow: idle → locating → matching → complete / partial / unavailable. Use a polite live status, disable duplicate clicks while busy, and give errors a retry action. No automatic retries that consume provider budget. Keep text inputs editable and keep current values until a usable result is ready.

On complete: fill the canonical path and say “Area filled from your location. Check the details before continuing.” On partial: replace the area path through the known level, clear its descendants, and focus the next unanswered selector without moving focus unexpectedly during other edits. An unmatched result preserves the existing area and asks for manual selection. A successful Philippine result may stage the original device position as a pin draft even when names are unmatched. House number, street, building, unit, and postal code retain renter-entered values.

Any manual area edit, pin edit, newer location request, save attempt, or unmount invalidates the in-flight result. Abort HTTP work and ignore late GPS callbacks using a monotonic request identity. Apply area and pin changes only if that identity is still current. Busy location work must not allow a stale successful response to replace a just-submitted form.

A pin draft does not set `pinOperation=set`. It must be confirmed by the renter. Track an address-edit revision and a pin-draft revision; confirmation is valid only for the revisions it confirmed. An address edit or new pin draft after confirmation requires reconfirmation, including when a pin was confirmed earlier in the same form session. Browser draft restoration must not promote an unconfirmed candidate to a confirmed pin.

## Compatibility and data handling

Persist a versioned selector draft `{version: 2, groupId, canonicalPath, release}` using the existing tab/account/revision key. Support the previous path-array drafts and saved canonical paths by validating the deepest surviving node and reconstructing parents, including old Cebu paths containing a presentation-only province. Reject malformed drafts and remove obsolete descendants rather than guessing replacements. Expiry remains one day. Pending requests, raw provider payloads, and match confidence are not persisted.

Keep official names/codes in contracts, booking snapshots, and server validation. No backfill is required. All schema changes are additive reference functions; no residential columns or stored pins change. Coordinates travel only in POST bodies through the existing server provider boundary; do not log names, locations, request bodies, or provider payloads. User consent to autofill is not authorization to save the form.

## Validation and release

Required fixtures: Cebu/Lahug; NCR including Pateros and Manila districts; a North Luzon province; Palawan; Negros Island Region; Sulu and BARMM according to the active reference; duplicate city and barangay names; unmatched/missing hints; coarse GPS; contradictory context; mixed releases; permission denial; stale responses; saved and unfinished draft restoration; confirmation followed by another edit.

Use component and route tests plus real database tests for the new reference RPC. Sample the actual provider with public locations during implementation to verify available fields; use those observations to assess autofill coverage, not to invent matching aliases. Report which public samples fully match and which require manual completion. No accuracy or nationwide-coverage percentage is promised before that evidence exists.

Browser verification uses only the Chrome plugin extension connected to the verified `jlescarlan11@gmail.com` profile (currently Default / John lester). Use synthetic/public-location fixtures without requesting the operator's real location. Do not substitute an isolated browser profile. If extension support cannot simulate geolocation, verify success/denial in component tests and manually inspect the form in the permitted browser; report the browser coverage limit.

When implementation is authorized, ship through `.github/workflows/release.yml`: exact reviewed main revision, CI, Development checks, protected Production migration/reference checks, candidate smoke, promotion, and live verification. The feature is immediately visible without a new rollout toggle. Keep the additive RPC during application rollback. A schema/reference failure blocks promotion; runtime provider failure leaves manual entry usable.

This request authorizes architecture and planning. Implementation, hosted changes, and release are future work.
