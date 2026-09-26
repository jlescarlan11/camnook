# Issues

## ENV-001 — Intermittent external DNS failure
- Evidence: first catalog browser render showed a loading error; direct public RPC request failed with `ENOTFOUND`. Subsequent DNS lookup and same RPC returned HTTP 200, and browser reload displayed catalog.
- Impact: guest cannot begin booking while network is unavailable.
- Status: environment recovered; investigating retry journey before proposing application changes.
- Acceptance: recovery control performs a fresh request and restores catalog when service recovers.
- Evidence: ignored `.vercel/app-audit/2026-09-25/01-catalog-error.png`.
- Commit: none.

## ENV-002 — Baseline build cannot download Google Fonts
- Reproduction: `pnpm build` at starting revision.
- Evidence: `/tmp/camnook-audit-baseline-build.log`; Geist and Geist Mono network download errors. Development uses fallback fonts.
- Impact: production build verification blocked in this environment.
- Status: recovered with network; unmodified build retry passed. First fix's full build also passed.
- Acceptance: unmodified required build succeeds, or verified maintainable font-loading fix preserves typography.
- Commit: none.

## AUD-001 — CAPTCHA failure requires losing form state on refresh
- Severity: P2. Sign-in and resend share the affected challenge component.
- Reproduction: enter sign-in from selected rental dates; Cloudflare challenge fails; only recovery message instructs full-page refresh, discarding the email draft.
- Cause: widget errors clear the token but expose no existing-widget reset control.
- Acceptance: error/expiry offers an accessible retry; resetting preserves email and checkout destination; stale tokens stay cleared and submission stays disabled until a fresh token arrives. Script-load failure retains refresh guidance because no widget exists to reset.
- Fix: shared reset handler and retry button for rendered widget failures/expiry; expired feedback visible.
- Verification: two regression tests failed before fix and passed after. Full suite 959 passed / two skipped; lint, typecheck, build passed. Independent review found no actionable issues. Real Cloudflare failure/retry exercised: iframe restarted, email and checkout URL preserved, submission disabled. Provider continues rejecting this automated browser; successful provider challenge and OTP delivery are not claimed. Tests simulate fresh-token and expiry callbacks.
- Visuals: `03-signin-challenge-error.png`, `04-signin-retry-mobile.png` (actual 500 CSS px), `05-signin-retry-390.png` (390×844 mobile emulation) under ignored evidence directory. Desktop Lighthouse snapshot 30 passed / zero failed, accessibility 100; this is not a conformance audit.
- Status: verified scoped fix, committed.
- Commit: `6c6d221`.

## AUD-002 — Temporary authentication failure discards checkout draft
- Severity: P1; confirmed browser loss, provider classification reproduced by tests.
- Browser reproduction: synthetic renter selected meetup, entered purpose/city and reviewed a Sept 26–28 request. Submission redirected to login then back to empty checkout while session remained valid; Your rentals subsequently loaded without sign-in and no new booking appeared.
- Cause: `getAuthenticatedUser` returns null for all Supabase errors, including returned `AuthRetryableFetchError`. Request action catches thrown failures but redirects on null; proxy recognizes still-valid claims and redirects back. Draft is lost.
- Acceptance: temporary auth transport/429/5xx errors fail closed without treating the session as absent; request form preserves details and operation identity for retry; no privileged booking operation occurs until user verification succeeds; genuine missing/invalid sessions remain rejected. Page loads must expose an actionable retry rather than a sign-in redirect loop.
- Fix: retryable/429/5xx authentication errors throw a sanitized failure instead of returning an absent user. Existing checkout action catches it. A root page error boundary provides Next 16.3's documented `retry` action without exposing provider messages.
- Verification: one-time local Development HTTP 503 reproduced the pre-fix login round-trip/draft loss. Post-fix exact fault kept the route, purpose, city, place identity, and operation identity. After AUD-003 below, retry successfully created one synthetic Development booking; reload and page-error retry retained the persisted booking. Real account session used; outage itself is injected, not a real provider integration success claim.
- Evidence: `07-checkout-auth-recovered.png`, `08-page-retry-390.png`; desktop retry and 390×844 keyboard Tab/Enter retry exercised. No Production fault injection.
- Automated: four auth error tests failed before fix; seven helper tests and existing action tests passed after. Independent review: 25 focused tests passed, no actionable issues. Full serial suite: 967 passed, two skipped. Earlier concurrent runs hit unrelated 5-second test timeouts; assertions and timeouts were not weakened. Lint, typecheck, and build passed. Logs: `/tmp/camnook-audit-auth-serial-suite.log`, `/tmp/camnook-audit-auth-final-lint.log`, `/tmp/camnook-audit-auth-typecheck.log`, `/tmp/camnook-audit-auth-build.log`.
- Status: verified scoped fix, committed.
- Commit: `6564117`.

## AUD-003 — Failed request resets hidden required meetup radio and blocks retry
- Severity: P1 for request recovery.
- Reproduction: submit from review, return a recoverable error, submit again. Browser reports `An invalid form control with name='meetupChoice' is not focusable.` Review still names the meetup while the hidden radio is unchecked.
- Cause: action completion performs a native form reset despite an application-level error result. The DOM radio resets to its initial unchecked state, diverging from controlled selection state.
- Fix: a native reset listener prevents reset while state owns the draft; listener removed on unmount. React `onReset` alone failed the regression and was replaced.
- Acceptance: selected meetup remains checked, native form validity holds, second submission reaches the action with the original operation/place identity. Stale meetup responses must still require a new explicit selection.
- Verification: new regression failed before fix and passes after; existing stale-place tests pass. Real browser injected auth failure then successful retry saved the synthetic booking. Reviewed together with AUD-002 because this defect blocked its end-to-end recovery.
- Status: verified scoped fix, committed.
- Commit: `6564117`.

## AUD-004 — Shared muted labels have insufficient contrast
- Severity: P2. Booking dates, status progress, review target, and meetup guidance are harder to read.
- Evidence: Lighthouse mobile snapshot of saved booking found 11 text contrast failures: #6f7d90 on white = 4.18:1, on #edf5ff = 3.81:1, below 4.5:1 for their 12–14px normal text.
- Cause: shared --color-stone-500 token. Source inspection shows text uses across renter and owner journeys, on light surfaces.
- Acceptance: affected normal text reaches at least 4.5:1 on actual surfaces; retain muted hierarchy and inspect booking, account, and profile at desktop/mobile.
- Fix: use existing --ink-muted (#58677d) for the shared stone-500 token. Contrast is 5.75:1 on white and 5.23:1 on booking blue.
- Verification: build passed; booking Lighthouse33 checks passed, zero failed on desktop/mobile; account desktop42 passed, mobile has a separate map-link styling finding but no text contrast failures. Privacy mobile27 passed. Screenshots09–12 inspected. No duplicate unit test for a CSS token.
- Status: scoped contrast fix verified; independent review found no actionable issues.
- Evidence: `/var/folders/mh/rxmkm5jd2s1d952s608rwwy40000gn/T/chrome-devtools-mcp-N5O1SQ/report.json`.
- Commit: `c90a9b7`.

## AUD-005 — Account content overflows mobile viewport
- Severity: P2. At 390px, booking text and Find a camera are clipped; account content reaches 417px.
- Evidence: screenshot12 and browser bounds: clientWidth390, scrollWidth417; primary grid children401px wide.
- Cause: implicit auto grid track retains the profile form minimum width and stretches the booking list. A browser-only minmax(0,1fr) experiment resolved overflow; explicit grid-cols-1 applies the same fix below the desktop breakpoint.
- Acceptance: profile and bookings fit 320/390px without clipping or horizontal scrolling; desktop layout preserved.
- Verification: actual changed page has clientWidth/scrollWidth320/320 and390/390; desktop1440 preserves821/411px tracks. Screenshots13–15 inspected; lint and build passed (`/tmp/camnook-audit-account-{lint,build}.log`).
- Status: verified; independent review found no actionable issues.
- Commit: `6867376`.

## AUD-006 — Map attribution link lacks a non-color distinction
- Severity: P2 accessibility. Account mobile Lighthouse reports Leaflet link blends into surrounding attribution text (2.55:1 color difference, no underline).
- Acceptance: attribution link remains readable and visibly distinguishable without color alone.
- Fix: scoped underline on attribution anchors within CamNook maps.
- Verification: loaded real map link computed underline; screenshot16 inspected; mobile Lighthouse42 passed, zero failed including link-in-text-block. Build passed (`/tmp/camnook-audit-map-link-build.log`); independent review found no actionable issues.
- Status: verified.
- Evidence: report `chrome-devtools-mcp-u3jeIj/report.json` and rendered map attribution.
- Commit: `32c4d7d`.

## AUD-007 — Checkout navigation erases rental plans
- Severity: P2. Enter purpose and shooting city, open Change dates, then Continue to checkout without changing dates: both fields are empty. Editing profile steps similarly unmounts the request form.
- Cause: request details and operation identity live only in component state, unlike existing KYC drafts.
- Acceptance: current-tab, account/camera-isolated drafts survive navigation/reload; same schedule retains retry identity, different schedules use distinct identities; restored meetup must match current version; changed saved profile supersedes stale defaults; review remains explicit; confirmed booking clears its draft.
- Design: reuse tab-storage expiry convention with validated records and separate schedule operation identities. Server returns its validated booking ID on success so client can clear storage and navigate with a visible success-link fallback. No backend booking rules changed.
- Verification: initial recovery tests failed before implementation. Review-driven tests caught exact-payload uncertainty, subsequent preflight failures, and partial storage writes;10 draft tests now pass. Final full serial suite977 passed, two skipped; lint and build passed (including type checking). Independent re-review found no remaining actionable issues. Earlier concurrent run hit resource-contention timeouts; checks were not weakened.
- Browser: purpose/city/meetup survive camera and profile navigation plus reload at390px. A real Development booking committed while an ignored local harness withheld its response. Changing to Sept29 and editing another draft, then returning to Sept28 restored the original operation and exact payload. Retry returned the original booking3f7bdcc3-357b-4b0b-a048-a194694411e2. Account count increased by exactly one (three total); completed main draft and operation cleared. Mobile checkout Lighthouse33 passed, zero failed. Screenshots18–19. Fault harness stopped afterward.
- Logs: `/tmp/camnook-audit-draft-final-{suite,lint}.log`, `/tmp/camnook-audit-draft-build.log`, `/tmp/camnook-audit-booking-fault-dev.log`.
- Status: verified scoped fix.
- Commit: `d98fe5d`.

## ENV-003 — KYC business conflicts trigger repeated database retries
- Evidence: real two-tab stale-profile submissions returned generic retry after the app's30s deadline. Direct supported synthetic-auth probe read the current profile in667ms, but stale save timed out after45s. Current stored house remains Audit13, not the stale draft. Logs `/tmp/camnook-audit-profile-conflict{,-extended}.log`.
- Expected: SQL migration raises40001 for revision mismatch and pin reconfirmation; application then explains conflict. Cause not established: do not claim the intended conflict journey passed.
- 2026-09-26 follow-up: reproduced with a real Audit 13 → Audit 13B address revision in one tab and an old Audit 13 submission in another. Save and one retry both reach the generic message after the app's 30-second deadline. Reload confirms Audit 13B was retained; restored Audit 13 through the normal form and verified another reload. Source inspection confirms the SDK does not retry POST; existing booking migrations normalize known SQLSTATE 40001 business errors, while this KYC API wrapper is a passthrough. Backend cause remains unproven. Current Chrome dashboard and Supabase connector cannot access the CamNook Development management project.
- Root cause confirmed after user restored dashboard access: live API wrapper was a SQL passthrough, PostgREST sessions identified version 14.5, and sampled logs repeatedly recorded `40001 kyc_address_revision_conflict` while dashboard reported 100% CPU and approximately 355k PostgreSQL errors/hour. Supabase documents infinite transaction retries for custom business errors using that SQLSTATE in PostgREST 14.
- Fix: API wrapper catches only the known revision-conflict and pin-reconfirmation messages and returns non-retryable `P0001`; unknown serialization failures still propagate. Application recognizes exact normalized messages and retains compatibility with legacy `40001`. Existing security-definer boundary, private access restrictions, and public execution grants remain unchanged.
- Verification: disposable PostgreSQL 17 applied all 79 migrations and passed real SQL tests covering both known conflicts, atomic rollback of profile/address/pin changes, private/anonymous execution restrictions, and propagation of an injected unrelated serialization error. Eight action cases cover exact errors, near-miss messages, and timeout fallback. Fresh full suite 907 passed / two skipped, lint/typecheck/build and diff review pass. Earlier interrupted-suite calendar timeouts passed in both focused and fresh full reruns.
- Development: exact migration `20260926025452` applied transactionally with migration history through the verified Development SQL editor. Readback confirms PL/pgSQL wrapper, exact messages, and anon=false/authenticated=true execution. Actual two-tab stale save returned actionable guidance in 732ms while retaining entered fields; reload proved the newer address survived. Restored original synthetic Audit 13 and verified reload. Post-fix activity query found zero matching KYC PostgREST sessions, so no backend termination or restart was needed. Production unchanged.
- Status: fixed and browser-verified; committed with this checkpoint (hash recorded in state at next cycle).
- Evidence: `/tmp/camnook-env003-*`, ignored `.vercel/app-audit/kyc-sql-{red,green}.log`, and `.vercel/app-audit/2026-09-26/kyc-conflict-after.txt`.


## AUD-008 — Temporary checkout reads force schedule reselection
- Severity: P2 recovery. A controlled one-time503 on the Development checkout-context read left only Browse cameras and instructed the renter to select dates again. Reloading the same URL immediately restored the valid checkout.
- Cause: the fail-closed page lacked a retry action, despite retaining all schedule parameters.
- Fix: native GET Retry checkout form preserves allowlisted schedule fields and valid profile-edit step; no price or external destination is forwarded. Updated guidance explains retry before choosing another schedule.
- Acceptance: retry obtains fresh server context with the same schedule/step; failed state exposes no submit action or stale estimate.
- Verification: regression failed for missing form, then15 targeted tests passed; lint and production build including TypeScript passed. Browser one-time503 → Retry checkout restored the same camera/dates/handoff/policy and address step at390px, without overflow. Screenshot20 inspected. Independent review found no actionable issues.
- Logs: `/tmp/camnook-audit-checkout-retry-{red,green,lint,build}.log`; fault simulation in ignored local harness, no hosted configuration changes.
- Status: verified.
- Commit: `389c135`.


## AUD-009 — Opening privacy guidance discards unfinished renter details
- Severity: P2 loss of work. Change account house field, open Privacy details, then browser Back: original saved value replaces unfinished edit.
- Fix: supporting privacy link opens a separate tab and visibly announces that behavior; current account/checkout form remains mounted. No new personal-data storage.
- Acceptance: privacy notice opens successfully while original form fields and pin state remain intact.
- Verification: browser opened privacy page5 while account page3 retained synthetic unfinished house and pin-reconfirmation state;390px screenshot21 inspected with no overflow. Four targeted tests, lint and build including TypeScript passed; independent review clear. Unsaved synthetic edit discarded via reload after verification; saved profile unchanged.
- Logs: `/tmp/camnook-audit-privacy-form-{red,green,lint,build}.log`.
- Status: verified; final stop-checkpoint commit (HEAD, “Keep renter forms open while reading privacy details”).
- Scope: supporting privacy navigation only; general navigation away from unsaved account edits is not claimed to persist.

## AUD-010 — Photo lightbox triggers are exposed as selection toggles
- Severity: P2 accessibility. On the live camera detail page, each thumbnail activation opens an enlarged-photo dialog, but the selected thumbnail was exposed as a checkbox-like pressed control.
- Reproduction: open a published camera with multiple photos and inspect thumbnail controls with the browser accessibility tree. The visible action is “Enlarge photo”; the selected thumbnail reports a pressed state.
- Cause: `aria-pressed` was used only to retain the blue selected-thumbnail outline. That state changes a button's announced control semantics even though pressing it opens a dialog and never toggles a selection off.
- Acceptance: every thumbnail is announced as an action that enlarges its labeled photo; the selected outline remains; opening a thumbnail and Escape dismissal still preserve the selected photo and return focus to the trigger.
- Fix: move the visual selected state to a `data-selected` attribute and remove the incompatible toggle ARIA state.
- Verification: regression failed before the fix (`expected 'true' to be null`), then the full suite passed with 851 passed / 2 skipped. Lint, typecheck, and production build passed. Live desktop and 390×844 browser checks showed ordinary buttons, correct lightbox photo, Escape dismissal, and focus restoration.
- Status: verified and committed.
- Commit: `66e04df`.

## AUD-011 — Retry after a temporary auth outage signs an active renter out
- Severity: P1 recovery. An active renter could reach a protected page's retry state after a temporary provider failure, then be redirected to sign-in on the retry even though the outage did not prove the session invalid.
- Reproduction: while a synthetic Development renter session was active, a provider DNS failure produced the page-level retry state on `/account`. Selecting Retry then reached `/login?next=%2Faccount`. Server evidence showed `getClaims()` failed with provider DNS resolution, while the proxy treated the failed result exactly like an absent session.
- Cause: `updateSupabaseSession` calculated `isAuthenticated` as false for every claims error and redirected every protected request. The page-level `getAuthenticatedUser` helper already classifies retryable, 429, and 5xx failures separately.
- Acceptance: retryable claims failures preserve the protected route so its server-side guard can re-verify or expose a retry state; actual absent/invalid claims continue to redirect; no data/action authorization is granted from unverified proxy claims.
- Fix: classify retryable, 429, and 5xx `getClaims()` errors before the proxy redirect decision. On those errors, continue to the route's existing server-side authorization guard; invalid or missing claims retain the login redirect.
- Verification: four regression cases failed before the fix with a 307 redirect and pass afterward in the focused proxy suite (11 tests). Lint, typecheck, and optimized production build passed. Once unrelated host CPU saturation dropped, the unchanged full suite also passed (856 passed / 2 skipped). The post-fix browser path remains unverified because a fresh authenticated session requires a successful provider CAPTCHA/OTP challenge.
- Status: scoped checkpoint committed; broad suite now verified, browser reauthentication remains pending.
- Commit: `db52c81`.

## AUD-012 — Primary camera photo is not requested eagerly
- Severity: P2 performance. The above-the-fold camera photo was identified as LCP in the live Development page, but rendered with browser-default loading and fetch priority despite being marked as priority by the gallery.
- Reproduction: open a published camera detail page and inspect its primary 676px gallery image. It had `loading="auto"`, normal fetch priority, no image preload link, and the Next.js development warning that the image was LCP but should be eager.
- Cause: the client gallery passed `preload` to `next/image`, which did not make the primary image eager in the rendered page.
- Acceptance: the initially visible full-size photo renders eagerly; thumbnails remain lazy; gallery selection and lightbox behavior are unchanged.
- Fix: use `loading="eager"` for the gallery's prioritized primary image and `loading="lazy"` for all other gallery images.
- Verification: the regression first failed because the main image had no loading value, then passed in the focused gallery suite (4 tests). Lint, typecheck, optimized production build, and the full suite passed (856 passed / 2 skipped). A post-fix browser render could not complete while the Development camera provider was temporarily unreachable; it showed the established camera-details retry state instead.
- Status: verified and committed; live-page confirmation awaits provider recovery.
- Commit: `318553a`.

## AUD-013 — Recovered request-form errors do not identify their controls
- Severity: P2 accessibility. When server validation returned a renter to the Details step, its error alert was announced but the affected control had neither an invalid state nor a programmatic reference to the explanation.
- Reproduction: submit reviewed rental details with a server-returned `legalName` validation error. The Details heading regains focus and the alert appears, but the Name textbox had no `aria-invalid` or `aria-describedby` value.
- Cause: `Field` rendered error text as a live alert only; the form controls and meetup fieldset did not expose the corresponding ARIA error relationship.
- Acceptance: each server-returned request error identifies the affected control or choice group as invalid and associates it with the rendered error text; the existing focus return and preserved values remain intact.
- Fix: add stable error IDs and conditionally connect Name, phone, meetup place, purpose, and shooting city to their errors with `aria-invalid` and `aria-describedby`.
- Verification: the interaction regression failed before the fix (`expected null to be 'true'`), then the two focused request-form suites passed (5 tests). Lint, typecheck, optimized production build, and the full suite passed (856 passed / 2 skipped).
- Status: verified and committed.
- Commit: `db80193`.

## AUD-014 — Recovered KYC field errors do not identify their controls
- Severity: P2 accessibility. Checkout KYC returned a renter to the appropriate step after server validation, but standard personal and address controls did not expose an invalid state or reference their inline messages.
- Reproduction: complete the checkout KYC steps and return a server `phone` validation error. The Mobile number field and visible error render on Details, but the input had no `aria-invalid` or reference to the message.
- Cause: the KYC `Field` wrapper rendered a live alert without passing an invalid state or error relationship to its child control.
- Acceptance: server-returned standard KYC field errors identify the relevant control as invalid and associate it with the error text, while preserving the phone component's existing country-code description and the checkout step recovery.
- Fix: give each standard KYC field a stable error ID and clone its child with conditional `aria-invalid` and a composed `aria-describedby` value.
- Verification: the checkout regression failed before the fix (`expected null to be 'true'`), then the checkout and KYC markup suites passed (5 tests). Lint, typecheck, optimized production build, and the full suite passed (856 passed / 2 skipped).
- Scope: PSGC area selection and residential-pin controls remain separate specialized-control audit surfaces; this checkpoint does not claim their errors are associated.
- Status: verified and committed.
- Commit: `00a30a8`.

## AUD-015 — Invalid Philippine address selection is not identified as a group error
- Severity: P2 accessibility. A KYC response that rejected the canonical Philippine area code rendered an alert beneath the selector, but attached that description to a non-semantic wrapper instead of the address-selection group.
- Reproduction: complete checkout KYC and return a server `psgcAreaCode` validation error. The address selector group rendered without `aria-invalid` or an error description relationship.
- Cause: the KYC page set `aria-describedby` on an ordinary `div`; the actual `PsgcAreaSelector` fieldset retained only its loading/status description.
- Acceptance: the Philippine address group preserves its loading/status description and also exposes the current server error plus invalid state when area validation fails.
- Fix: extend the selector with optional `errorId` and `invalid` props, compose the error ID with its existing status description, and pass those props from KYC.
- Verification: the new checkout regression failed before the fix (`expected null to be 'true'`), then passed in the focused checkout flow. Lint, typecheck, optimized production build, and the full suite passed (857 passed / 2 skipped).
- Status: verified and committed.
- Commit: `31636f6`.

## AUD-016 — Residential-pin errors are not associated with the map control
- Severity: P2 accessibility. Server validation and pin-reconfirmation messages appeared near the residential map pin, but the labelled composite control region did not identify either message.
- Reproduction: render the residential pin picker with a server validation error. Its `Residential map pin` region has no description relationship to the visible error.
- Cause: the component rendered alert paragraphs without IDs and the labelled region had no `aria-describedby` value.
- Acceptance: the pin region identifies the current server validation message or reconfirmation instruction; the map remains a composite control and does not receive an invalid-state attribute intended for form fields.
- Fix: give both messages stable IDs and compose the active IDs onto the labelled pin region.
- Verification: the focused regression failed before the fix because both IDs were absent, then the residential-pin and checkout suites passed (10 tests). Lint, typecheck, optimized production build, and the full suite passed (858 passed / 2 skipped).
- Status: verified and committed.
- Commit: `7d723b5`.

## AUD-017 — Payment-proof validation errors do not identify their fields
- Severity: P2 accessibility. A renter receiving server validation errors for a GCash reference or private proof heard alerts, but neither form control exposed an invalid state or referenced its own message.
- Reproduction: submit the renter payment form against a local mocked invalid response containing both `reference` and `proof` errors. The messages render while both inputs lack `aria-invalid` and error descriptions.
- Cause: the reference input and reusable proof field rendered standalone alerts; the proof input described only its static privacy guidance.
- Acceptance: invalid reference and proof inputs identify their respective server error; proof retains its original private-file guidance; no transfer, payment, or file upload is initiated by error rendering.
- Fix: add stable IDs, conditional invalid state, and composed descriptions for the reference and proof fields.
- Verification: the interaction regression failed before the fix (`expected null to be 'true'`), then the focused payment component/interaction suites passed (4 tests). Lint, typecheck, optimized production build, and the full suite passed (859 passed / 2 skipped). The test uses a mocked local action response only; no payment or upload occurred.
- Status: verified and committed.
- Commit: `1f08a27`.

## AUD-018 — Static security review checkpoint

- Scope: full repository source and migrations, with independent baseline and architecture passes. The review covered authentication and redirects, single-owner authorization, service-role boundaries, payment/KYC/condition-evidence privacy, upload intents and storage controls, Resend webhook integrity, cron/management routes, provider request boundaries, and lifecycle data integrity.
- Result: no reportable source-supported vulnerability found. In particular, the review found database-side ownership and state checks for elevated operations, signed/bounded webhook processing, short-lived user-bound upload intents, and no committed live credential.
- Limitation: this is not a deployed-environment attestation. Supabase migration state, role assignments, storage configuration, secret rotation, CAPTCHA/OTP throttling, and third-party dashboard restrictions were deliberately not accessed.
- Evidence: generated report at `/Users/johnlesterescarlan/.codex/state/plugins/codex-security/scans/CamNook/00cd0b34d8eeeac90e994288a88ca05a83039600_20260924T193552Z_xcfcn9i9/report.md`; canonical manifest, findings, coverage, and SARIF are stored beside it outside this repository.
- Status: complete static checkpoint; no product change required.

## AUD-019 — Rental date selections are announced as checkboxes

- Severity: P2 accessibility. Opening the public camera date picker exposed each calendar date as a checkbox. After choosing a pickup date, assistive technology still received a checkbox state rather than the date-selection action it performs.
- Reproduction: open the date picker on the public Canon EOS R50 detail page and inspect the browser accessibility tree. The selectable dates appeared as checkboxes because their buttons used `aria-pressed`; a selected date appeared as a checked checkbox.
- Cause: `aria-pressed` was used to represent a visual/current range-selection state on buttons. It changes their exposed semantics to a toggle control, although activating a date chooses a pickup or return endpoint and the label already announces that result.
- Acceptance: calendar dates remain ordinary buttons, including after a pickup or return is selected; the accessible label continues to identify `selected pickup` or `selected return`; visual selection and schedule behavior are unchanged.
- Fix: remove the incompatible toggle state while retaining the existing date-specific accessible label and visual classes.
- Verification: the new interaction regression failed before the fix (`expected 'true' to be null`) and then passed with the focused calendar suite (7 tests). Lint, typecheck, optimized production build, and the full suite passed (860 passed / 2 skipped). The hot-reloaded public browser picker reported buttons for all dates and `button Saturday, September 26, 2026, selected pickup` after selection. The picker was closed without continuing to checkout; no booking, payment, or account data changed.
- Status: verified and committed.
- Commit: `1f4f338`.

## AUD-020 — Owner payment-review errors do not identify their fields

- Severity: P2 accessibility. When owner-side server validation rejects a payment decision, the visible error alerts do not identify the amount, reference, actual-account confirmation, or rejection-reason control that needs correction.
- Reproduction: render `PaymentReviewControls` against a local mocked invalid `decidePayment` response. Verification errors appear beneath the three review controls, and a reject-reason error appears beneath the selector, while the affected controls expose neither `aria-invalid` nor a message reference.
- Cause: the owner review UI rendered standalone live alerts without stable IDs or conditional relationships from their corresponding native controls.
- Acceptance: an affected review control exposes `aria-invalid` and identifies its current server message; error semantics disappear when there is no field error; verification and rejection flows remain independent.
- Fix: add conditional invalid state and stable, field-specific `aria-describedby` IDs to observed amount, observed reference, actual-account confirmation, and rejection reason, and assign those IDs to the existing alerts.
- Verification: verification and rejection interaction tests each failed before their respective UI change (`expected null to be 'true'`) and pass afterward (2 focused tests). Lint, typecheck, optimized production build, and the full suite passed (862 passed / 2 skipped). The assertions use mocked local server responses only; no owner session, payment decision, transfer, proof access, or booking state changed.
- Status: verified and committed.
- Commit: `be0ec4e`.

## AUD-021 — GCash recipient-configuration errors do not identify their fields

- Severity: P2 accessibility. An owner receiving recipient-name or GCash-number validation errors hears the alerts but the affected control does not expose invalid state or identify the message.
- Reproduction: render `GcashConfigurationForm` against a local mocked invalid `configureGcashRecipient` response. Both validation messages render while Recipient name and GCash number lack `aria-invalid` and references to their alerts.
- Cause: the form rendered standalone alerts without stable IDs or conditional control-to-message relationships. The reusable Philippine mobile input already supports composing extra descriptions, but the form did not supply its error.
- Acceptance: recipient-name and GCash-number server errors identify their corresponding controls; the mobile input retains its country-code explanation alongside its error; no configuration change occurs during error rendering.
- Fix: assign stable IDs to the two alerts and add conditional invalid state and descriptions to their controls, composing the mobile error with its established country-code description.
- Verification: the interaction regression failed before the UI change (`expected null to be 'true'`) and then passed. Lint, typecheck, optimized production build, and the full suite passed (863 passed / 2 skipped). The test uses a mocked local action response; it does not save payment-recipient configuration or use an owner session.
- Status: verified and committed.
- Commit: `2cb9332`.

## AUD-022 — Pickup-checklist validation errors do not identify operational controls

- Severity: P1 accessibility and operational recovery. An owner correcting a failed physical pickup checklist sees server validation messages but cannot programmatically identify the exact date/time, identity confirmation, serial, accessory, condition-report, or note control that requires attention.
- Reproduction: render the confirmed `PickupControls` form with a local mocked invalid `completePickup` response covering every field-error key. The messages render without IDs, and each affected native field or checklist checkbox lacks invalid state and an error reference.
- Cause: the fail-closed server action returns field-specific errors, while the client UI displayed them as unassociated text and the reusable checklist control could not receive validation semantics.
- Acceptance: every control implicated by the existing field-error contract is invalid and identifies its active message; both original-ID confirmations share their applicable error; every required accessory identifies the common checklist error; the server action and operation idempotency behavior remain unchanged.
- Fix: add stable alert IDs and conditional ARIA relationships to direct fields and extend the local checklist control to accept an error description and invalid state. Attach shared original-ID and accessory errors to each related checkbox.
- Verification: the interaction regression failed before the UI change (`expected null to be 'true'`) and then passed. Lint, typecheck, optimized production build, and the full suite passed (864 passed / 2 skipped). The test uses a mocked local response only; no owner session, physical-ID inspection, pickup completion, condition report, accessory confirmation, or photo access occurred.
- Status: verified and committed.
- Commit: `1bd173c`.

## AUD-023 — Condition-photo validation error does not identify the upload input

- Severity: P2 accessibility. An owner whose private condition photo is rejected receives an alert, but the required file input does not identify that field-specific message.
- Reproduction: render the active `PickupControls` branch with a mocked invalid `uploadConditionPhoto` response containing `fieldErrors.photo`. The form reports the returned message as a generic alert while the Condition photo input has no invalid state or message reference.
- Cause: the status paragraph combines success, field, and general errors, but only the file input is the target of a field error and it was not wired to a stable alert ID.
- Acceptance: a returned `photo` field error marks Condition photo invalid and identifies its message; successful and general upload result messaging remain unchanged.
- Fix: assign an ID only when the photo error exists, conditionally reference it from the file input, and retain the existing status/alert roles for result announcements.
- Verification: the new active-rental interaction regression failed before the UI change (`expected null to be 'true'`) and then passed. Lint, typecheck, optimized production build, and the full suite passed (865 passed / 2 skipped). It uses a mocked local action response; no file was selected, uploaded, stored, or authorized.
- Status: verified and committed.
- Commit: `c1ccd1b`.

## AUD-024 — Contract-template validation errors do not identify their controls

- Severity: P1 accessibility and operational recovery. A contract publisher whose version, required terms, or approval confirmation is rejected receives server messages that do not identify any corresponding control, despite publishing changing the active agreement for new rentals.
- Reproduction: render `ContractTemplateForm` with a mocked invalid `publishContractTemplate` response containing version, terms, and approval errors. The messages appear, but Template version, every required term textarea, and the approval checkbox lack invalid state and error references.
- Cause: each server error was a standalone alert without a stable ID or an ARIA relationship back to the native input(s) it corrects.
- Acceptance: version and approval errors identify their individual controls, while the terms error identifies every required term textarea; the existing required and immediate-publishing rules remain unchanged.
- Fix: add stable alert IDs and conditional invalid/description relationships. The common terms message is deliberately shared across all contract-term textareas.
- Verification: the interaction regression failed before the UI change (`expected null to be 'true'`) and then passed. Lint, typecheck, optimized production build, and the full suite passed (866 passed / 2 skipped). The test uses a mocked local action response; no template was published or made active.
- Status: verified and committed.
- Commit: `e5d6299`.

## AUD-025 — Handoff-policy recovery hides context and leaves weekday errors unassociated

- Severity: P2 accessibility. When availability validation rejects both handoff times and weekday selection, the time control loses its standing format guidance and none of the weekday checkboxes identifies the shared error.
- Reproduction: submit `HandoffPolicyForm` with a mocked invalid save response for `approvedTimes` and `weekdays`. The time textarea changes from describing its format help to describing only the error, while all seven weekday checkboxes have neither invalid state nor an error reference.
- Cause: the textarea chose one description ID or the other, and weekday errors were rendered beneath the group without reaching its individual native controls.
- Acceptance: Handoff times retains its `24-hour time` format guidance while adding a validation error; every weekday choice identifies the shared current error and becomes invalid only when that error is present.
- Fix: compose the time help and error IDs, and add conditional invalid/description semantics to each weekday checkbox.
- Verification: the recovery regression failed before the UI change because the time description was only `approved-times-error`, then passed. Lint, typecheck, optimized production build, and the full suite passed (867 passed / 2 skipped). The test uses a mocked local save action; no camera availability policy changed.
- Status: verified and committed.
- Commit: `9b63a93`.

## AUD-026 — Handoff-policy area error describes a non-semantic wrapper

- Severity: P2 accessibility. A rejected canonical pickup-area selection leaves the Philippine address fieldset appearing valid while its error is attached to an outer section.
- Reproduction: submit `HandoffPolicyForm` with a mocked `city` field error and inspect the selector group. The outer visual section references the alert, but the `Philippine address` fieldset has neither invalid state nor the error description.
- Cause: the form already had a selector API for an error ID and invalid state, but did not pass the `city` error to it.
- Acceptance: the semantic Philippine address group remains described by its status text and also identifies the active city error with invalid state; the outer section does not impersonate a form control.
- Fix: pass the existing stable `origin-error` ID and conditional invalid state to `PsgcAreaSelector`, removing the wrapper-only description.
- Verification: the mocked recovery test failed before the UI change (`expected null to be 'true'`) and then passed. Lint, typecheck, optimized production build, and the full suite passed (868 passed / 2 skipped). No area selection or availability policy was saved.
- Status: verified and committed.
- Commit: `700ff24`.

## AUD-027 — Invalid manual map coordinates do not identify their inputs

- Severity: P2 accessibility. A renter entering out-of-Philippines coordinates for a residential pin hears a generic status but Latitude and Longitude remain semantically valid and do not identify the correction.
- Reproduction: in keyboard pin placement, enter latitude `99` and submit with Enter. The live status says `Enter valid Philippine coordinates.`, while both coordinate inputs have no invalid state or relationship to that status. Editing a coordinate also leaves the old message visible.
- Cause: manual coordinate validation used a generic status string without preserving whether it specifically represented a coordinate-pair error.
- Acceptance: an invalid coordinate pair marks both native inputs invalid and associates them with the status message; changing either coordinate clears the stale invalid state and message; map, search, GPS, and valid-coordinate pin paths clear any prior coordinate error.
- Fix: track transient coordinate validation state, conditionally describe both inputs from the status message, and clear it on coordinate edit or a successful pin selection.
- Verification: the existing keyboard-placement regression failed before the change (`expected null to be 'true'`) and then passed, including stale-error clearance. Lint, typecheck, optimized production build, and the full suite passed (868 passed / 2 skipped). The test uses only local component state; no residential address, location permission, map request, or pin was persisted.
- Status: verified and committed.
- Commit: `14ba002`.

## AUD-028 — Return-recording validation errors are discarded

- Severity: P1 accessibility and operational recovery. The return action returns specific errors for return time, serial, every accessory status, condition report, and notes, but the owner form showed only a generic alert and discarded the actionable messages.
- Reproduction: render active `ResolutionControls` with a mocked invalid `recordReturn` response covering each existing field-error key. None of the messages renders or identifies its native control.
- Fix: render the existing messages with stable IDs; conditionally mark and describe each direct field and every accessory-status selector with the appropriate shared error.
- Verification: the interaction regression failed before the change because `Enter the actual return time.` was absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (869 passed / 2 skipped). No return, condition evidence, deduction, refund, or booking transition occurred.
- Status: verified and committed.
- Commit: `12b85df`.

## AUD-029 — Return-evidence upload error lacks an accessible file control

- Severity: P2 accessibility and operational recovery. An owner whose primary return-evidence photo is rejected receives only a generic alert and cannot programmatically identify the file control that needs correction.
- Reproduction: render `ResolutionControls` in return review with a mocked invalid `uploadConditionPhoto` response containing `fieldErrors.photo`. The primary return-evidence file input has no accessible name, no invalid state, and no reference to the returned validation message.
- Cause: the return-review evidence form discarded its field-specific action error in favor of a generic result and did not label or connect its file input to validation feedback.
- Acceptance: the primary file control is named Return condition photo; a returned photo error marks it invalid and identifies the exact message; generic and successful result announcements remain intact.
- Fix: add a native label, stable conditional error ID, and conditional invalid/description semantics; render the action's field-specific photo message before falling back to its established generic failure message.
- Verification: the new interaction regression failed before the change because Return condition photo could not be found by label, then passed. Lint, typecheck, optimized production build, and the full suite passed (870 passed / 2 skipped). The test uses a mocked local action response; no file was selected, uploaded, stored, accessed, or authorized.
- Status: verified and committed.
- Commit: `e8f7040`.

## AUD-030 — Versioned return-evidence replacement cannot identify its failed file

- Severity: P2 accessibility and operational recovery. A rejected replacement photo has no accessible file-field name, and its shared action result does not say which upload form supplied the invalid file.
- Reproduction: render `ResolutionControls` with a current return photo and a mocked invalid replacement response. The replacement input has no label; before the fix, a field error could only be generically assigned to the primary return-evidence input. A focused server-action reproduction also showed that validation discarded the submitted replacement photo ID.
- Cause: `ConditionPhotoActionState` exposed only the common `photo` field error, even though the shared client action serves both primary and replacement forms.
- Acceptance: each replacement file input has a unique visible label; photo validation preserves the validated superseded-photo ID; only the submitted replacement field becomes invalid and identifies the exact error, while the primary control remains valid.
- Fix: preserve `supersedesPhotoId` in photo-validation responses and use it to derive a stable replacement error ID. Add a labelled replacement input and conditionally associate the result only with the matching form.
- Verification: server-action and interaction regressions both failed before the fix (the response lacked the replacement ID; the control had no label), then passed (11 focused tests). Lint, typecheck, optimized production build, and the full suite passed (872 passed / 2 skipped). The local mock never selected, uploaded, stored, accessed, or authorized evidence; the public browser remains free of console errors, while owner browser verification needs a known Development owner session.
- Status: verified and committed.
- Commit: `69c5530`.

## AUD-031 — Hidden checkout schedule errors have no correction route

- Severity: P1 operational recovery. The booking action validates pickup, return, handoff time, policy version, and camera, but checkout hides these values in the final request form. On rejection, the renter remained on review with only a generic `Check your details and try again` alert and could repeat the same invalid submission.
- Reproduction: submit reviewed renter details against a mocked invalid `handoffTime` response. The final review screen remains active; the error message and return-to-picker link are absent.
- Cause: `RequestForm` reopened the editable details step only for renter-contact and meetup errors. It did not classify the action's schedule-field errors, although schedule controls live on the originating camera page.
- Acceptance: a schedule validation response returns focus to details, exposes its precise safe message and the canonical schedule-picker link, and disables review/submission until a refreshed schedule creates a new form identity.
- Fix: centralize schedule-field detection, use it when selecting the recovery step, render an alert with the existing `returnHref`, and disable the review control while that state is active.
- Verification: the new interaction regression failed before the change because `Choose another schedule` was absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (873 passed / 2 skipped). The action response is a local mock; no checkout, booking, payment, account, or schedule was submitted or changed. Public-browser inspection remains limited to the camera page because inducing a live stale-schedule response would require a booking submission.
- Status: verified and committed.
- Commit: `77d50a0`.

## AUD-032 — Hidden handoff-policy reference error is reported as a visible-field error

- Severity: P2 operational recovery. A policy save can reject the hidden camera ID or expected version with `Reload this camera before saving.`, but the UI replaces that instruction with `Correct the highlighted fields and try again.` even though no visible field is invalid.
- Reproduction: submit `HandoffPolicyForm` with a mocked `fieldErrors.camera` response. The only live alert is generic and the server's recovery instruction is absent.
- Cause: the common invalid-input result path treats every validation failure as a visible form-control error, despite `camera` representing hidden authoritative identity/version data.
- Acceptance: a hidden camera/reference rejection exposes its exact safe refresh instruction; ordinary visible-field validation keeps the existing generic prompt.
- Fix: prefer `fieldErrors.camera` in the invalid-input result message before falling back to the generic visible-field wording.
- Verification: the new focused recovery test failed before the change because `Reload this camera before saving.` was absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (874 passed / 2 skipped). The test uses a mocked local action response; no policy, camera, owner session, or renter availability changed. Owner browser verification remains unavailable without a known Development owner session.
- Status: verified and committed.
- Commit: `7628ade`.

## AUD-033 — Hidden replacement-contract reference error is reported as a visible-field error

- Severity: P2 operational recovery. Issuing a replacement agreement can reject its hidden booking ID with `Refresh this booking before issuing a replacement.`, but the UI replaces that instruction with `Correct the highlighted replacement details.` even though no visible control can correct the reference.
- Reproduction: submit `SupersedeContractControl` with a mocked `fieldErrors.bookingId` response. The only live alert is generic and the server's recovery instruction is absent.
- Cause: the common invalid-input result path treats every validation failure as a visible replacement-detail error, despite `bookingId` representing hidden authoritative identity data.
- Acceptance: a hidden booking-reference rejection exposes its exact safe refresh instruction; ordinary visible-field validation keeps the existing generic prompt.
- Fix: prefer `fieldErrors.bookingId` in the invalid-input result message before falling back to the generic visible-field wording.
- Verification: the new focused recovery test failed before the change because `Refresh this booking before issuing a replacement.` was absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (875 passed / 2 skipped). The action response is a local mock; no agreement, camera, schedule, owner session, or renter availability changed. Owner browser verification remains unavailable without a known Development owner session.
- Status: verified and committed.
- Commit: `1a1830f`.

## AUD-034 — Hidden booking-decision reference error is reported as a visible-field error

- Severity: P2 operational recovery. Approving or rejecting a booking can reject its hidden booking ID with `This booking reference is invalid.`, but the UI replaces that result with `Correct the highlighted field and try again.` even though no visible field represents the booking reference.
- Reproduction: pass `decisionControlPresentation` an error state with `fieldErrors.bookingId`. The resulting live alert is generic and the server's constrained result is absent.
- Cause: the presentation layer treats every error status as a visible rejection-reason correction, despite `bookingId` representing hidden authoritative identity data.
- Acceptance: a hidden booking-reference rejection exposes its exact safe result; ordinary visible-field validation keeps the existing generic prompt.
- Fix: prefer `fieldErrors.bookingId` in the error result message before falling back to the generic visible-field wording.
- Verification: the focused presenter regression failed before the change because `This booking reference is invalid.` was absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (876 passed / 2 skipped). The state is a local mock; no booking decision, agreement, camera, schedule, owner session, or renter availability changed. Owner browser verification remains unavailable without a known Development owner session.
- Status: verified and committed.
- Commit: `75f8d2e`.

## AUD-035 — Hidden signing references are reported as consent errors

- Severity: P2 operational recovery. Signing can reject the hidden booking ID with `Refresh this booking before signing.` or the hidden contract version with `Refresh before signing this contract.`, but the UI replaces both instructions with a consent-focused result despite the checkbox not being responsible.
- Reproduction: submit `SignContractControl` against mocked invalid `bookingId` and `contractVersionId` action responses. The live alert says to review consent rather than showing either server-provided refresh instruction.
- Cause: the invalid-input result path assumes every validation response is consent-related and drops recovery text for the hidden authoritative references.
- Acceptance: each hidden reference error exposes its exact safe refresh instruction; consent validation retains the existing consent correction path.
- Fix: prefer `fieldErrors.bookingId`, then `fieldErrors.contractVersionId`, before the existing consent-focused fallback.
- Verification: focused interaction coverage failed before the change because the booking-refresh instruction was absent, then passed for both reference types. Lint, typecheck, optimized production build, and the full suite passed (878 passed / 2 skipped). The action responses are local mocks; no signature, agreement, booking, payment, owner session, or renter availability changed. Live signing was intentionally not exercised because it is a real state-changing action.
- Status: verified and committed.
- Commit: `abc7d36`.

## AUD-036 — Invalid hidden payment reference is reported as a transfer mismatch

- Severity: P1 operational recovery. Payment review rejected a malformed hidden payment ID as a generic `invalid` result, which the UI displayed as `The observed transfer did not match the authoritative amount or submitted reference.` Editing actual-account confirmation, amount, or reference cannot correct an invalid payment identity.
- Reproduction: submit `decidePayment` with a malformed `paymentId`, then render its invalid result in `PaymentReviewControls`. The action returns no field-specific recovery and the alert incorrectly describes a transfer mismatch.
- Cause: early identity validation shares the broad `invalid` category used for visible reconciliation mismatches, and the presentation function receives only that category rather than the returned field context.
- Acceptance: a malformed hidden payment ID is rejected before authorization with a safe refresh instruction, and that instruction takes precedence over a generic transfer-mismatch result.
- Fix: add `paymentId` to the typed action field errors, return `Refresh this payment before reviewing it.` from early ID validation, and pass the whole decision state to the result-message helper so that field error can be rendered.
- Verification: the new action and interaction regressions failed before the change because they received `invalid`/the transfer-mismatch copy, then passed. Lint, typecheck, optimized production build, and the full suite passed (880 passed / 2 skipped). All responses are local mocks; no payment, proof access, booking, agreement, owner session, or renter availability changed. Live review was intentionally not exercised because payment decisions are real state-changing actions.
- Status: verified and committed.
- Commit: `93cf57b`.

## AUD-037 — Cancellation-reason validation is reported as an unknown operation failure

- Severity: P2 renter recovery and accessibility. The cancellation action already returns `fieldErrors.reason`, but `RenterResolutionStatus` renders neither that message nor invalid/description semantics on the textarea; it instead says `The cancellation request could not be confirmed.`
- Reproduction: submit the cancellation form with a mocked invalid `reason` response. The exact server message is absent, the reason textarea is not invalid or described, and the result misclassifies validation as uncertain.
- Cause: the component only distinguished success and stale outcomes, leaving all other action errors—including its typed visible field error—on the generic uncertainty path.
- Acceptance: the returned reason message appears beside the labelled textarea, is associated with that control, and produces a correction-oriented result message; stale and genuinely indeterminate outcomes retain their separate recovery copy.
- Fix: attach a stable error ID via `aria-describedby`, apply `aria-invalid`, render the existing field error, and branch the result copy only when that field error exists.
- Verification: focused interaction coverage failed before the change because the reason message and invalid semantics were absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (881 passed / 2 skipped). The action response is a local mock; no cancellation request, booking state, payment, owner session, or renter availability changed.
- Status: verified and committed.
- Commit: `cef7143`.

## AUD-038 — Owner cancellation decision reason is dropped before it reaches its textarea

- Severity: P2 owner recovery and accessibility. `decideCancellation` combines invalid reason text with hidden identifiers and decision validation, then returns only a generic `invalid` result. The owner decision textarea receives no server error or invalid semantics.
- Reproduction: submit a valid owner cancellation decision identity with an invalid reason. The action returns no field errors before authorization; a mocked matching UI response displays no inline message and the textarea remains valid.
- Cause: the action's combined guard discards the parsed reason failure rather than treating the visible reason as a distinct correctable field after validating authoritative hidden values.
- Acceptance: valid identity/decision plus invalid reason returns a reason field error before authorization; the owner textarea exposes that same error and invalid association. Hidden identity or decision failures retain generic authoritative-facts recovery.
- Fix: separate the reason check after identity/request/decision checks, return the constrained reason error, and bind it to the owner decision textarea with a stable error ID.
- Verification: action and interaction regressions failed before the change because the field error and textarea association were absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (883 passed / 2 skipped). All responses are local mocks; no cancellation decision, booking state, payment, owner session, or renter availability changed.
- Status: verified and committed.
- Commit: `2907225`.

## AUD-039 — External-refund validation collapses four operator corrections into a generic error

- Severity: P1 financial-operation recovery and accessibility. The external-refund action validates the actual amount, GCash reference, recipient name, and Manila movement time before authorization but returns only generic `invalid`; the owner form cannot identify any incorrect entry.
- Reproduction: submit synthetically malformed values for every external-refund field. The action returns no field errors and a mocked matching UI result leaves each native input without invalid semantics or an associated correction.
- Cause: the action's single combined invalid guard discards all parser outcomes; the reusable `Field` component could not expose an optional field error even if the action supplied one.
- Acceptance: after hidden identity validation, each malformed operator-entered refund value gets a constrained field error before authorization, and each native input is marked and described by its matching error.
- Fix: preserve each parsed validation outcome in `fieldErrors`, and extend the reusable field wrapper with optional error/error-ID support for the refund form.
- Verification: action and interaction regressions failed before the change because generic `invalid` left all four controls unlocated, then passed. Lint, typecheck, optimized production build, and the full suite passed (885 passed / 2 skipped). All responses are local mocks; no refund movement, payment, booking state, owner session, or renter availability changed. Live refund recording was intentionally not exercised because it is a real financial operation.
- Status: verified and committed.
- Commit: `91cc76e`.

## AUD-040 — Private issue-note validation is dropped and the note textarea is unlabeled

- Severity: P2 owner recovery and accessibility. A malformed private issue note is rejected as generic `invalid`, while the only note textarea has no accessible label or server-error association.
- Reproduction: submit a synthetic one-character note with valid hidden IDs. The action drops the parser result before authorization; a mocked matching UI response leaves the note textarea unnamed, not invalid, and undescribed.
- Cause: a combined identity/note early guard discards visible note validation, and the native textarea had neither label nor error semantics.
- Acceptance: hidden identity failures retain generic authoritative-facts recovery; with valid identity, an invalid note returns its exact bounded field error before authorization, and the labelled textarea is marked and described by that message.
- Fix: validate identity before branching to the note parser result, then add a stable label, error ID, `aria-invalid`, and `aria-describedby` to the note control.
- Verification: action and interaction regressions failed before the change because the field error and accessible note name were absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (887 passed / 2 skipped). All responses are local mocks; no note, issue decision, refund, booking state, owner session, or renter availability changed.
- Status: verified and committed.
- Commit: `6011fb3`.

## AUD-041 — Issue-decision validation hides financial correction paths

- Severity: P1 financial-operation recovery and accessibility. The final issue-decision action validates decision kind, manual deposit deduction, private evidence basis, and renter-visible explanation before it can complete the booking, but reports every malformed combination as generic `invalid`.
- Reproduction: submit synthetically invalid values for all four visible issue-decision fields with valid hidden IDs. The action returns no field errors before authorization; a mocked matching UI state leaves every responsible control unmarked and undescribed.
- Cause: one combined validation guard discards each parser outcome, and the decision form does not consume field errors.
- Acceptance: malformed hidden identity keeps generic authoritative-facts recovery; otherwise each malformed operator-entered decision fact returns a bounded field error before authorization, and each labelled native control is marked and described by its matching message.
- Fix: split hidden identity validation from the four visible checks, return typed field errors, and attach stable errors to the select, amount input, and both textareas.
- Verification: action and interaction regressions failed before the change because no field messages or associations were present, then passed. Lint, typecheck, optimized production build, and the full suite passed (889 passed / 2 skipped). All responses are local mocks; no issue decision, deduction, refund, booking state, owner session, or renter availability changed. Live resolution was intentionally not exercised because it can perform a financial/state transition.
- Status: verified and committed.
- Commit: `5f2ea6d`.

## AUD-042 — External-refund reversal validation hides correction fields and loses form identity

- Severity: P1 financial-operation recovery and accessibility. A reversal validates its incoming reference, counterparty, correction reason, and actual Manila movement time before recording an offsetting financial movement, but returns only generic `invalid`; when several refunds are reversible, shared action state also cannot identify the responsible form.
- Reproduction: submit synthetic malformed visible reversal values with valid hidden booking, operation, and refund-record IDs. The action discards every visible parser result before authorization, and a mocked matching UI response provides no marked/associated control. A two-refund regression confirms an eventual error must not mark its sibling form.
- Cause: the combined early guard drops field validation, while the response carries no safe form identity for rendering the shared state.
- Acceptance: invalid hidden IDs retain generic authoritative-facts recovery; valid IDs plus malformed visible values return field errors and the submitted refund record ID before authorization. Only that record's labelled form is marked and described.
- Fix: split identity checks from visible field validation, return the already-submitted valid refund-record ID only with field errors, and condition each reusable field's error on that ID.
- Verification: action and interaction regressions failed before the change because no correction messages or associations were present, then passed. The interaction regression uses two local refund fixtures and verifies the sibling reversal form remains valid. Lint, typecheck, optimized production build, and the full suite passed (891 passed / 2 skipped). No reversal, refund, booking state, payment, owner session, or renter availability changed; live reversal recording was intentionally not exercised because it is a real financial operation.
- Status: verified and committed.
- Commit: `cdb2947`.

## AUD-043 — Return-review note validation is reported only as a generic error

- Severity: P2 lifecycle recovery and accessibility. Before completing a clear return or opening ISSUE_REVIEW, the action validates the visible review note but collapses its failure into generic `invalid`; the labelled textarea has no server-error association.
- Reproduction: submit a synthetic one-character issue-opening note with valid hidden IDs and outcome. The action returns no field error before authorization; a mocked UI result leaves the note textarea valid and undescribed.
- Cause: the combined identity/outcome/note guard discards the note parser result, while the form never consumes a note field error.
- Acceptance: malformed hidden identity or outcome remains generic; an invalid visible note returns an outcome-appropriate bounded message before authorization and marks/describes the labelled textarea.
- Fix: split hidden validation from note validation, return a constrained issue-opening or optional-review note message, and attach it to the native textarea.
- Verification: action and interaction regressions failed before the change because the precise note error and association were absent, then passed. Lint, typecheck, optimized production build, and the full suite passed (893 passed / 2 skipped). All responses are local mocks; no return decision, issue opening, refund, booking state, owner session, or renter availability changed.
- Status: verified and committed.
- Commit: `b8b0983`.

## AUD-044 — Invalid saved meetup origin is not associated with the address selector

- Severity: P2 renter recovery and accessibility. The server safely asks a renter to choose a current barangay when official-area input is invalid, but the visible Philippine-address fieldset remains unmarked and unrelated to that instruction.
- Fix: pass the existing invalid result through the selector's error-ID/invalid API and use that stable ID on the existing alert.
- Verification: the focused interaction test failed before the change because the fieldset was not invalid, then passed. Lint, typecheck, build, and the full suite passed (894 passed / 2 skipped). The action response is a local mock; no address, provider request, booking, account, or session changed.
- Status: verified and committed.
- Commit: `4b35afa`.

## AUD-045 — Booking rejection reason validation is not announced

- Severity: P2 accessibility and recovery. The rejection textarea is correctly marked and described by its server-returned error, but the error node has no alert semantics for prompt announcement.
- Reproduction: mock an invalid rejection reason; the message renders and remains associated with the textarea, but has no `role="alert"`.
- Fix: add `role="alert"` to the existing `reason-error` node without changing the field association or booking-decision behavior.
- Verification: focused interaction test failed before the change, then passed. Lint, typecheck, optimized production build, and the full suite passed (895 passed / 2 skipped). All responses are local mocks; no booking decision, state, session, or renter availability changed.
- Status: verified and committed.
- Commit: `6b2821c`.

## AUD-046 — Nested local worktree breaks lint and regression discovery

- Severity: P2 engineering verification. Running the documented root lint/tests with `.worktrees/pr-152-rebase` present traverses a second checkout and its dependency tree, producing duplicate React invalid-hook failures and timeouts unrelated to root behavior.
- Evidence: baseline root commands discovered nested tests; direct ESLint probe returned ignored=false for nested source. Runs were interrupted after capturing repeated failures.
- Cause: Git ignore rules do not govern Vitest/ESLint discovery; both tool configurations omitted `.worktrees/**`.
- Acceptance: nested worktree source/tests are excluded; normal root app and script tests and Vitest default exclusions remain included.
- Fix: add `.worktrees/**` to ESLint global ignores and extend Vitest's existing default exclusions. No assertions, timeout thresholds, application behavior, or nested checkout files changed.
- Verification: discovery finds 125 root test files and zero nested paths; direct ESLint probes keep root source and ignore nested source. Full lint passes; serial full suite has 895 passed / 2 skipped; typecheck and optimized build pass after regenerating a malformed local generated Next validator with dev stopped. No source workaround for that generated-file conflict.
- Status: verified and committed.
- Commit: `2da15f3`.

## AUD-047 — Camera schedule is lost on Back from sign-in or refresh

- Severity: P2 renter task interruption. A guest must repeat a completed schedule after backing out of checkout authentication or refreshing the camera page.
- Browser evidence: requested Chrome extension profile, actual Development-backed app on port 3100. Choose Canon R50 Sep 29–Oct 2, 09:00; Continue to checkout reaches sign-in with the full schedule in `next`; browser Back returns a bare camera URL and both dates reset to Choose date. Independently selecting Sep 27–28 and reloading also clears both dates.
- Cause: selected schedule lives only in client component state; the camera history entry stays at its bare URL even though the page already supports validated schedule query restoration.
- Acceptance: completed valid schedules survive reload and Back from checkout/sign-in, preserving unrelated query/hash and avoiding extra history entries. Editing a schedule must not resurrect a previous completed range; current availability/policy validation remains authoritative.
- Fix: replace the camera history entry with the completed, validated schedule as selections change. On mount, restore from the current search parameters rather than cached server props; incomplete edits clear the previous recovery query without resetting the in-progress form.
- Verification: actual Chrome extension browser passes authenticated checkout → Back, reload, incomplete new pickup → reload without old dates, and guest cross-month schedule → sign-in → Back. The initial URL-only implementation failed the real cached-page Back check and was corrected before committing. Fresh screenshot confirms both recovered dates and enabled checkout. Three regressions cover stale server props, history recovery, incomplete edits, and changed/cleared handoff times; all 898 tests pass (two skipped), lint/typecheck/build pass, independent review clear.
- Status: verified; committed with this audit checkpoint (hash recorded in state at next cycle).

## AUD-048 — Review button gives no feedback for a missing meetup selection

- Severity: P2 checkout recovery. A renter who misses the required meetup choice sees an apparently unresponsive Review rental request button.
- Browser evidence: actual Development checkout, existing synthetic renter name/phone, entered purpose and shooting city, available meetup radio left unselected. Clicking Review leaves focus on the button, shows no validation message, and does not explain the missing choice; fresh screenshot confirms this state.
- Cause: both details transition handlers check `selectedPlace` before calling native `reportValidity()`, suppressing the required radio's validation feedback.
- Acceptance: Review identifies/focuses the missing required control, keeps entered answers, prevents review/submission until valid, and opens review after choosing an available place.
- Fix: both review entry points run native form validation before requiring the selected meetup; review and server dispatch remain gated.
- Verification: browser now focuses the unselected radio and displays “Please select one of these options.” Selecting the place opens review, focuses its heading, and retains name, phone, purpose, and shooting city. Regression observes the real native invalid event, no premature action, and correction recovery. All 899 tests pass (two skipped); lint/typecheck/build and independent review pass.
- Status: verified; committed with this checkpoint (hash recorded in state at next cycle).

## AUD-049 — Long rental-purpose text stretches the mobile review grid

- Severity: P2 mobile checkout readability. A valid project reference in Purpose makes all review rows wider than the screen and clips the meetup text.
- Browser evidence: real checkout at 320×740, purpose includes a long synthetic example.com project URL within the 1,000-character limit. Document usable width 305px, scroll width 325px; review `dt`/`dd` reach x=325 and a horizontal scrollbar appears. Fresh screenshot confirms right-edge clipping.
- Cause: review uses an implicit mobile grid track with intrinsic minimum width. Existing `break-words` cannot shrink that track; only the desktop two-column track is explicit.
- Acceptance: full review text fits 320px and 390px with no document overflow, while desktop retains two columns. Preserve edit/review behavior and entered answers.
- Fix: add an explicit mobile `minmax(0, 1fr)` grid column using the existing Tailwind utility; retain the desktop two-column breakpoint and existing word wrapping.
- Verification: actual browser usable/scroll widths now match at 305/305 (320px viewport), 375/375 (390px viewport), and 1425/1425 (1440px viewport). Desktop retains two 294px columns. Fresh mobile screenshots show complete meetup and long purpose text; Edit your details retains the draft, Review restores it, and mobile price summary expands/collapses correctly. Lint and optimized build pass. No class-mirroring unit test added for this layout-only fix.
- Status: verified; committed with this checkpoint (hash recorded in state at next cycle).

## AUD-050 — Rejected agreement replacement discards the owner's edited schedule

- Severity: medium. A validation response resets the edited camera and dates to the existing agreement while displaying errors for the discarded draft. The owner cannot see or correct the submitted values and may inadvertently retry a different schedule.
- Evidence/reproduction: approve a future synthetic Development request, open material replacement, enter a return before pickup, submit. Chrome resets return to the original later date while saying “Return must be after pickup.” Screenshot and AX evidence under ignored `2026-09-26/aud050-*` artifacts. The regression also reproduces camera and pickup reset.
- Cause: React's form action resets uncontrolled inputs after the action resolves, including returned application validation errors. This form used `action={action}` with persisted `defaultValue` props.
- Acceptance: preserve the edited camera/pickup/return on rejection; associate the error with the retained field; correcting return submits all retained draft values and issues the expected persisted replacement.
- Fix: dispatch the existing action from a prevented native submit inside `startTransition`, retaining pending guards and native validation. No server contract or business-rule change.
- Verification: regression failed on the discarded camera before the fix; all 39 contract tests pass afterward. Actual Chrome retains Sep 29 pickup/Sep 28 invalid return; changing only return to Oct 1 creates version 2 with Sep 29–Oct 1 and survives reload. Fresh screenshot confirms error matches visible values. Lint, typecheck, and optimized build pass; independent diff review found no actionable issue. Commit `b8585a2`.

## AUD-051 — Signing a superseded agreement times out instead of explaining the changed version

- Severity: high. A renter with a superseded open agreement waits through the request deadline and receives an uncertain-signature message. The database retry loop also consumes Development resources.
- Reproduction: create and approve a synthetic future request, load renter version 2, issue version 3 as owner, restore renter authorization without reloading the old tab, consent and sign version 2. Action took 33.6s; the full response took 42s and displayed an indeterminate result. Refreshed version 3 remained unsigned.
- Cause: the live SQL API wrapper passed the private signer's known SQLSTATE `40001` business conflicts to PostgREST 14.5. The same backend session repeatedly executed the signing query after the browser response; the targeted cancel query matched zero rows between attempts. API normalization stops the retry path, as in ENV-003.
- Acceptance: exact known signing conflicts fail promptly with changed-agreement guidance; no signature/state mutation; refreshed latest agreement remains unsigned and signable; unexpected transaction failures retain their SQLSTATE and rollback behavior; access and consent boundaries remain intact.
- Fix: PL/pgSQL API wrapper maps only `contract_version_stale`, `contract_signature_stale`, and `contract_not_signable` to `P0001`; security-invoker mode and grants preserved. Action recognizes exact normalized messages and remains compatible with legacy `40001`.
- Verification so far: three new action cases failed before implementation; real SQL regression failed on the old stale-version SQLSTATE. All 44 contract tests and disposable PostgreSQL lifecycle regression with all 80 migrations pass. SQL covers rollback, unrelated serialization failures, anonymous denial, cross-renter denial, consent, idempotent signing, supersession, expiry and history. Independent review found no actionable issue. Development migration/history applied atomically and readback confirms PL/pgSQL, invoker mode, correct grants and zero matching retry sessions. Lint/typecheck pass. Optimized build and fresh serial full suite pass (913 tests, two opt-in checks skipped). Earlier concurrent full suite/build was stopped after timing-related failures; no test timeout was relaxed. Actual stale version-3 signing returns changed-agreement guidance, refreshes the current view to unsigned version 4 and clears consent (action 4.867s; full response 6.8s, versus 33.6s/42s before). The initially interrupted extra reload/post-retest SQL check is now complete after Chrome reconnection: version 4 remained unsigned, and later cleanup confirms zero signatures, zero active blocks and zero signing retries. No signature or payment created by browser testing. Commit `62ac0c0`.

## AUD-052 — Rejected template publication discards all edited terms

- Severity: medium. Choosing an existing template version correctly rejects publication, but the owner loses the entered version and all edited terms, making the instruction to choose a new version costly to follow.
- Reproduction: on Development Settings, enter the active version, change pickup instructions, approve and submit. The version becomes empty, pickup reverts to persisted text and approval clears while “That template version already exists. Choose a new version.” remains. Active terms are unchanged.
- Cause: the uncontrolled form used a React action, whose resolved validation/error return resets native controls.
- Acceptance: retain the entire rejected draft and approval on failure; resubmit corrected values intact; preserve the existing form reset after success and active-template authority.
- Fix: explicit submit dispatch in a transition with a pending guard, and reset only after success.
- Verification: regression failed on the lost version before the fix, then all 45 contract tests pass. Test asserts retention of all seven terms, version and approval, corrected resubmission, and success-only reset. Actual Chrome duplicate-version response preserves the edited pickup and version; retrying with the original active terms succeeds idempotently and resets version/approval. Reload confirms the original active terms. Lint, typecheck and optimized build pass; independent review found no actionable issue. No new template or terms activated. Commit `a2efe94`.

## AUD-053 — Saved meetup checkboxes revert to their initial state

- Severity: medium. Owners see selected places unchecked after saving, or a removed place checked beside “No meetup places assigned,” making subsequent edits unreliable.
- Reproduction: assign the new synthetic public meetup to the Development test camera and save: checkbox clears while the ordered row remains. Reload shows the saved selection. Remove and save: checkbox rechecks while the empty-assignment guidance appears. Fresh screenshot: ignored `2026-09-26/aud053-checkbox-reset.png`.
- Cause: React action completion resets native checkboxes to their mount-time checked state without updating the controlled selected-ID list or its hidden submission fields.
- Acceptance: success and error preserve the actual draft selection; the next toggle submits the corresponding IDs; saved add/remove state agrees with reload and guidance.
- Fix: capture form data on prevented submit and dispatch the existing action inside a transition; retain the pending guard.
- Verification: success/error regression cases both failed before implementation; all 89 meetup tests pass, two opt-in provider checks skipped. Actual Chrome add/save/reload and remove/save/reload now keep the correct checkbox state; screenshots inspected. Lint, typecheck, optimized build and independent review pass. The test-camera assignment is restored to empty; the synthetic meetup is archived and remains absent after reload. Commit `8949d2a`.

## AUD-054 — Rejected meetup edits clear the pin checkbox but leave Save enabled

- Severity: low. After a rejected save, the visible confirmation is cleared while client state still considers the pin confirmed, leaving an enabled Save button that native validation then rejects.
- Evidence: saved stale editor for the archived synthetic meetup, received the correct changed-place message, retained arrival instructions, but confirmation became unchecked and Save changes remained enabled. Screenshot: ignored `2026-09-26/aud054-confirmation-reset.png`.
- Cause: React's native form reset changes the checkbox without updating its controlled confirmation state, matching AUD-053's mechanism in the adjacent editor.
- Acceptance: failed saves retain draft and confirmation; editing details clears confirmation and disables Save; corrected/reconfirmed submissions contain the draft; success clears confirmation consistently to prevent immediate repeat creation.
- Fix: explicit transition dispatch and a success-only confirmation-state reset in the action callback. Server validation and explicit public-pin confirmation remain required.
- Verification: regression failed before implementation and passes after, covering rejected draft, editing/reconfirmation, corrected payload and success-only clearing. All 90 meetup tests pass/two opt-in provider checks skipped; lint/typecheck pass. Actual Chrome server rejection of a one-character place name retains confirmation; correcting the name disables Save until reconfirmed, then creates the synthetic place. Editing it succeeds and refreshes to the persisted revision with confirmation clear. Optimized build and independent review pass. Synthetic fixture archived and absent after reload; existing Ayala meetup unchanged. Commit `bc68eb6`.

## AUD-055 — Rejected GCash configuration discards the recipient draft

- Severity: medium. Validation resets the entered recipient name/number to the stored configuration while reporting errors for the discarded draft.
- Browser evidence: on Development Settings submit a two-space recipient name with the existing number. “Enter the approved recipient name” appears under the restored saved name. Screenshot: ignored `2026-09-26/aud055-recipient-reset.png`.
- Cause: automatic native reset after a React form action resolves with an application error.
- Acceptance/fix: explicit transition dispatch preserves the actual submitted recipient fields and pending/native-validation behavior. Correction must submit retained fields.
- Verification: new regression fails before the fix and passes after, checking both fields and corrected retry/success payload. All 24 payment tests, lint/typecheck/build and independent review pass. Fresh Chrome reload then rejected submission retains the whitespace draft and original number. Correcting to the original recipient reaches a separate backend rejection, now tracked as AUD-056; no recipient value changed and no payment occurred. After AUD-056 was applied to Development, the original recipient saves successfully and persists through reload. Commit `3e700ee`.

## AUD-056 — Canonical +63 GCash recipient is rejected by the database

- Severity: high for owner configuration. Saving the existing valid Development recipient through the real form returns the generic invalid-recipient error after client/server schema validation.
- Cause: action normalizes to +63; the August 30 idempotency migration doubled the regex escape before the plus. Live function matches that migration with standard_conforming_strings enabled. Existing SQL coverage used only local 09 numbers.
- Acceptance: canonical +63 and legacy 09 numbers save; malformed numbers still fail without mutation; same-value retries preserve version/audit count; authorization and grants unchanged.
- Fix: forward migration uses `[+]` for literal plus, avoiding backslash ambiguity. The remainder of the prior function, admin guard, locking, idempotency and grants is unchanged.
- Verification: added real PostgreSQL regression fails before the fix on canonical save. All 81 migrations and full manual-payment SQL lifecycle test pass afterward, including canonical persistence, retry version stability, invalid prefixes/lengths/non-digits/backslashes, audit counts and legacy flow. Independent review found no actionable issue. Applied exact migration/history atomically only to Development; readback confirms literal-plus pattern, anonymous denial and authenticated execute. Actual Chrome correction now saves; reload confirms same recipient identity in canonical +63 format. Fresh success screenshot inspected. Actual repeat save succeeds and leaves configuration version/audit-event count at 2/2. Full serial suite passes: 918 tests, two opt-in provider checks skipped; current lint/typecheck/build pass from AUD-055. No payment, Production change, or new recipient identity. Commit `22d958f`.

## AUD-057 — KYC validation clears visible address selections

- Severity: medium. A personal-field rejection resets Region, Province/area, City and Barangay to “Select…” while the form still announces “Barangay selected” and holds a hidden selected code. Renters cannot reliably see the address being resubmitted.
- Reproduction: existing synthetic renter Account → replace legal name with two spaces → Update KYC. Name error appears, all four selects clear, other address fields remain. DOM values and fresh screenshot confirm the mismatch (`2026-09-26/aud057-address-select-reset.png`, ignored).
- Cause: resolved React form action triggers native reset on controlled select elements. Returned scalar draft values do not restore child selector DOM state.
- Acceptance: preserve all four visible selections and entered details through account and checkout errors; corrected submissions retain the canonical code; checkout first-step gating, error-step focus, native validity and successful redirect remain intact.
- Fix: prevent native submit and dispatch the action in a transition only after the existing mode/step validation gates, with pending guard.
- Verification: regression uses the real PSGC selector with mocked lookup responses; both account and checkout fail before the fix on blank region and pass after. All 56 KYC/location tests and 234 serial booking tests pass; lint/typecheck/build and independent review pass. The initial parallel booking run hit timing failures; serial rerun passed without relaxed timeouts. Actual Account name error preserves all selects, future DOB still receives native max-date guidance, and restoring original values saves and persists. Actual Checkout rejection focuses Details, correction retains all selects on Address; corrected save redirects back to rental plans with the same selected schedule. No new booking or changed saved identity/address. Commit pending.


## AUD-058 — Expired-session form actions reach a generic page error

- Severity: medium. A renter who signs out in another tab cannot recover an open checkout save: the form is replaced by a generic connection-error boundary.
- Reproduction: keep a changed checkout Details/Address draft open, sign out through a second same-profile account tab, then Save and continue to review. Next reports an unexpected Server Action response; ignored screenshot `2026-09-26/aud058-signed-out-checkout.png`.
- Cause: the session proxy sends a 307 page redirect for the action POST, which follows through to login HTML rather than the expected Next action response. The KYC action's existing unauthorized result never reaches its form.
- Acceptance/fix: after session refresh, let POST requests carrying `next-action` reach Next's action handling and independent action authorization. Keep page redirects for GET (even with the header) and ordinary POST. Retain refresh cookies and cache headers.
- Verification: four new proxy regressions fail before the fix; all 42 focused proxy/KYC action tests pass after. Real two-tab sign-out now returns inline sign-in guidance while retaining name and all four address selections. Supported synthetic sign-in followed by original-name retry succeeds and preserves the schedule; fresh Account view confirms unchanged stored identity/address. No rental request submitted. Fresh screenshot `aud058-inline-session-guidance.png`; independent review found no actionable issue. Lint, typecheck and optimized build pass. Full serial run: 923 passed, two opt-in skips, four 5-second timeouts in one booking recovery file under concurrent host load; unchanged isolated rerun passes all ten tests (2.53 seconds of tests). All 927 non-skipped cases therefore pass across the suite and rerun. Commit `6947bb2`.


## AUD-059 — Owner camera actions lose the editor on expired access

- Severity: medium. A signed-out owner saving an open camera editor receives a generic connection-error page and loses the unsaved draft.
- Browser reproduction: edit the synthetic camera description, sign out through Account in another tab, then Save camera. Console shows uncaught `AuthenticationRequiredError` from `requireUser` → `requireAdmin` → `updateCameraDraft`; screenshot `2026-09-26/aud059-owner-session-error.png`.
- Cause: seven owner camera actions awaited `requireAdmin` without returning a recoverable form result when authentication or authorization failed.
- Acceptance/fix: a shared camera-action helper catches only authorization acquisition and returns safe sign-in/retry guidance. Every mutation, storage operation, revalidation and success redirect stays outside that catch and requires a returned owner context. Existing explicit form submission preserves the rejected draft.
- Verification: all 22 new action cases fail before the fix and pass after. 132 listing/auth tests plus the updated six-case form suite pass; lint/typecheck/optimized build and independent review pass. Cases cover seven actions for signed-out, non-owner and unavailable verification, zero mutation/storage calls, retained draft, and successful retry. Actual Chrome retains the camera description with inline guidance after sign-out and after switching to a renter. Restored owner session saves that exact draft, which persists after reload. Original synthetic description then restored through Save camera and continue; no price, kit, availability or publication change. Commit `96425c9`.


## AUD-060 — Meetup actions discard the editor after session expiry

- Severity: medium. A completed meetup draft disappears into the generic connection-error boundary when its owner signs out in another tab before saving.
- Reproduction/evidence: complete a synthetic public-place draft and confirm the pin; sign out elsewhere; Save meetup place throws uncaught `AuthenticationRequiredError` through `saveMeetupPlace`. Screenshot `2026-09-26/aud060-meetup-session-error.png`. No place was created by the failed submission.
- Cause/fix: meetup save/archive/assignment/search awaited authorization without a form/search recovery result. A module-local helper catches authorization acquisition only and returns safe access guidance; mutations, revalidation and provider requests remain gated by a verified owner context.
- Acceptance: failed auth never mutates or spends search budget; draft fields/confirmation survive; search finishes with guidance; restored owner can retry; archive cleanup persists.
- Verification: five regressions fail before implementation; 155 meetup/auth tests pass, two opt-in provider checks skipped. Lint/typecheck/optimized build and independent review pass. Real signed-out save retains every field and checked confirmation; signed-out search returns access guidance and re-enables Search. Restored owner creates the retained synthetic place, reload confirms it, then Archive removes it and a second reload confirms absence. Place was never assigned to a camera; existing Ayala place unchanged. Recovery screenshot inspected: `aud060-meetup-recovery-guidance.png`.

## AUD-062 — Windows local startup silently exits after successful checks

- Severity: medium for development/test availability; no hosted behavior affected.
- Reproduction: restored verified Development configuration on Windows; run the documented local start script with Node24.19.0. All dependency checks pass, then exit1 without a Next server or explanation. Direct isolated spawn of pnpm returns ENOENT/status null.
- Cause: shell-free spawnSync cannot execute the Windows package-manager shim; launch errors were discarded.
- Acceptance: same checked environment and loopback3000, current Node runtime and installed Next CLI; report spawn failures; propagate server failure/signal exit; browser loads actual Development catalog.
- Fix: launch the installed Next entry point through process.execPath, with explicit spawn error handling.
- Verification: extracted unchanged launcher reproduces two failing regression cases (command target and swallowed spawn failure); all7 startup/configuration tests pass after fix. Actual launcher reports Ready and Chrome renders both Development listings at127.0.0.1:3000. Focused lint and diff whitespace check pass. Full post-fix suite running; commit pending.

- AUD062 final verification: full post-fix suite1131 passed/14 skipped across159 passed/4 skipped files (221.30s). Real Development startup and browser catalog verified; no Next route changes. Build baseline remains pending. Diff reviewed: only launcher target/error handling and relevant records/tests; no credentials or unrelated plan included.

## AUD-063 — Profile personal fields overflow narrow screens

- Severity: medium.320px Profile requires horizontal scrolling; name, birthdate, and mobile controls extend beyond their card and viewport.
- Browser reproduction: synthetic renter Profile, both initial/saved and invalid-name states, viewport320x800. clientWidth305/scrollWidth358, personal field right357.39. Fresh screenshots visibly show clipped controls and horizontal scrollbar.
- Cause: personal-details grid has an implicit auto column below sm; native input intrinsic size expands that track. This is inside the new Profile form, distinct from AUD005's former outer Account grid.
- Acceptance/fix: use Tailwind grid-cols-1 (minmax(0,1fr)) below sm, preserving sm:grid-cols-2. No behavioral or business-rule change.
- Verification: actual browser after fix320px305/305 and390px375/375; desktop1440px1425/1425 with name and birthdate side by side (405.2px each). Fresh screenshots inspected at all three sizes. Invalid-name recovery preserves all address selects/pin; corrected original synthetic details save and persist after reload.10 focused Profile/KYC tests, lint/typecheck pass. No new assertion mirroring a CSS class; browser geometry is the regression evidence. Commit pending.

- AUD062 committed as422ecec. Subsequent optimized build baseline passes on this checkout with Development public configuration; no deployment.

## AUD-064 — Checkout personal/contact fields overflow narrow screens

- Severity: medium. Actual Development checkout at320px overflows on Your details and Your rental plans: client305/scroll345. Address step already fits305/305. Screenshots show clipped name/mobile/date fields.
- Cause: each affected form uses an implicit auto grid column, retaining native input intrinsic width, matching AUD063 at separate checkout containers.
- Fix: explicit minmax(0,1fr) for checkout-personal-fields and grid-cols-1 for request contact grid; preserve sm two-column contacts and all form behavior.
- Verification: both affected steps fit305/305 at320px and375/375 at390px; desktop1425/1425 retains side-by-side rental-plan contacts and full-width personal details. Fresh settled screenshots inspected. Details→Address→save returns same schedule; browser Back and Review→Edit preserve draft meetup/purpose/city. Missing meetup blocks review and focuses radio; long-purpose review fits320px. No booking submitted.29 focused checkout/request tests, lint/typecheck and optimized build pass. Commit pending.

## AUD-065 — Windows Development setup cannot launch its download command

- Severity: medium for local setup. After successful Vercel reauthentication, the setup script immediately reports Could not pull Development configuration without invoking Vercel.
- Cause: a second shell-free spawn of the Windows pnpm shim, in the configuration-download path (separate from AUD062's server launch).
- Acceptance/fix: invoke pnpm's JavaScript entry point supplied by npm_execpath through the current Node runtime; preserve fixed Development pull arguments, argument boundaries, errors, and credential target validation. Direct invocation without package-manager context gives the documented pnpm dev:setup instruction.
- Verification: extracted old behavior fails the command/invocation tests;10 focused configuration/startup tests pass after fix. Actual pnpm dev:setup under Node24.19.0 downloads CamNook Development values and passes database, search, tile and origin checks. Focused lint/diff checks pass; full suite1134passed/14skipped across159passed/4skipped files (221.88s). Local app remains accessible. Commit pending.

- AUD064 committed as7f7ce73.
- AUD065 committed as24d732e.

## AUD-066 — Owner Work summary omits pending cancellations

- Severity: medium. Real owner Today shows8 items needing attention but only6 Booking review in Work; Bookings contains2 pending cancellation requests that have no summary link. Cancellation-only work consequently produces an empty summary.
- Cause: summary links read only queue_counts while the attention total also includes supporting_queue_counts.cancellation. The existing cancellation section has no queue anchor.
- Fix/acceptance: include cancellation in the same displayed count map used for the total, show its summary link only when populated, and add the existing section's target anchor. Preserve all decision rules and data contracts.
- Verification: new cancellation-only regression fails before fix and passes after;18 focused portfolio/resolution tests, lint and typecheck pass. Actual Today shows6 review +2 cancellation links; its cancellation link lands at the visible queue. After accepting only the new synthetic audit booking's cancellation, summary updates to5+1; the in-page link also reaches the queue. Settled screenshots inspected. Empty state remains covered. Commit pending.
- AUD066 committed as1497529. Renter session independently verifies cancelled/accepted, zero fee/refund, no remaining action; fixture cleanup complete.
- AUD061 remains unverified on current code: Chrome file chooser rejected setFiles before selection with Not allowed. Followed controller guidance requesting extension Allow access to file URLs; no upload attempted and no product fix inferred from this tooling failure.

## AUD-067 — Profile displays an old save notice during later edits and errors

- Severity: medium. After saving Profile, the saved=1 URL flag keeps the server-rendered success banner visible while the renter edits again and even when the next save is invalid. The old banner cannot confirm the current attempt's outcome.
- Cause: the acknowledgement is rendered solely from a persistent query parameter, outside the form's interaction lifecycle.
- Fix/acceptance: a small client feedback wrapper clears only the saved flag on editor interaction/change/submission, using documented Next native-history integration without navigation or form replacement. A successful server redirect supplies a fresh acknowledgement. Preserve other query parameters, fragment, draft values, all validation, and checkout behavior.
- Verification: change/submit regressions fail before fix; pin interaction also covered. Browser: saved notice disappears on whitespace-name edit, invalid save shows only correction guidance, correction to original name produces a new success notice, and pin Adjust→Cancel clears the old notice without changing the pin. Final reload confirms original synthetic name, birthdate, house, empty building, address details and pin. Lint/typecheck and optimized build pass; final focused count recorded in coverage. Commit pending.
- Owner-only AUD061 reassessment deferred pending Supabase dashboard authentication. Connected account cannot list CamNook; dashboard/GitHub signed out; historical bootstrap user absent in Development; service-role template metadata read correctly denied42501. No permission changes, invented owner account, or privileged bypass attempted.
