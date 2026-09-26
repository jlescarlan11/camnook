# Rentals and Profile Separation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task; superpowers:subagent-driven-development is an alternative if the user chooses delegation. Implementation was authorized on 2026-09-26. Production release remains separate.

Implementation status: Tasks 1–3 are complete. Task 4's automated checks and environment-dependent limits are recorded in `docs/operations/rentals-profile-separation.md`. Live Development, browser, and Production checks remain outstanding.

**Goal:** Give rental management and profile editing separate, discoverable pages while preserving booking and checkout flows.

**Architecture:** Retain `/account` for rentals and add `/account/profile`. Separate their server data loaders, share account presentation through a component, and reuse the existing renter-details form and save action. No database migration or new package is expected.

**Tech Stack:** Installed Next.js 16.3 App Router, React 19.2, TypeScript, Tailwind, Supabase authenticated server client, Zod, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-26-rentals-profile-separation-design.md`

## Global constraints

- Keep current booking URLs, login default, rental ordering, and checkout return parameters.
- Reuse validation, ownership enforcement, KYC save RPC, address revisions, and pin reconfirmation.
- Use authenticated clients and explicit own-user filtering. Do not add service credentials or cross-user caching.
- Keep profile/KYC data off rentals and global client state. Distinguish missing profile from failed loading.
- Read applicable installed Next docs before product-code changes; use the existing authenticated page pattern.
- Production uses the verified exact-revision release workflow and immediate visibility with no feature flag.
- Preserve unrelated work, including the pre-existing untracked residential-location-autofill plan.

## Review focus

1. A failed KYC service must not hide bookings (Task 1).
2. An admin viewing Profile must load their own profile, never an arbitrary row (Task 1).
3. A missing profile permits setup; a failed profile/KYC read must not display a blank editing form (Tasks 1–2).
4. Old profile links and checkout returns must reach usable destinations without loosening redirect validation (Task 3).
5. Saved data must refresh Profile and survive checkout continuation, including form recovery (Tasks 3–4).

## Task 1: Separate server data loading

**Files:**
- Create `src/features/account/profile.ts` and `src/features/account/data/profile.ts`.
- Modify `src/features/bookings/data/account.ts` and its existing `.test.ts`.
- Create `src/features/account/data/profile.test.ts`.

**Interfaces:**
- `RenterContactProfile = { accountStatus: "active" | "suspended"; legalName: string; phone: string }`.
- Export `safeProfileSchema` (the existing strict snake-case schema) and `projectProfile(row: z.infer<typeof safeProfileSchema>): RenterContactProfile` from the pure profile module.
- Keep `loadAccountOverview(context)` and all its existing fields except `kycProfile`; keep booking-detail exports stable.
- Export `loadProfilePage(context: Awaited<ReturnType<typeof requireUser>>): Promise<ProfilePageResult>` from the server-only loader.
- `ProfilePageResult` is `{ status: "error"; isAdmin: boolean } | { status: "success"; isAdmin: boolean; profile: RenterContactProfile | null; kycProfile: KycProfile | null }`.

- [x] Add meaningful loader regressions. In the rentals fixture, configure KYC calls to throw and assert successful bookings, `rpc` called exactly once with `get_my_account_overview`, and no `kycProfile` in the result. Keep unexpected-field and missing-required-meetup rejection tests.
- [x] Add profile-loader cases for present and absent own profile, malformed data, required query errors/rejections, and optional admin errors/rejections. Assert the exact selected columns, `.eq("user_id", context.user.id)`, `.maybeSingle()`, KYC RPC, and absence of `get_my_account_overview`. Use a fixture whose admin result is true to pin explicit own-user filtering.
- [x] Run `pnpm test src/features/bookings/data/account.test.ts src/features/account/data/profile.test.ts`; expect the new behavior assertions to fail before changes.
- [x] Extract the schema/projection and remove the KYC read from `loadAccountOverview`. Implement the profile loader with concurrent required reads and the existing `is_admin` RPC. Use settled results so a rejected admin lookup becomes `isAdmin: false`; required failures return the error variant. Parse an admin result strictly as boolean and never promote truthy malformed values to authorization.
- [x] Run the same focused tests; expect passing tests and exit code 0. The current rentals page still uses `kycProfile` until Task 2, so run integrated type checking there and keep these changes together for a coherent commit.

## Task 2: Build the two page destinations

**Files:**
- Create `src/features/account/components/account-page-shell.tsx`.
- Modify `src/features/bookings/components/site-header.tsx`, `src/app/account/page.tsx`, and `src/app/account/bookings/[bookingId]/page.tsx`.
- Create `src/app/account/profile/page.tsx`, `src/app/account/page.test.tsx`, and `src/app/account/profile/page.test.tsx`.

**Interfaces:**
- `SiteHeader({ activeSection, activeSectionCurrent = "page" }?: { activeSection?: "cameras" | "rentals" | "profile"; activeSectionCurrent?: "page" | "location" })`; zero-prop existing callers remain valid.
- `AccountPageShell({ title, activeSection, isAdmin, children }: { title: string; activeSection: "rentals" | "profile"; isAdmin: boolean; children: React.ReactNode })` renders one site header, one main, the title, and account actions.
- New Profile page accepts `searchParams: Promise<{ saved?: string | string[] }>` for success feedback and uses Task 1's loader.

- [x] Add route-level behavior tests using existing repository mocking patterns: rentals renders booking links and no KYC form; empty rentals differs from a loader error; Profile calls `requirePageUser("/account/profile")`; Profile success mounts one KYC form with saved defaults; null data permits setup; required-read error renders no form; shell navigation/sign-out remain available in errors. Assert Owner area only when `isAdmin` is true.
- [x] Implement the three global navigation links with current-page semantics and wrapping at mobile widths. Use the `activeSectionCurrent` prop for `aria-current="page"` on exact overview destinations and `aria-current="location"` on the rentals section link from a booking detail. Do not set `aria-current` on inactive links.
- [x] Implement the account shell and convert rentals to a full-width list. Preserve existing booking presentation and links. Use rental-specific failure copy. Include the small legacy `default-address` footer anchor linking to `/account/profile#renter-details`.
- [x] Implement Profile with metadata `Profile | CamNook`, `force-dynamic`, authentication, and its loader. Render a compact email/account-status summary and the existing KYC form in a `max-w-4xl` content area. Set the form return URL to `/account/profile?saved=1#renter-details`. Omit the duplicate `AccountProfile` contact editor. Show the saved message only for scalar `saved === "1"` and a successful load.
- [x] Set the booking-detail site's active section without changing its layout, loader, actions, or URL. Do not create `src/app/account/layout.tsx`.
- [x] Run `pnpm test src/features/bookings/data/account.test.ts src/features/account/data/profile.test.ts src/app/account/page.test.tsx src/app/account/profile/page.test.tsx` and `pnpm typecheck`; expect exit code 0. Commit the coherent loader/page change once Task 3's return handling is ready, or keep it uncommitted until then; do not publish an intermediate broken save flow.

## Task 3: Connect profile saves and recovery links

**Files:**
- Modify `src/features/kyc/actions.ts`, `src/features/kyc/actions.test.ts`, and `src/features/kyc/kyc-profile-form.tsx`.
- Modify `src/features/bookings/actions/profile.ts`, `src/features/bookings/actions/booking-actions.test.ts`, and `src/features/bookings/components/request-form.tsx`.
- Extend `src/lib/auth/routes.test.ts` and the appropriate existing request-form interaction test.

**Interfaces:** Existing action and form signatures stay stable. Task 2 supplies the exact profile return URL. `safeReturnTo` remains private to the KYC action.

- [x] Extend the KYC action's return cases: exact new success URL is preserved; legacy `/account#default-address` maps to it; `/account/profile` remains a valid ordinary return; checkout's complete query string stays intact; protocol-relative, external, malformed, and near-match paths retain rejection behavior. Add assertions for all three revalidated paths after a successful save.
- [x] Update `safeReturnTo` only for the two exact special values and preserve `sanitizeReturnTo` for everything else. Add `/account/profile` invalidation to both save actions. Do not broaden global fragment handling.
- [x] Change only non-checkout submit labels to the spec's renter-details copy. Keep checkout's steps, labels, validation, draft keys, and recovery behavior.
- [x] Point the request form's KYC-recovery link to `/account/profile#renter-details`, labeled “Review your renter details”. Retain all schedule and booking recovery links. Assert the new href in the existing KYC-required interaction scenario.
- [x] Add auth-route assertions that `/account/profile` is protected, accepted as a login return, and survives login-path encoding, while `/accounts` stays invalid.
- [x] Run `pnpm test src/features/kyc/actions.test.ts src/features/kyc/kyc-profile-form.test.tsx src/features/kyc/checkout-flow.test.tsx src/features/kyc/kyc-save-recovery.test.tsx src/features/bookings/actions/booking-actions.test.ts src/features/bookings/components/request-form.interaction.test.tsx src/features/bookings/components/request-form-interaction.test.tsx src/lib/auth/routes.test.ts`; expect all to pass. Adjust the focused command to include whichever existing request-form suite was extended.
- [x] Search production source for `/account#default-address`: only intentional legacy compatibility may remain. Review the integrated diff and commit scoped product changes with a message such as `feat: separate rentals and profile pages`.

## Task 4: Validate the integrated flow and prepare release

**Files:** Update `docs/architecture/database-and-authorization.md` to record the separated page reads. Create `docs/operations/rentals-profile-separation.md` for concise validation and release evidence.

- [ ] Run `pnpm dev:check` and use the repository's Development session flow with synthetic renter details. Confirm the actual Development safe-column own-profile read is allowed. If deployment grants disagree with the checked-in contract, diagnose that mismatch before introducing any schema change.
- [ ] Inspect the UI at 375px and desktop widths: three usable navigation links, clear current page, full-width rental list, one main landmark, readable long email/name, single-column mobile fields, and usable address/map controls. Navigate by keyboard through both pages.
- [ ] Exercise direct signed-out Profile entry and login return; empty and populated rentals; missing profile setup; existing profile edit/save/reload; old anchor link; booking detail/back navigation; checkout's details/address/review flow. Use synthetic data and retain existing address-revision/pin reconfirmation checks. Record any live scenario that could not be exercised explicitly.
- [ ] Run `pnpm verify:push` once on the final candidate. This includes lint, generated route types/TypeScript, tests, launch evidence, and build. Investigate failures; do not treat a blocked environment check as a pass or bypass the release gate.
- [ ] Review the final change against the spec and update validation notes with actual commands/results. Do not claim performance measurements or live behavior from mocked tests. Commit only scoped files.
- [ ] When release is authorized, integrate through the repository's normal process and `.github/workflows/release.yml`. Record the exact merged SHA, successful CI, Development verification, staged candidate checks, and production promotion. Do not use a separate manual Vercel deployment.
- [ ] Verify the promoted SHA and live routes: rentals has no embedded profile form, Profile is visible and loads, booking links work, and save/reload works using the authorized synthetic account. Record evidence without personal data. If recovery is required, release a reviewed compatible revert through the same workflow; no schema rollback is expected.

## Execution recommendation

Implement sequentially in the current task after the user accepts the architecture and plan. These four tasks share loader, page, and save interfaces, so one implementer can keep the change coherent. Automated and browser checks cover the failure boundaries; a final review should focus on own-user reads, return URL compatibility, and checkout regression. Planning itself requires no product test run or deployment.
