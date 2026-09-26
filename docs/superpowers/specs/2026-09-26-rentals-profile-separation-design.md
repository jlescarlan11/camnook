# Separate rentals and profile

Date: 2026-09-26

Status: Approved for implementation on 2026-09-26. Implemented on `codex/rentals-profile`; validation and remaining live checks are recorded in `docs/operations/rentals-profile-separation.md`.

## Intent and success criteria

The user wants rentals and profile to have separate pages. Someone checking a booking should see its status and next action without a long personal-information form beside it. Someone updating renter details should have a dedicated, comfortably sized page. Checkout must still collect required information at the point it is needed.

Assumptions: retain the current visual language, rental ordering, booking actions, and account rules. This change reorganizes an existing flow; filters, booking lifecycle changes, email editing, and a new account dashboard are outside its scope.

Success means both destinations are easy to find, saved details appear after navigation and reload, existing booking URLs work, and a profile-service failure cannot prevent viewing rentals.

## Options considered

| Approach | Benefit | Cost |
| --- | --- | --- |
| **Keep `/account` for rentals; add `/account/profile` — recommended** | Clear separation with stable login destinations and booking links | Add a page and separate its data loader |
| Move rentals to `/rentals`; use `/account` for profile | More literal top-level paths | Retarget auth defaults, back links, recovery links, and redirects without additional user value |
| Keep one page with client-side tabs | Smaller visible layout change | Still couples loading and errors unless separately refactored; adds state to a simple navigation problem |

## Routes and navigation

| Route | Responsibility |
| --- | --- |
| `/` | Camera catalog |
| `/account` | Your rentals: existing booking list, statuses, dates, meetup information, and booking links |
| `/account/profile` | Profile: account summary and renter-details editor |
| `/account/bookings/[bookingId]` | Existing booking detail, agreements, payments, pickup, and resolution |
| `/checkout?...` | Existing checkout, including required details and address steps |

`SiteHeader` displays Cameras, Your rentals, and Profile. Profile links directly to `/account/profile`; signed-out visitors follow the existing login flow and return to that destination. Use ordinary Next links, visible focus styles, and a current-section indicator. On narrow screens the header may wrap without horizontal overflow. No additional menu interaction is necessary for three links.

The two account overview pages share a server-rendered `AccountPageShell` with the site header, page title, Owner area when authorized, Sign out, and content container. Pass the active section explicitly. Do not add an account route layout that would also wrap every booking-detail page; those pages already render their own site header and main landmark. Mark Your rentals active on booking details with a small explicit header-prop change.

## Page composition

**Your rentals:** use the existing full-width page container with one booking-list column. Keep Find a camera, empty-state messaging, status explanations, and Open booking. Change failure copy to describe unavailable rentals. A failed request must never look like an empty booking history. Do not load KYC merely to display a completion banner; checkout already enforces required details.

**Profile:** use a readable content width of approximately 56rem. Show the signed-in email and account status in a compact summary, then the existing `KycProfileForm` under “Renter details” with `id="renter-details"`. Personal fields use two columns where space permits and one on mobile; the address and map use the content width. Name and phone appear once, as editable fields in this form. Do not mount the old `AccountProfile` fallback contact form alongside it.

The existing KYC save RPC calls `private.ensure_profile`, so a user with no profile can complete the single renter-details form. A successfully loaded null profile is a setup state; a failed profile query is an error state and must not render an apparently blank editable form.

Use non-checkout button copy “Save renter details”, “Update renter details”, and “Saving details…”. After a successful profile save, return to `/account/profile?saved=1#renter-details` and show “Your renter details were saved.” as a status message when the profile loader succeeds. Checkout keeps its own step and button copy.

## Data boundaries

The current `loadAccountOverview` in `src/features/bookings/data/account.ts` calls both `get_my_account_overview` and `get_my_kyc_profile_v2`; either failure hides everything. Separate these responsibilities without changing database schema or RPC contracts:

| Consumer | Reads | Error boundary |
| --- | --- | --- |
| Rentals | Existing `api.get_my_account_overview` only | Rental error; no dependency on KYC |
| Profile | Own `public.profiles` safe columns and `api.get_my_kyc_profile_v2`, concurrently | Profile error if either required read fails |
| Profile Owner area | Existing `api.is_admin` | Hide owner link if role cannot be confirmed; required profile data can still render |
| Booking details and checkout | Their current loaders | Existing behavior |

Keep the bookings, cameras, and meetups in the existing overview snapshot RPC. It may still return its small profile projection; do not change that contract for this UI split. Remove the separate KYC request and `kycProfile` return field from the rentals loader.

The new profile loader uses the authenticated server client and an explicit `user_id = context.user.id` filter, selects exactly `account_status, legal_name, phone`, and uses `maybeSingle()`. The explicit filter matters because administrators can read other profiles under the existing RLS policy. Never accept a target user ID from a page query. The repo exposes `public` and `api`, grants authenticated profile reads, and defines an own-or-admin SELECT policy. Verify the deployed Development read contract before release; local migration evidence alone is not a live check.

Extract the existing strict safe-profile schema and projection into `src/features/account/profile.ts`, shared by the rentals and profile loaders. Preserve strict KYC validation, booking snapshot checks, and server-only boundaries. Full KYC/address data must not enter rental page props, headers, or shared client state. Use the existing request-scoped authentication pattern with no new cross-user cache.

## Saves, compatibility, and authentication

- Profile routes call `requirePageUser("/account/profile")`. Existing route sanitization already admits descendants of `/account`; keep the default login destination `/account`.
- The form posts to the existing `saveKycProfile` action with the exact profile success destination above. Add only that exact fragment-bearing destination to the action's special handling. General return URLs continue through `sanitizeReturnTo`.
- Translate legacy action return value `/account#default-address` to the new profile success destination. Preserve checkout query parameters and reject external or malformed return URLs as before.
- After either KYC or basic-profile save, revalidate `/account/profile` alongside existing `/account` and `/checkout` paths.
- Update the booking request's KYC-recovery link to `/account/profile#renter-details` with readable “Review your renter details” copy. Direct checkout edits continue using checkout's existing return URL.
- Preserve old bookmarked `/account#default-address` links with a small footer anchor on rentals: “Manage renter details in Profile”, linking to the new section. URL fragments do not reach the server, so this is a usable destination rather than a server redirect claim. New internal links target the new section.
- Preserve server validation, suspended-account restrictions, pin reconfirmation, address revisions, form error recovery, and session-expiry behavior.

## Verification and release

Focused automated coverage must prove: rentals never call KYC; profile reads are explicitly scoped and do not request booking history; required-read errors do not become blank forms; admin-lookup errors do not block the profile; save destinations and revalidation are correct; checkout parameters and existing error recovery survive.

Use a synthetic Development renter to inspect empty and populated rentals, initial profile setup, edit/save/reload, direct login to Profile, keyboard navigation, and 375px and desktop layouts. Check long names, email addresses, and the residential map. Verify old anchors provide a working Profile link and booking details retain a single header/main landmark.

Run repository checks before integrating. Production release uses `.github/workflows/release.yml`, successful CI on the exact main revision, Development verification, protected staging/promotion, and live verification of that revision. This feature is immediately visible after promotion and has no new flag. Record release checks when execution is authorized; this planning task does not deploy anything.

## Evidence consulted

- `src/app/account/page.tsx`, `src/features/bookings/components/site-header.tsx`
- `src/features/bookings/data/account.ts`, `src/features/kyc/types.ts`
- `src/features/kyc/actions.ts`, `src/features/kyc/kyc-profile-form.tsx`
- `src/features/bookings/actions/profile.ts`, `src/features/bookings/components/request-form.tsx`
- `src/lib/auth/routes.ts`, `src/lib/auth/require-user.ts`
- `supabase/config.toml`, profile grants/RLS in existing migrations, and `20260909014213_add_structured_residential_addresses.sql`
- Installed Next 16.3 guides: `03-layouts-and-pages.md` and `revalidatePath.md`
- `.github/workflows/release.yml`, `docs/architecture/database-and-authorization.md`
