# Residential Location Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let renters use their current location to move the private residential pin and fill the four canonical Philippine address selectors without showing coordinates.

**Architecture:** Extend the authenticated reverse-geocoding response with validated administrative hints and resolve those hints against the active PSGC choices on the server. Pass a one-shot canonical path request from the map through the pin picker and KYC form to the cascading selector, which validates and applies the full path atomically. Hide coordinate text and entry, and present the location action as an icon beside the existing map zoom controls.

**Tech Stack:** Next.js 16.3 App Router, React 19 client components, TypeScript, Zod, Leaflet, Supabase RPC, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-24-residential-location-autofill-design.md`

## Global Constraints

- Keep `/api/kyc/residential-geocode` authenticated and subject to the existing per-user provider budget.
- Resolve only unique parent-to-child PSGC matches; do not guess a barangay or apply partial paths.
- On unresolved location data or failed selector hydration, preserve the current address selection.
- Keep pin confirmation explicit and keep coordinates only in the existing private hidden pin fields required to save the pin.
- Do not add or run tests unless the user requests them.
- Do not add a feature flag or manual enable toggle.

## Review Focus

- Provider omits or changes administrative fields: report address autofill failure and preserve existing selectors.
- Duplicate area names exist in different parents: resolve only within the selected parent and reject ambiguity.
- Region contains independent cities or a friendly-area alias: preserve the official path and current selector presentation rules.
- A user manually changes a selector while a location path request is loading: the older request must not overwrite the manual selection.
- Geolocation is denied, outside the Philippines, times out, or reverse lookup hits quota: preserve address selections and expose a useful live status.

---

### Task 1: Return validated residential administrative hints and resolve a canonical PSGC path

**Files:**
- Modify: `src/features/meetups/provider.ts`
- Modify: `src/features/locations/types.ts` to define the shared PSGC path and area-hint types.
- Create: `src/features/kyc/residential-area-path.ts`
- Modify: `src/app/api/kyc/residential-geocode/route.ts`

**Interfaces:**
- Provider reverse method returns `{ label: string; areaHints: { region: string[]; province: string[]; locality: string[]; barangay: string[] } }` with empty arrays for absent optional hints.
- `resolveResidentialPsgcPath(areaHints, listChoices)` accepts typed `PsgcChoice` lookup results and returns `{ path: Array<{ code: string; name: string; type: PsgcChoice["type"] }>; release: string } | null`.
- The reverse API response for `mode: "reverse"` is `{ label: string; areaPath: { path: ...; release: string } | null }`.

- [ ] **Step 1: Extend the residential reverse response schema**
  In `provider.ts`, extend `residentialReverseResponseSchema` with optional validated `state`, `county`, `city`, `municipality`, `district`, `suburb`, and `village` fields. Keep `country_code`, `lat`, `lon`, and `formatted` validation. Adapt `reverseGeocodeResidentialAddress` to return the label and normalized candidate arrays. Populate `region` from `state`; `province` from `county`; `locality` from `city` and `municipality`; and `barangay` from `suburb`, `village`, and `district`. Exclude absent values and de-duplicate case-insensitively while preserving provider order.

- [ ] **Step 2: Add the server-side PSGC path resolver**
  Create `residential-area-path.ts`. Export a typed `AreaHints`, `ResidentialAreaPath`, and `resolveResidentialPsgcPath` API. Normalize candidate text by trimming, lowercasing with `toLocaleLowerCase("en")`, collapsing whitespace, and removing punctuation. Also compare region candidates after removing a leading `Region <number>` and optional parenthetical so values such as `Central Visayas` can match `Region VII (Central Visayas)`. Match choices only among children of the already matched parent, requiring exactly one choice at each chosen level. Support the canonical hierarchy forms Region → Province → City/Municipality → Barangay and Region → independent City/Municipality → Barangay. When a locality matches a child of a matched province, choose that chain; when it uniquely matches a direct regional independent city, return that official chain so the selector's existing Cebu friendly-area transformation can present the familiar area. Return `null` for absent, incomplete, or ambiguous region/locality/barangay. Keep each traversal step's `release`; return null if releases differ.

- [ ] **Step 3: Connect the resolver to authenticated PSGC RPCs**
  In `route.ts`, keep existing authentication, bounded request parsing, provider configuration, and budget claim. For reverse mode only, call the provider, then call `context.supabase.schema("api").rpc("list_psgc_area_choices", { p_parent_code })` for root and each matched parent through a small `listChoices` closure. Validate each RPC response with `psgcChoicesSchema`; on lookup failure return the existing unavailable response. Add `areaPath` to the successful reverse response, set to `null` when hints do not yield a complete unique path. Do not return coordinates in the response. Leave search mode response unchanged.

- [ ] **Step 4: Review resolver cases by inspection**
  Trace ordinary province hierarchy, direct region-level HUC, Cebu friendly-area aliases, duplicate names under separate parents, missing barangay, and mismatched PSGC releases through the helper and route. Confirm only a complete unique chain is returned, and no current form state is touched in this task.

### Task 2: Apply server-resolved area paths atomically through the address selector

**Files:**
- Modify: `src/features/locations/types.ts`
- Modify: `src/features/locations/psgc-area-selector.tsx`
- Modify: `src/features/kyc/kyc-profile-form.tsx`
- Modify: `src/features/kyc/residential-pin-picker.tsx`
- Modify: `src/features/kyc/residential-map.tsx`

**Interfaces:**
- Export `PsgcAreaPath` as `{ path: Array<{ code: string; name: string; type: PsgcChoice["type"] }>; release: string }` from `locations/types.ts`.
- `PsgcAreaSelector` consumes `selectionRequest: { id: number; areaPath: PsgcAreaPath } | null` and applies each new `id` at most once.
- `ResidentialMap` emits an optional resolved `PsgcAreaPath` to its parent through `onAreaPathResolved(areaPath)` only after a successful complete server response.

- [ ] **Step 1: Implement selector path hydration as an atomic request**
  In `PsgcAreaSelector`, add the optional `selectionRequest` prop. Extract path loading into a helper that requests choices for root and each official parent code, confirms each requested code exists in that level's choices, checks the response release matches `areaPath.release`, then applies the same Cebu friendly-area display transform used by initial hydration. Keep the current `levels` untouched while requests are pending. Use `requestGate` and `AbortController` so newer manual selections invalidate path hydration. On complete validation, set the complete levels, release, draft path, and ready status together. On failure, retain existing levels and show the existing retry/error affordance. Ignore repeated request IDs.

- [ ] **Step 2: Lift the resolved path from map to selector**
  In `KycProfileForm`, keep a monotonically increasing request id and store the latest `{ id, areaPath }` event. Pass it to `PsgcAreaSelector`. In `ResidentialPinPicker`, accept and forward an `onAreaPathResolved` callback to `ResidentialMap`. In `ResidentialMap`, parse the reverse response as `{ label?: string; areaPath?: PsgcAreaPath | null }`; emit only a non-null complete area path. Keep the existing pin callback separate so address selection and pin draft remain distinct operations. When the selector applies the path, notify `onSelectionChange` once with its canonical barangay selection and release so the existing address-change confirmation logic remains active.

- [ ] **Step 3: Preserve state across failure and request races**
  Confirm from the implementation that denied geolocation, out-of-country coordinates, reverse API errors, null `areaPath`, and selector validation errors do not change existing selector state. Ensure a manual selector interaction invalidates a pending automatic path request. Keep current checkout draft shape canonical and do not persist a half-loaded path.

- [ ] **Step 4: Review KYC and checkout integration by inspection**
  Trace the shared `KycProfileForm` rendering on account KYC and checkout. Confirm the auto-selected barangay populates `psgcAreaCode`, `psgcRelease` is the active release, and user edits still mark the residential address changed.

### Task 3: Simplify map controls and remove visible coordinate entry

**Files:**
- Modify: `src/features/kyc/residential-map.tsx`
- Modify: `src/features/kyc/residential-pin-picker.tsx`

**Interfaces:**
- Keep all existing `DraftPin` properties and hidden form fields unchanged.
- Keep map control accessible by `aria-label="Use my current location"` and a matching `title`; the control contains only the location icon, with locating progress announced in the existing live status paragraph.

- [ ] **Step 1: Remove coordinate text and manual numeric entry**
  Remove the `Pin selected at ...` coordinate readout from `ResidentialPinPicker`. Remove coordinate input state, `placeCoordinates`, validation UI, and the `Enter coordinates instead` disclosure from `ResidentialMap`. Keep coordinates in pin state and hidden inputs so confirmed residential pins continue to save.

- [ ] **Step 2: Place the icon beside the zoom controls**
  Render Leaflet's zoom control in the top-left as it does now. Replace the current absolute text button at `left-14 top-3` with an icon-only button beside the top-left zoom control; use the existing location crosshair SVG, accessible label/title, minimum 44px hit target, focus-visible styles, and disabled locating state. Ensure it remains usable when the map tile key is unavailable.

- [ ] **Step 3: Complete current-location behavior and statuses**
  Preserve explicit geolocation permission, Philippines bounds check, and accuracy metadata. After a valid position, POST reverse mode to `/api/kyc/residential-geocode`. Move the map pin with the existing draft callback. If a non-null complete `areaPath` is returned, emit it to the parent and report that the pin and address were filled. If the reverse request fails or returns no path, keep the address untouched and report that the pin was set but the address could not be filled. Keep the visible map search flow unchanged.

- [ ] **Step 4: Review visible text and accessibility by inspection**
  Confirm no latitude or longitude is visible in either component, no coordinate-entry labels remain, location action is keyboard-focusable and announced, and failure/success messages use the existing `aria-live="polite"` status.

### Task 4: Static verification and final review

**Files:**
- Review all files modified in Tasks 1–3.

- [ ] **Step 1: Run type checking**
  Run `pnpm typecheck` from the repository root. Resolve only type errors caused by this implementation.

- [ ] **Step 2: Run linting**
  Run `pnpm lint` from the repository root. Resolve lint errors caused by this implementation.

- [ ] **Step 3: Review the final diff against the spec**
  Check that API auth and budget behavior are unchanged, route responses never expose raw GPS coordinates, incomplete paths never partially replace selections, the address remains editable, the map pin still needs explicit confirmation, and no new feature flag was added. Do not run the test suite under the current instruction.
