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

## ENV-003 — Development profile conflict responses time out
- Evidence: real two-tab stale-profile submissions returned generic retry after the app's30s deadline. Direct supported synthetic-auth probe read the current profile in667ms, but stale save timed out after45s. Current stored house remains Audit13, not the stale draft. Logs `/tmp/camnook-audit-profile-conflict{,-extended}.log`.
- Expected: SQL migration raises40001 for revision mismatch and pin reconfirmation; application then explains conflict. Cause not established: do not claim the intended conflict journey passed.
- Status: investigation pending Development database management access; no policy or schema bypass. Other reads and valid profile save passed.
- Commit: none.


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
