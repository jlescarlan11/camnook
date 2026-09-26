# Current-location address autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are optional only when separately authorized.

**Goal:** Offer five familiar region choices and fill the renter's official address areas from an explicitly requested device location.

**Architecture:** A presentation layer maps five groups to current PSGC nodes. A bounded read-only reference RPC and a deterministic server matcher translate Geoapify name hints into an official path. The shared KYC form applies that path and stages an unconfirmed device pin, preserving existing save validation.

**Tech Stack:** Installed Next.js 16.3, React 19.2, TypeScript, Zod, Supabase/Postgres, existing Geoapify MCP adapter and Leaflet, Vitest/Testing Library, repository database harness.

**Spec:** [Address location architecture](../specs/2026-09-26-address-location-design.md).

## Global Constraints

- Exactly five normal Region choices: Metro Manila, North Luzon, South Luzon, Visayas, Mindanao.
- Store canonical PSGC code/release/path; never persist shopping groups as official regions.
- Reuse existing providers and dependencies; one additive reference RPC, no residential data migration.
- Ask for device location only on click; preserve manual entry and renter-entered street/house/postal fields.
- One provider reverse lookup per action; preserve authenticated budgets, bounded bodies, POST privacy, and no-store responses.
- Unknown/ambiguous barangays require manual completion; accuracy or result distance over 1,000 metres caps autofill at locality.
- Pin candidates require explicit confirmation; any later address or draft-pin change invalidates that confirmation.
- Re-read relevant installed Next.js docs before product code. Preserve unrelated working-tree changes, including the existing edit to `docs/app-audit/state.md` observed during planning.
- Browser verification uses the Chrome extension and verified `jlescarlan11@gmail.com` profile only.
- Release via the repository's exact-revision workflow and verify live behavior; no new feature flag.

## Review Focus

- Saved Cebu paths with a synthetic province and canonical region-owned cities must restore to the same official barangay (Task 4).
- Manila districts, Pateros, and a newly introduced official region must remain selectable (Tasks 1–4).
- A GPS/provider response arriving after a manual edit, save, retry, or unmount must never overwrite newer state (Task 5).
- Confirmation followed by another address/pin edit, including a draft restored after reload, must require confirmation again (Task 5).
- Database release changes and provider names disagreeing with current administrative parents must yield partial/manual recovery, never a fabricated full address (Tasks 2–3).

## File ownership

| Unit | Files |
| --- | --- |
| Shared types and presentation | `src/features/locations/types.ts`, new `address-presentation.ts` and tests |
| Current reference catalogue | New forward migration created by the CLI, new database test, generated database types, existing PSGC route and tests |
| Provider hints and matching | Existing `src/features/meetups/provider.ts` and tests; new `src/features/locations/address-matcher.ts`, `address-reference.ts`, and tests |
| Address lookup endpoint | Existing `src/app/api/kyc/residential-geocode/route.ts` and tests |
| Cascade state and rendering | Existing `psgc-area-selector.tsx`; new `address-selection.ts` and tests; existing selector tests |
| Browser location and KYC | New `src/features/kyc/address-location-control.tsx` and tests; existing KYC form, pin picker, map, and interaction tests |
| Verification and operations | Existing CI/database harness and hosted-test manifest as needed; residential-address and PSGC operation docs; privacy page |

## Task 1: Define the five-region presentation and canonical types

**Interfaces:** Export `AddressGroupId`, `AddressPath`, `AddressReference`, `AddressLocationResult`, and their Zod schemas from `locations/types.ts`. In `address-presentation.ts`, export `groupForRegion(regionCode: string): AddressGroupId | null`, `provinceAreaChoices(reference: AddressReference, group: AddressGroupId): PresentationChoice[]`, and `projectAddressPath(reference: AddressReference, path: AddressPath): PresentedAddress`. A `PresentationChoice` has `{id, label, kind: 'province' | 'independent-city' | 'metro-manila', canonicalCode}`. `PresentedAddress` has `{groupId, areaId, localityCode, districtCode, barangayCode}`, each nullable when not selected. Presentation helpers never construct fake canonical paths.

- [ ] Add table-driven tests covering all 18 checked-in region codes against the exact spec mapping, including Central Luzon → North Luzon, MIMAROPA → South Luzon, and NIR → Visayas. Assert an unknown code returns null.
- [ ] Add tests proving Cebu City/Lapu-Lapu/Mandaue appear under Cebu, NCR bypasses duplicate province input, and independent cities without reviewed aliases remain reachable. Assert canonical city parents are unchanged.
- [ ] Run `pnpm test src/features/locations/address-presentation.test.ts` and verify the new behavior is absent before implementing it.
- [ ] Implement the helpers and extract the existing Cebu alias mapping into this shared module. Add strict schemas for every boundary defined in the spec; bound path length to five and catalogue nodes to 3,000. Validate parent existence, uniqueness, node types, and acyclic ancestry.
- [ ] Run the focused tests and `pnpm typecheck`. Commit only this task's files once its deliverable passes.

## Task 2: Add the current reference catalogue

**Interfaces:** `api.list_psgc_address_reference()` takes no arguments and returns the spec's `AddressReference`. `loadAddressReference(client: SupabaseClient<Database>): Promise<AddressReference>` in `address-reference.ts` is server-only and validates that result. `GET /api/locations/psgc?view=address-reference` exposes it to authenticated form users. Preserve existing child-choice response shapes.

- [ ] Add `supabase/tests/database/psgc_address_reference.sql` following the repository's transaction/actor fixture conventions. Assert anonymous rejection; authenticated geography access; absence of barangays, pins, identities, and provider fields; correct independent-city and Manila district parents; active ancestry only; and one consistent release. Add a fixture where an ancestor is inactive and confirm its descendants are omitted.
- [ ] Verify the new database test fails because the RPC is absent in a disposable local database. Confirm the CLI syntax with `pnpm dlx supabase@2.114.0 migration new --help`, then create migration `add_psgc_address_reference` through the CLI and use its returned filename.
- [ ] Implement a stable private reference function with the existing current-user guard, empty search path, explicit grants/revokes, and authenticated API wrapper. Read the catalogue in one statement/snapshot. Raise on missing active release or more than 3,000 nodes; never truncate. Do not alter existing data or table grants.
- [ ] Add route tests for both query modes, mixed-mode rejection (400), auth failure (401), reference failure (503), strict response validation, and `private, max-age=300` catalogue caching. Implement the loader and route branch after observing the new route assertions fail.
- [ ] Regenerate database types with `pnpm db:types`. Run the database test, `pnpm test src/app/api/locations/psgc/route.test.ts`, and `pnpm typecheck`. Add the new SQL test to `supabase/tests/database/003_approval_concurrency.sh` alongside `019_psgc_location_origins.sql`, following its existing actor/session invocation. The harness and CI use explicit lists rather than discovering all SQL files. Commit this deliverable.

## Task 3: Resolve reverse-geocoded areas against current PSGC data

**Interfaces:** Add `GeoapifyAdapter.reverseGeocodeAddressAreas(position: Coordinate): Promise<AdministrativeHints>`. Define `AdministrativeHints` as `{countryCode: string, city?: string, municipality?: string, state?: string, county?: string, suburb?: string, village?: string, district?: string, label?: string, distanceMeters?: number}`. `matchAddressAreas({hints, accuracyMeters, reference, listChildren, resolveArea}): Promise<AddressLocationResult>` lives in `address-matcher.ts`; callbacks use existing validated choice/resolution shapes and require the catalogue release. They are provided by `address-reference.ts` using the actor's client. Export typed callback contracts from that module; no service-role client is needed.

- [ ] Add provider tests for structured hints without a formatted label, missing fields, malformed fields, country rejection, and bounded output with provider-only properties stripped. Assert the existing reverse-label method's output remains unchanged. Use the same EU MCP POST transport, country filter, limit 1, and existing timeout/budget rules.
- [ ] Add matcher fixtures with behavioral assertions: Cebu City/Lahug returns its canonical path; duplicate locality names require ancestor context; duplicate barangays remain local; Manila resolves through its district; missing district searches at most 14 districts with at most four active reads; missing barangay returns a partial city path; a unique province without usable city hints returns its ancestor path; contradictory recognized province/region yields no invalid candidate; and coarse accuracy or result distance returns no barangay.
- [ ] Test normalization collisions, numbered barangays, municipality names containing meaningful qualifiers, provider city/suburb disagreement, and state/county fields that cannot be recognized. Require a single consistent match or the common canonical prefix; assert no first-result/fuzzy/nearest-centroid selection occurs.
- [ ] Run `pnpm test src/features/locations/address-matcher.test.ts src/features/meetups/provider.test.ts` to see the relevant failures. Implement the pure matcher and adapter. Verify every child payload has the same release; resolve and compare the final canonical path. Release drift returns reference-unavailable with no suggestion applied; the renter can retry.
- [ ] Extend the endpoint with mode `address` and the request/result types in the spec. Authenticate and validate before budget/provider work; fetch the reference before consuming the provider call when possible. Map auth-service failure to a recoverable unavailable response. Add tests for complete/partial/unmatched outcomes, every HTTP error in the spec, no-store caching, and no leaked provider fields or coordinates in URLs.
- [ ] Run `pnpm test src/features/locations/address-matcher.test.ts src/features/meetups/provider.test.ts src/app/api/kyc/residential-geocode/route.test.ts` and `pnpm typecheck`. Sample public places through the Development integration with existing credentials during implementation; record only expected/observed area names and outcomes, not credentials or residential coordinates. Commit after passing checks.

## Task 4: Render the new cascade and restore addresses reliably

**Interfaces:** Add `presentation?: 'official' | 'shopping'` to `PsgcAreaSelector` (default official), and `externalSelection?: {requestId: number; release: string; path: AddressPath}` for atomic location updates. Keep the existing selection callback compatible and add `onManualSelectionChange?: () => void` to invalidate in-flight GPS work. `address-selection.ts` owns `AddressSelectionState = {groupId, canonicalPath, release}` and a reducer for parent selection, external result, restoration, and release changes. Its state never treats a friendly province as an actual ancestor of an independent city.

- [ ] Add interaction tests expecting exactly the five shopping choices, province lists aggregated across their official regions, a full Cebu path, NCR/Pateros, Manila District, and independent cities. Assert submitted code/release are empty until a current barangay is selected.
- [ ] Add restoration tests for saved canonical addresses, partial version-2 drafts, old path arrays, the prior friendly Cebu path, malformed storage, expired drafts, and retired codes. Recover the deepest valid canonical node via actual reference relationships/choice membership, not positional array indices.
- [ ] Add tests for request failure/retry preserving other fields, a changed parent clearing descendants, a changed release invalidating cached choices, an external selection applied atomically, and an unknown official region switching to the usable official presentation.
- [ ] Run `pnpm test src/features/locations` to confirm new assertions fail. Implement the reducer and renderer using the catalogue for upper levels and existing lazy child reads for barangays. Cache by release and parent, retain request cancellation, and validate external paths against loaded reference choices before submitting them.
- [ ] Store `{version: 2, groupId, canonicalPath, release}` drafts. Keep the existing fieldset error/status associations and at least 44px controls. Reuse official-mode behavior for handoff/default-origin forms and run their existing interaction tests alongside location tests. Commit the passing change.

## Task 5: Add the location action and share an unconfirmed pin

**Interfaces:** `AddressLocationControl` receives `invalidationKey: number`, `disabled: boolean`, and `onResult(result: AddressLocationResult, pin: DraftPin): void`. It owns GPS and HTTP request identity and statuses. The KYC form increments `invalidationKey` on manual area/pin edits and save attempts. Add `suggestedPin?: {requestId: number; pin: DraftPin}` and `addressEditRevision: number` to `ResidentialPinPicker`; notify the form of manual pin edits. The picker tracks which address and draft-pin revisions were explicitly confirmed.

- [ ] Add `address-location-control.test.tsx`: no location request on mount; one on click; complete/partial/unmatched handling; denied, timeout, unsupported, unavailable, and non-Philippine cases; duplicate clicks; late GPS callback and HTTP response after invalidation or unmount. Use controlled callbacks/promises, not timing-dependent sleeps.
- [ ] Add KYC interaction tests showing the shopping selector on checkout/account, autofill preserving house/street/postal fields, one result updating area and pin coherently, and partial results clearing stale descendants. Verify a manual edit or save attempt prevents a later result applying.
- [ ] Add pin tests proving a suggested location changes only the draft, preserves accuracy and original GPS coordinates, requires explicit confirmation, and blocks stale confirmed submissions after subsequent address/pin edits. Exercise confirmation → edit → reconfirm and restoration of both confirmed and unconfirmed drafts. Preserve the old saved pin if a new draft is discarded, while still requiring reconfirmation if the address changed.
- [ ] Run the new control tests and existing `checkout-flow.test.tsx` / `residential-pin-picker.test.tsx` before implementation. Implement the control and KYC coordinator. Use the exact status/helper copy and browser options in the spec. Keep the lower map location control as a pin-only adjustment; it must not silently overwrite the address selectors.
- [ ] Ensure applying a suggested pin does not issue a second automatic reverse lookup through the map's label logic. Validate outgoing hidden pin fields and form submit handling against the current confirmation revisions; expose an actionable error when reconfirmation is required. Update `src/app/privacy/government-id/page.tsx` narrowly to describe address autofill and unconfirmed pin staging accurately.
- [ ] Run `pnpm test src/features/kyc src/features/locations src/app/api/kyc/residential-geocode/route.test.ts` and `pnpm typecheck`. Commit this deliverable when checks pass.

## Task 6: Verify the complete flow and prepare the release

**Files:** `docs/operations/residential-addresses.md`, `docs/operations/psgc-reference-refresh.md`, `docs/architecture/psgc-location-boundary.md`, `supabase/tests/hosted/manifest.json`, and a new rollback-only hosted reference test if needed by the existing release harness. Update existing test-policy assertions when extending their allowlist.

- [ ] Add the five-group coverage check to the PSGC refresh procedure, including future unknown-region fallback. Document partial matching, the accuracy threshold, request budgets, failure recovery, and the reference RPC. Record actual provider sample outcomes and any browser verification gaps.
- [ ] Add a hosted-safe reference smoke test limited to reference structure, grants, active release, and representative canonical paths. Register it in the hosted manifest for Development and Production. Follow the existing BEGIN/ROLLBACK and synthetic-fixture policy; never use production renters or real home pins.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm launch:verify`, `pnpm build`, and `pnpm psgc:validate`. Run the new SQL test and existing PSGC/structured-address/pin SQL regressions in the disposable database harness. Run hosted-manifest validation. Resolve failures before proposing a release; do not reset a shared/hosted database.
- [ ] Verify desktop and mobile-width form rendering through the specified Chrome extension/profile: five choices, full/manual/partial selection, error/retry, saved-address edit, tab restoration, and pin reconfirmation. Use deterministic synthetic/public-location responses for geolocation tests if supported; report when only component coverage is possible. Do not read the operator's real GPS position for testing.
- [ ] Review the final diff for preservation of official addresses, accidental new flags, unnecessary dependencies, duplicate provider calls, release drift, and unintended edits outside this task. Recommend native sequential implementation/review because the matcher and cascade share interfaces; do not dispatch subagents without authorization.
- [ ] When release is authorized, merge the verified revision through the repository workflow, verify the exact admitted SHA, pass Development and protected Production gates, inspect the unaliased candidate, promote, and verify the live checkout/account behavior. A failed candidate stays unpromoted. Keep the additive read RPC if rolling the application back.

## Completion criteria

The normal Region dropdown contains the five requested choices; a permitted location action fills every uniquely matched official area; uncertain results remain easy to finish manually; existing saved addresses/drafts still work; no pin is silently confirmed; and the published revision is verified live when shipping is in scope.

This plan is ready for review. Implementation and release have not been performed by this planning task.
