# Coverage

| Journey / state | Current evidence | Remaining |
| --- | --- | --- |
| Guest catalog, desktop, failed request | Error and retry control observed; `01-catalog-error.png`; no console errors | Retry after transient failure under controlled conditions |
| Guest catalog, desktop, success | Fresh reload shows two Development listings after DNS recovered | Screenshot, detail dialog, mobile, keyboard |
| Schedule → quote → checkout | Canon R50 Sept 26–28 selected; sole 09:00 time; PHP 900 rental + 1,000 deposit = 1,900 total. Synthetic renter selected meetup, reviewed, survived injected auth outage, and submitted successfully | Invalid dates, change-date round trip, unavailable camera |
| Sign-in and renter profile | CAPTCHA failure/retry verified with real widget; 390×844 screenshot, no horizontal overflow; desktop Lighthouse 30 checks passed. Supported synthetic renter refreshed and authenticated | Successful real CAPTCHA/OTP unverified; renter profile browser persistence |
| Rental lifecycle | Real synthetic request saved; owner-review status, schedule and meetup persisted after reload and page-error retry | Owner response, agreement/payment/handoff/return and exceptions |
| Owner inventory/settings/reports | Routes and prior fixes inspected | Current browser verification |

Screenshots alone do not prove accessibility compliance. Synthetic or simulated checks will be explicitly distinguished from real Development integration.

- AUD-004: booking desktop1440/mobile390 Lighthouse33 checks passed, zero failed; account desktop42 passed, mobile one unrelated attribution-link finding. Privacy mobile27 passed. Screenshot09–12. Account mobile overflow discovered (AUD-005), so responsive account coverage is not passing.

- AUD-005: actual account page now fits320px and390px, including profile form; desktop1440 two-column layout preserved. Screenshots13–15.

- AUD-006: real account map attribution visibly underlined; mobile Lighthouse42 checks passed, zero failed. Screenshot16.

- Renter lifecycle: empty cancellation reason blocked with focus; valid synthetic cancellation saved, persisted after reload, and removed repeat request form. No owner decision yet. Renter /admin redirects to Access denied.
- Account profile: missing required pin produces actionable validation while preserving fields. Structured synthetic address and confirmed public-location test pin saved via UI and persisted on reload. No real residential data used.

- AUD-007: camera/profile navigation and refresh preserve rental plans; same schedule retry identity retained. Real Development committed-response-loss → alternate date draft → original date exact-payload retry recovered the same booking, no duplicate. Successful draft cleanup verified. New booking3f7bdcc3-357b-4b0b-a048-a194694411e2; account total3. Screenshot18–19.
- Catalog details tooltip and schedule calendar dismiss with Escape and return focus to trigger; mobile390 fits. Old dates disabled; selected dates return through Change dates.
- Profile stale-edit path remains unverified (ENV-003). Current persisted synthetic house Audit13 and pin remain intact.

- Camera lightbox: mobile390 screenshot inspected; keyboard arrow wrap, Escape dismissal and focus restoration verified; open-dialog Lighthouse20 passed, zero failed. Native dialog confines page focus (browser chrome remains reachable).
- Missing camera and synthetic nonexistent booking both show specific not-found screens; recovery links return to catalog/account successfully.
- AUD-007 post-success fresh checkout confirmed blank purpose/city/meetup and a new operation identity.

- Unrequestable Development camera shows explicit unavailable state and Browse cameras, with no schedule controls.
- Real renter sign-out redirects to sign-in; other-tab owned booking navigation and browser Back to account require authentication. Supported synthetic session restored afterward.
- AUD-008: one-time checkout read503 then UI Retry restores same schedule and address-edit step; fresh server estimate required. Mobile390 screenshot20 inspected.

- Account read failure: injected one Development overview503; existing Try again link fetched successful profile/bookings without navigation away. No defect found. Fault harness stopped.

- AUD-009: account privacy link opens separate notice tab and preserves unfinished fields plus pin-reconfirmation state. Screenshot21 mobile390 inspected; shared checkout link changed, but that variant was not separately browser-exercised in this final checkpoint.

- AUD-010: live camera-detail gallery inspected at desktop and 390×844. Thumbnails are announced as buttons that enlarge a photo, not checkbox-like selection toggles. The second photo opened in the lightbox; Escape closed it and returned focus to that trigger. Visual selected styling and layout were preserved.

- AUD-011: a real Development provider DNS failure reached the page retry state, then the next protected request incorrectly redirected to sign-in. Focused proxy coverage now distinguishes transient claims failures from absent sessions. The later unchanged full suite passed with 856 passed / 2 skipped; a post-fix browser session could not be established because automated CAPTCHA/OTP remains unavailable.

- AUD-012: live desktop inspection first found the primary 676px camera photo at `loading="auto"`, with no image preload link and a Next LCP warning. Focused render coverage now asserts eager loading for that initial photo; thumbnails stay lazy. A transient Development provider failure prevented a post-fix browser render, but the focused gallery suite plus the full suite (856 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-013: a client interaction reproduction of a server validation return now verifies invalid state and alert association for Name; the same relationship covers phone, meetup choice, purpose, and shooting city. Details-step focus recovery and form values remain verified. Focused request-form suites, the full suite (856 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-014: checkout KYC's server-returned phone validation path now verifies the mobile control's invalid state and association with its visible error while retaining country-code context. Standard personal/address controls use the same wrapper. Focused KYC suites, the full suite (856 passed / 2 skipped), lint, typecheck, and build pass. PSGC and residential-pin error associations remain untested specialized controls.

- AUD-015: checkout KYC's server-returned Philippine area validation now marks the semantic selector group invalid and associates it with the visible error without replacing its status description. Focused checkout flow, the full suite (857 passed / 2 skipped), lint, typecheck, and build pass. Residential-pin error association remains untested.

- AUD-016: residential pin server and reconfirmation alerts are associated with its labelled composite region. Focused residential-pin/checkout suites, the full suite (858 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-017: mocked renter payment validation now verifies invalid state and individual error associations for GCash reference and private proof, preserving proof guidance. Focused payment suites, the full suite (859 passed / 2 skipped), lint, typecheck, and build pass. No real payment or proof upload was attempted.

- AUD-018: full source-only security scan completed with separate architecture and baseline review receipts. No source-supported reportable finding across authentication, authorization, KYC/payment/evidence privacy, upload integrity, webhooks, cron/management routes, provider boundaries, and rental lifecycle integrity. Deployed-state verification remains outside this static checkpoint.

- AUD-019: public camera-date picker uses button semantics both before and after selecting a pickup date. The live AX tree retains the explicit selected-pickup label while no longer exposing a checkbox/toggle state. Focused calendar tests, full suite (860 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-020: mocked owner payment-decision responses now mark amount, reference, actual-account confirmation, and rejection reason invalid and associate each with its current alert. Both interaction paths, full suite (862 passed / 2 skipped), lint, typecheck, and build pass. Owner browser verification remains unavailable without a known Development owner session; no payment operation was performed.

- AUD-021: mocked owner GCash-configuration validation now marks recipient name and GCash number invalid and associates each with its current alert while retaining the mobile control's country-code description. Focused test, full suite (863 passed / 2 skipped), lint, typecheck, and build pass. Owner browser verification remains unavailable without a known Development owner session; no configuration was changed.

- AUD-022: mocked owner pickup validation now marks every direct pickup field and affected identity/accessory checklist checkbox invalid and associates it with the returned error. Focused test, full suite (864 passed / 2 skipped), lint, typecheck, and build pass. Owner browser verification remains unavailable without a known Development owner session; no pickup or evidence action was performed.

- AUD-023: mocked owner condition-photo validation now marks the private file input invalid and associates it with its returned error. Focused test, full suite (865 passed / 2 skipped), lint, typecheck, and build pass. No condition photo was selected, uploaded, stored, or accessed.

- AUD-024: mocked owner contract-template validation now marks the version, every required term, and approval confirmation invalid and associates each with its returned error. Focused test, full suite (866 passed / 2 skipped), lint, typecheck, and build pass. No template was published or activated.

- AUD-025: mocked owner handoff-policy validation now retains time-format guidance and associates its shared weekday error with every weekday checkbox. Focused recovery tests, full suite (867 passed / 2 skipped), lint, typecheck, and build pass. No availability policy was saved.

- AUD-026: mocked owner handoff-area validation now marks the semantic Philippine address group invalid and associates it with its returned city error. Focused recovery tests, full suite (868 passed / 2 skipped), lint, typecheck, and build pass. No area selection or availability policy was saved.

- AUD-027: invalid manual residential coordinates now mark Latitude and Longitude invalid and associate both with their live correction; editing clears stale error state. Existing map fallback suite, full suite (868 passed / 2 skipped), lint, typecheck, and build pass. No location permission, map request, or pin persistence occurred.

- AUD-028: mocked return-recording validation now identifies return time, serial, every accessory selector, condition report, and notes. Focused test, full suite (869 passed / 2 skipped), lint, typecheck, and build pass. No return, evidence, refund, or booking transition occurred.

- AUD-029: mocked return-evidence validation now labels the primary file input and associates it with its returned photo error. Focused test, full suite (870 passed / 2 skipped), lint, typecheck, and build pass. No photo was selected, uploaded, stored, accessed, or authorized.

- AUD-030: mocked versioned return-evidence validation now labels the matching replacement file input and associates only it with its returned error. The action preserves the replacement target for field recovery. Focused tests, full suite (872 passed / 2 skipped), lint, typecheck, and build pass. No photo was selected, uploaded, stored, accessed, or authorized.

- AUD-031: mocked hidden-schedule validation now returns checkout to the details step with its exact message and a preserved picker link; the known-invalid schedule cannot be resubmitted. Focused test, full suite (873 passed / 2 skipped), lint, typecheck, and build pass. No checkout, booking, payment, account, or schedule was submitted or changed.

- AUD-032: mocked hidden handoff-policy reference validation now exposes the server's reload instruction instead of a misleading visible-field prompt. Focused test, full suite (874 passed / 2 skipped), lint, typecheck, and build pass. No policy, camera, owner session, or renter availability changed.

- AUD-033: mocked hidden replacement-contract reference validation now exposes the server's refresh instruction instead of a misleading visible-field prompt. Focused test, full suite (875 passed / 2 skipped), lint, typecheck, and build pass. No agreement, camera, schedule, owner session, or renter availability changed.

- AUD-034: mocked hidden booking-decision reference validation now exposes the server's invalid-reference result instead of a misleading visible-field prompt. Focused test, full suite (876 passed / 2 skipped), lint, typecheck, and build pass. No booking decision, agreement, camera, schedule, owner session, or renter availability changed.

- AUD-035: mocked hidden booking and contract-version signing validation now expose their precise refresh instructions instead of a misleading consent prompt. Focused tests, full suite (878 passed / 2 skipped), lint, typecheck, and build pass. No signature, agreement, booking, payment, owner session, or renter availability changed.

- AUD-036: mocked invalid hidden payment-reference validation now returns an exact refresh instruction instead of incorrectly calling it an observed-transfer mismatch. Focused action/UI tests, full suite (880 passed / 2 skipped), lint, typecheck, and build pass. No payment, proof access, booking, agreement, owner session, or renter availability changed.

- AUD-037: mocked cancellation-reason validation now marks and describes the native textarea with the existing server message, while its result alert calls for correction rather than an uncertain outcome. Focused test, full suite (881 passed / 2 skipped), lint, typecheck, and build pass. No cancellation request, booking state, payment, owner session, or renter availability changed.

- AUD-038: mocked owner cancellation-decision validation now preserves the reason error before authorization and associates it with the native textarea. Focused action/UI tests, full suite (883 passed / 2 skipped), lint, typecheck, and build pass. No cancellation decision, booking state, payment, owner session, or renter availability changed.

- AUD-039: mocked external-refund validation now marks and describes actual amount, GCash reference, recipient name, and movement time with their server-returned errors. Focused action/UI tests, full suite (885 passed / 2 skipped), lint, typecheck, and build pass. No refund movement, payment, booking state, owner session, or renter availability changed.

- AUD-040: mocked private issue-note validation now labels, marks, and describes the note textarea with the server-returned error. Focused action/UI tests, full suite (887 passed / 2 skipped), lint, typecheck, and build pass. No note, issue decision, refund, booking state, owner session, or renter availability changed.

- AUD-041: mocked issue-decision validation now marks and describes decision kind, manual deduction, private evidence basis, and renter-visible explanation with their server-returned errors. Focused action/UI tests, full suite (889 passed / 2 skipped), lint, typecheck, and build pass. No issue decision, deduction, refund, booking state, owner session, or renter availability changed.

- AUD-042: mocked external-refund reversal validation now marks and describes incoming reference, counterparty, correction reason, and movement time only in the rejected refund record's form. Focused action/UI tests, full suite (891 passed / 2 skipped), lint, typecheck, and build pass. No reversal, refund, booking state, payment, owner session, or renter availability changed.

- AUD-043: mocked return-review validation now marks and describes the issue-opening note with its server-returned error. Focused action/UI tests, full suite (893 passed / 2 skipped), lint, typecheck, and build pass. No return decision, issue opening, refund, booking state, owner session, or renter availability changed.

- AUD-044: mocked saved-origin rejection now marks and describes the Philippine-address selector with its existing recovery instruction. Focused UI test, full suite (894 passed / 2 skipped), lint, typecheck, and build pass. No address, provider request, booking, account, or session changed.

- AUD-045: mocked booking-rejection validation now announces the existing reason error while retaining its association with the textarea. Focused UI test, full suite (895 passed / 2 skipped), lint, typecheck, and build pass. No booking decision, state, session, or renter availability changed.

- 2026-09-26 / AUD-046: local setup credentials/provider search/map checks passed; root lint/test discovery repaired with nested worktree retained on disk. Lint, typecheck, optimized build pass; 895 tests pass, two opt-in provider checks skipped. Initial public catalog → Canon R50 detail navigation succeeded. Browser switched to the user-requested Chrome extension profile before further signed-in testing.

- 2026-09-26 / AUD-047: actual browser reproduces lost guest dates after Back/reload; verified fix with signed-in Sep 28–30 checkout/Back/reload, incomplete Sep 29 selection clearing old recovery, and guest Sep 29–Oct 2 sign-in/Back. Desktop restored-schedule screenshot inspected. 320×740 calendar fits and Escape returns focus to its trigger. Main detail image has eager loading. Synthetic renter's existing details save and reload successfully; telephone values are redacted by browser text inspection but visible in the screenshot. No real contact or payment.
- Remaining access limits: localhost sign-in security widget returns error 110200, so successful CAPTCHA/OTP remains unverified. The supported Development session establishes the existing synthetic renter without email. Current Supabase dashboard session lacks CamNook project access; bootstrap admin UUID is absent from Development Auth, so it is not an owner test identity. Owner lifecycle coverage remains pending verified owner access.
- 2026-09-26 / AUD-048: actual checkout with complete contact/purpose/city but missing meetup initially produced no feedback. Fix verified by native validation bubble and radio focus, followed by successful review after selection with retained values. The same synthetic rental draft survived refresh and Address → save → checkout. No rental request was submitted. Full suite: 899 passed, two skipped; lint/typecheck/build pass.
- 2026-09-26 / ENV-003 follow-up: normal unchanged saves succeed. A genuine changed address plus reconfirmed synthetic pin saves in the first tab; stale second-tab submit and one retry each time out with generic guidance. Latest persisted revision survives; original synthetic house Audit 13 restored and reload-verified. Conflict-message recovery remains unverified, with runtime cause unresolved and no management access for hosted investigation.
- 2026-09-26 / AUD-049: long valid purpose URL made the mobile review grid overflow. Explicit mobile track verified at 320 and 390 with no horizontal overflow; full screenshot confirms long text wraps. Desktop 1440 retains two columns and no overflow. Edit/review retains fields; mobile summary expands/collapses. Invalid calendar-date checkout link fails closed and Browse cameras returns to the catalog.
- 2026-09-26 / ENV-003 resolved: restored dashboard access enabled confirmation of PostgREST 14.5 retry loops. Tested migration applied only to Development. Real two-tab revision conflict returns recovery guidance in 732ms, retains stale entered fields, and preserves the latest saved revision. Original synthetic address restored and reload-verified. Post-fix KYC retry session count zero. All 907 tests pass, two skipped; SQL atomicity/permissions tests, lint/typecheck/build pass. Owner identity can now be verified from the authoritative Development admin table without granting a new role.
- 2026-09-26 / owner access: supported existing-owner session passes the real `/admin` guard. Inventory lists both Development cameras. Synthetic test-camera duplicate accessory entries are rejected with clear correction guidance while retaining the edited description and included-item text. Correcting accessories saves successfully; reload preserves the edit. Original description restored with Save camera and continue. No defect found in that recovery path; no new camera, publication, rental, or payment.
- 2026-09-26 / owner date blocks: reversed range rejected with entered dates retained; valid Oct 10–12 synthetic block persisted through reload and used the expected inclusive-through boundary. Overlapping Oct 11–13 rejected with entered dates retained. Removed only the audit block; reload confirms no active/upcoming blocks. One Chrome CDP reload timeout recovered by observing the existing tab; no duplicate operation submitted.
- 2026-09-26 / owner overdue review: existing synthetic request correctly disables approval after pickup time, explains schedule replacement, and rejects a one-character rejection reason while preserving it. No booking decision made. Queue counts reconcile: five booking reviews plus one cancellation review.
- 2026-09-26 / AUD-050: submitted a new future synthetic request, verified renter persistence, owner queue visibility and approval, then renter unsigned agreement. Empty signature consent is focused by native validation. Owner replacement invalid-date recovery exposed discarded drafts; fixed and verified corrected version 2 persists after reload. Synthetic booking remains CONTRACT_PENDING; no signature or payment recorded. Stale renter version 1 tab retained for next recovery test.
- 2026-09-26 / AUD-051: stale renter version 2 after owner version 3 initially timed out with indeterminate signing guidance. Tested API normalization applied only to Development; fresh stale version 3 after owner version 4 now yields precise changed-agreement guidance, refreshes version 4 unsigned, and clears consent. Action duration fell from 33.6s to 4.867s. Migration readback confirms expected grants and zero signing retries. 913 tests pass/two skipped, all-migration SQL lifecycle regression, lint/typecheck/build and review pass. Extra explicit reload/post-retest SQL check interrupted by repeated Chrome connection timeouts; no repeat signing attempted.
- 2026-09-26 / connection recovery and cancellation: supported checks confirm the requested Default Chrome profile extension is installed/enabled and native-host manifest valid; discovery retry restores the same extension. Reload verifies unsigned version 4 and unchecked consent. Blank-looking renter cancellation reason gets field guidance, corrected request reaches owner queue; owner invalid-reason guidance works and acceptance cancels the synthetic booking. Renter sees cancelled, accepted, zero fee/refund and no signing/cancellation actions. Read-only Development SQL confirms zero signatures, zero active reservation blocks and zero signing retry sessions. Historical agreement remains issued; booking-state authorization makes it non-actionable. No defect found in this lifecycle path.
- 2026-09-26 / reports: reversed range retains entered dates, rejects the range and loads no fallback financial data. Correcting to Oct 1–Nov 1 yields the expected 31-day zero-activity period. Settings loads expected Development configuration. AUD-052: duplicate contract-template version exposed lost drafts; fixed and browser-verified preservation, idempotent recovery and success reset without activating new terms.

- 2026-09-26 / meetup setup: public search populates coordinates/address; editing a coordinate clears confirmation and blocks Save. Created one synthetic Cebu I.T. Park meetup, edited instructions, and rejected a stale second-tab edit while retaining its draft and the latest persisted revision. AUD-053 discovered and fixed native checkbox reset during camera assignment; add/save/reload and removal/save/reload verified, with original empty camera assignment restored. No existing meetup or other camera assignment changed.
- Synthetic meetup cleanup: removed its test-camera assignment, archived only the new Cebu I.T. Park fixture, and reloaded to confirm it is absent. Existing Ayala public meetup remains active.
- 2026-09-26 / publication and gallery: incomplete synthetic camera shows missing owner readiness checks and public “Not available to rent” with browse recovery. Listing details closes on Escape and restores trigger focus. Canon gallery opens photo 2 from its thumbnail; Right advances to 3 then wraps to 1; Escape restores the original thumbnail focus. No defect found in these paths.
- 2026-09-26 / AUD-054: archived stale meetup edit exposed cleared confirmation with enabled Save. Fixed failure retention and edit-triggered reconfirmation; actual rejected short-name create recovers successfully after correction, and a subsequent fixture edit persists. New unassigned fixture archived and absent after reload; all audit meetup cleanup is complete.
- 2026-09-26 / new-camera draft: empty submission focuses required camera name with native guidance. Whitespace-only name is rejected by server; description, prices and accessory draft remain intact. No camera created or published. Continuing to owner Settings configuration recovery.
- 2026-09-26 / AUD-055: GCash whitespace-name validation exposed native draft reset; fixed and browser error retention verified. Corrected original recipient is rejected by the SQL API despite valid canonical phone normalization (AUD-056). Live original recipient values remain unchanged; no payment or new recipient.
- 2026-09-26 / AUD-056: live SQL confirms over-escaped GCash canonical-phone regex. Real PostgreSQL red/green regression covers both accepted formats, invalid inputs, no mutation, audit/version idempotency and the full reconciliation lifecycle. Tested migration applied to Development only; owner corrects the original recipient successfully and reload retains it as +639170000000 (same identity/account). AUD-055 corrected retry is now end-to-end verified. No payment.
- AUD-056 final checks: same-value browser retry shows success; read-only SQL confirms configuration version and audit-event count both remain 2. Full serial suite passes (918 tests/two skipped). No remaining synthetic cleanup.
- 2026-09-26 / handoff setup: complete Region VII → Cebu → City of Cebu → Lahug selection enables Save. Invalid 25:00 and duplicate 09:00 times are rejected with all draft choices retained. Changing parent region clears province/city/barangay and disables Save. Left unsaved; synthetic camera remains unconfigured. Mobile owner inventory at 320px has matching document client/scroll width 305px, wrapped camera names, and usable actions; navigation uses its own horizontal scroll.
- Mobile owner continuation: Today, booking review queue, and overdue request details all have document client/scroll width 305px at 320px. Queue link lands at the intended section; browser Back restores its position. Approval correctly disabled for elapsed pickup dates. Reports measured 305/305 before extension pipe disconnected; visual report inspection incomplete.
- Reports mobile completed after supported Chrome recovery: 305/305 document width; stacked filters/summary fit, camera table scrolls horizontally within its container to acquisition cost/lifetime totals, and calculation notes expand. Default viewport restored and verified. Same Default/John lester profile reconnected after helper opened a blank window; existing audit tabs were gone, so local app reopened in the recovery tab.
- 2026-09-26 / AUD-057: real Account name validation reset visible address dropdowns while hidden state remained selected. Fixed and verified all four retained selections, native future-birthdate blocking, corrected unchanged save and reload. Shared checkout rejection returns focus to Details, then correction preserves Address choices. Real-selector regressions cover both modes; 56 KYC/location and 234 serial booking tests pass.
- AUD-057 checkout recovery completed: corrected original details save and redirect back to rental plans with Sep 29–30 at 09:00 retained. No request submitted. Original renter identity/address remains unchanged.

- 2026-09-26 / AUD-058: checkout draft across real second-tab sign-out reproduced an HTML redirect/error boundary. Fixed action protocol routing; inline session guidance, retained personal/address draft, supported sign-in, unchanged-profile retry and schedule recovery verified in Chrome. Normal protected-page redirects remain covered.

- Renter owner-route guard: direct /admin redirects to clear Access denied page; Go to your rentals returns to Account. No owner content exposed.

- 2026-09-26 / AUD-059: synthetic owner camera draft → sign out elsewhere → inline auth recovery; switch to renter → save remains denied with draft retained; restore owner → unchanged draft saves and persists after reload; original description restored through save-and-continue. Regression covers create/edit/photo/publish/unpublish/block/remove-block authentication failures without mutation.

- 2026-09-26 / AUD-060: meetup draft across second-tab sign-out now retains fields and confirmed pin with access guidance; signed-out search finishes without provider use. Restored owner saves unchanged draft; reload shows new place; archive and reload confirm cleanup. All synthetic meetup additions remain unassigned and archived.

- 2026-09-26 / manual availability boundary continuation (before main reconciliation): reversed Sep30→Sep29 rejected with dates retained; Sep30→Oct1 persisted with exclusive Oct2midnight PHT endpoint; overlapping Oct1→Oct2 rejected; adjacent single-day Oct2 accepted. Stale second-tab removal gave recovery guidance. Removed both audit blocks and reloaded to confirm empty active/upcoming blocks. No defect or pending cleanup.
- 2026-09-26 / main reconciliation: fresh worktree at accae35 preserves Profile/rentals split and address autofill. Full unchanged-main suite1121pass/1timing failure/3skip; affected photo test rerun6/6pass unchanged. All97 migrations and SQL008/009/022 pass in disposable socket-only PostgreSQL17.

- 2026-09-26 / reconciliation browser checks: Back from sign-in restores Sep29–30/09:00 schedule. Second-tab sign-out followed by checkout profile save shows inline sign-in guidance, retains Visayas/Cebu/City of Cebu/Lahug and address fields; restored renter retries unchanged profile successfully, returning to retained rental-plan draft. No request submitted. Attempted320px review check actually measured1470px; do not count as mobile verification. Viewport override reset.
- User stop checkpoint: lint/typecheck/build pass; focused44pass plus unchanged isolated schedule3/3pass; independent diff review found no actionable regression. Final full-suite rerun interrupted on request. Carry-forward edits uncommitted; latest-main mobile and meetup browser rechecks incomplete.

- Final integration verification: actual320px checkout review has305px usable and scroll width; fresh screenshots confirm complete meetup text and long unbroken purpose wrapping, with usable Edit/Submit controls. Normal viewport restored; no rental request submitted. Synthetic camera meetup add/save/reload and remove/save/reload both retain matching checkbox state; original empty assignments restored. Signed-out owner search returns inline authorization guidance and retains its query.
- Fresh integration suite:159 files/1139 tests pass,3 opt-in skips; no failures. Fresh disposable PostgreSQL applies all97 migrations and passes SQL008/009/022. Frozen launch-evidence structure validates; its historical NO_GO is not relabeled as current hosted verification.

## 2026-09-26 Windows resume

- Public Production read-only: catalog → Canon EOS R50 detail → date dialog. Past dates and weekends disabled by current policy. Selected Sept28–29 and09:00; schedule appears in URL; Continue to checkout redirects guest to login with full schedule in next parameter. No OTP, booking, or other Production write attempted.
- Desktop screenshot inspected for camera details and guest sign-in; no visual defect observed in these states.
- Baseline on e4487ec with Node24.19.0: lint/typecheck pass; full suite1128pass,14skip across158pass/4skip files (327.89s). Build and local authenticated journeys pending configuration.

- AUD062: repaired startup launches real Development app on Windows using Node24.19.0. Actual catalog loads; full post-fix suite1131pass/14skip. Synthetic Profile initial values and invalid-name recovery inspected; all address selections retained.320px Profile overflow found for next cycle.

- AUD063 Profile responsive verification: before320px client305/scroll358; after320px305/305,390px375/375,1440px1425/1425. Screenshots confirm fields fit mobile and remain two columns on desktop. Real synthetic invalid-name recovery, correction save and full reload pass without changing stored values.10 focused tests and lint/typecheck pass. Optimized build baseline passed immediately before this one-class change.

- AUD063 committed asd14c46c. Continue into renter rental history and checkout. Existing expired-pickup request shows correct next-action guidance; Choose new dates returns to catalog. No booking state changed.

- AUD064: both checkout Details and rental-plan contact fields fixed from305/345 to305/305 at320px,375/375 at390px; desktop1425/1425. Address fits unchanged. Missing meetup validation/focus, long-purpose review, edit/back draft persistence and same-schedule address-save redirect verified.29 focused tests, lint/typecheck/build pass. No new rental request.

- AUD065: real Windows pnpm dev:setup now downloads/reconstructs verified Development-only configuration and passes live dependencies. Full cumulative suite1134pass/14skip; lint passes.
- Checkout saved-pin edit: invalid latitude999 shows guidance and aria-invalid=true; Cancel restores saved pin and focuses Adjust map pin. No pin saved or changed. Privacy link opens a separate local notice tab; original checkout remains open. Expanded notice fits320px305/305. No issue found in these states.
