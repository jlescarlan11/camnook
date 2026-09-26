# Residential Location Autofill Design

**Status:** Draft for review

**Date:** 2026-09-24

## Goal

Make residential location entry easier during KYC and checkout. Users can use device location to position their private map pin and fill the structured Philippine address (region, province or area, city or municipality, and barangay). The interface must not display latitude or longitude.

The supplied screenshots are visual references. The user request is the product instruction: hide coordinates, make the map's location action a symbol beside zoom controls, and add current-location autofill for the four PSGC address levels.

## Current behavior

- `ResidentialMap` uses browser geolocation to set a draft pin. It already calls the authenticated residential geocoding API for reverse labels, but only displays a status label.
- `ResidentialPinPicker` visibly prints pin latitude and longitude and carries the draft pin into the KYC form.
- `ResidentialMap` exposes manual latitude/longitude entry in an openable disclosure.
- `PsgcAreaSelector` loads and validates the cascading hierarchy from `/api/locations/psgc`, and stores the canonical barangay code and PSGC release.
- `/api/kyc/residential-geocode` authenticates requests and applies the provider budget before reverse geocoding. Its response currently contains a formatted label only.

## Design

### User interaction

- Keep the existing map pin, tap-to-place, drag-to-adjust, and address search behavior.
- Remove the visible coordinate readout and manual coordinate fields. Coordinates remain in the existing hidden form fields needed to save a pin.
- Replace the map's text location control with an icon-only location control placed beside Leaflet's `+` and `−` controls. Give it an accessible name and title, and retain a visible locating state through disabled styling and live status text.
- When the user activates it, request device geolocation, validate that it is inside the Philippines, then reverse-geocode it. On a complete PSGC match, move the draft pin and request selection of the canonical PSGC path in the form. The existing explicit “Confirm this pin” action remains required to save the moved pin.
- If geolocation is denied or unavailable, reverse geocoding fails, or the area path cannot be resolved completely, show a useful status and preserve the current address selections. Partial auto-selection is not applied; users can use the existing selectors manually.

### Data flow and component boundary

1. `ResidentialMap` obtains device coordinates only after the user activates the location control.
2. The existing authenticated `/api/kyc/residential-geocode` reverse mode returns the formatted label plus validated administrative names needed to identify the PSGC path. Provider-specific response parsing stays in the server-only geocoding adapter.
3. The route resolves those names against the active canonical hierarchy using the authenticated `api.list_psgc_area_choices` RPC, walking parent-to-child and requiring a unique match at each level. It returns a complete, ordered path of `{code, name, type}` entries and the active PSGC release alongside the label. If a unique complete path is unavailable, it returns a successful reverse label with no selectable path; it does not guess a barangay or substitute coordinates.
4. The map reports the location result upward through `ResidentialPinPicker` to `KycProfileForm`. The form passes a one-shot, identified path request into `PsgcAreaSelector`.
5. `PsgcAreaSelector` loads/validates the requested path using its existing choice endpoints and friendly-area rules. It applies the hierarchy atomically only after every code is confirmed as a child of the preceding code. It updates the hidden barangay code, release, and existing checkout draft. Failed path validation leaves existing selections untouched.

This retains the existing authenticated boundary and active PSGC source. It requires no schema change or new provider, and it keeps provider-specific naming and canonical-code resolution outside of UI components.

### Name matching

- Extend the reverse-provider schema only with known optional administrative fields needed for matching (region/state, province/county, locality/city/municipality, and barangay/suburb/village/district candidates); continue validating country and coordinates.
- Normalize case, whitespace, punctuation, and common provider/PSGC region prefixes for comparisons. Match only within the current parent level and only when one canonical choice matches. Do not use fuzzy/geographic-nearest matching to infer a barangay.
- The hierarchy supports Philippine regions with provinces and cities directly under regions, and the selector's existing familiar-area aliases for Cebu. The returned path uses canonical codes/names; presentation continues to use the selector's current labels.

### Failure and privacy behavior

- Geolocation permission is requested only after the user's explicit action. Existing timeout and accuracy settings remain.
- Out-of-country coordinates are rejected before reverse geocoding.
- Provider quota, unavailable PSGC data, ambiguous names, incomplete address components, and stale requests produce a status message and no change to the current selectors. The map pin may move only after a successful in-country geolocation; if reverse geocoding cannot complete, report that address autofill failed and retain the address selections.
- The route continues to require authentication and use the existing per-user provider budget. It returns only the location label and canonical area path, never the raw device coordinates.
- The browser still retains coordinates in memory and submits them through existing hidden pin fields when the user confirms the pin. The requested privacy change is to remove their display and manual coordinate entry, not to stop saving the required private map pin.

## Scope

Included: geolocation control placement and icon, coordinate-display/entry removal, reverse-geocode response enrichment, unique PSGC path resolution, selector request/application, and accessible success/failure statuses.

Excluded: address autocomplete changes, automatic pin confirmation, changing pin persistence, changing KYC validation requirements, map provider changes, enabling feature flags, and production promotion.



## Validation plan

- Review the provider response parsing, PSGC hierarchy resolver, atomic selector application, geolocation failure paths, and accessible control through focused code inspection.
- Run repository-required type and lint checks for the changed code. Do not add or run tests unless the user requests them.
- Review the production checkout and KYC rendering paths to ensure the same shared components receive the change.

## Risks and open implementation details

- Reverse-geocoder administrative fields vary by locality. Missing or ambiguous barangay data must leave the selector unchanged and let the user complete it manually.
- Preserve existing PSGC friendly-area behavior when applying a canonical path, especially the difference between formal parentage and the province-or-area labels shown to users.
- Request identifiers and selector cancellation must prevent an older location result from overwriting a newer manual selection.
